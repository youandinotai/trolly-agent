/**
 * ComfyUI client — the "Artistry" backend for Trolly Agent.
 *
 * Speaks the ComfyUI HTTP API: /system_stats for health, /prompt to submit a
 * graph, /history to poll, /view to read the rendered image.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  buildLtxvVideoWorkflow,
  buildTxt2ImgWorkflow,
  buildZImageWorkflow,
  comfyViewUrl,
  parseComfyHistoryImage,
} from '../../src/lib/comfyui.js';

export interface GenerateOptions {
  positive: string;
  negative?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  checkpoint?: string;
  filenamePrefix?: string;
  mode?: 'image' | 'video';
  /** Video duration in seconds (video mode). */
  duration?: number;
  frameRate?: number;
  generateAudio?: boolean;
}

export class ComfyClient {
  constructor(private baseUrl = 'http://127.0.0.1:8188') {}

  private url(p: string) {
    return `${this.baseUrl.replace(/\/+$/, '')}${p}`;
  }

  /** Read the checkpoint names the running ComfyUI actually has. */
  async listCheckpoints(): Promise<string[]> {
    try {
      const res = await fetch(this.url('/object_info/CheckpointLoaderSimple'), {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Every model the running ComfyUI actually has, grouped by kind. The app
   * must offer what is installed, not a hardcoded list.
   */
  async inventory(): Promise<{ checkpoints: string[]; diffusionModels: string[]; textEncoders: string[]; vaes: string[] }> {
    const get = async (folder: string): Promise<string[]> => {
      try {
        const res = await fetch(this.url(`/models/${folder}`));
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data.map(String) : [];
      } catch {
        return [];
      }
    };
    const [checkpoints, diffusionModels, textEncoders, vaes] = await Promise.all([
      get('checkpoints'),
      get('diffusion_models'),
      get('text_encoders'),
      get('vae'),
    ]);
    return { checkpoints, diffusionModels, textEncoders, vaes };
  }

  /** Files the backend has already written, newest first. */
  async outputs(limit = 40): Promise<{ filename: string; url: string }[]> {
    try {
      const res = await fetch(this.url('/history?max_items=' + limit));
      if (!res.ok) return [];
      const data = await res.json();
      const out: { filename: string; url: string }[] = [];
      for (const entry of Object.values(data as Record<string, any>)) {
        for (const outputs of Object.values(entry?.outputs ?? {})) {
          const anyOut = outputs as any;
          for (const img of anyOut.images ?? []) {
            out.push({ filename: img.filename, url: this.url(`/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder ?? '')}&type=${img.type ?? 'output'}`) });
          }
          for (const vid of anyOut.videos ?? []) {
            out.push({ filename: vid.filename, url: this.url(`/view?filename=${encodeURIComponent(vid.filename)}&subfolder=${encodeURIComponent(vid.subfolder ?? '')}&type=${vid.type ?? 'output'}`) });
          }
        }
      }
      return out.slice(0, limit);
    } catch {
      return [];
    }
  }

  async status() {
    try {
      const res = await fetch(this.url('/system_stats'), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      const device = data?.devices?.[0];
      return {
        online: true,
        comfyuiVersion: data?.system?.comfyui_version,
        device: device?.name,
        vramTotal: device?.vram_total,
        vramFree: device?.vram_free,
      };
    } catch (err: any) {
      return { online: false, error: String(err?.message ?? err) };
    }
  }

  /** Submit a txt2img graph and return the rendered image as a local file. */
  async generate(options: GenerateOptions) {
    const opts = { ...options };
    if (opts.mode !== 'video' && !opts.checkpoint) {
      const [first] = await this.listCheckpoints();
      if (first) opts.checkpoint = first;
    }
    // The builder has to match the model the user picked:
    //  - a full checkpoint (SDXL, so Pony and Illustrious) uses the classic
    //    checkpoint -> KSampler chain;
    //  - a standalone diffusion model (Z-Image Turbo, LTX) has its own
    //    loader and sampler config.
    const chosen = (opts.checkpoint ?? '').toLowerCase();
    const isStandaloneDiffusion = chosen.includes('z_image') || chosen.includes('z-image');

    const graph =
      opts.mode === 'video'
        ? buildLtxvVideoWorkflow(opts as any)
        : isStandaloneDiffusion
          ? buildZImageWorkflow(opts as any)
          : buildTxt2ImgWorkflow(opts as any);

    const submit = await fetch(this.url('/prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph),
    });
    if (!submit.ok) {
      throw new Error(`ComfyUI /prompt failed: ${submit.status} ${(await submit.text()).slice(0, 300)}`);
    }
    const { prompt_id: promptId } = await submit.json();
    if (!promptId) throw new Error('ComfyUI did not return a prompt_id');

    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(this.url(`/history/${promptId}`));
      if (!res.ok) continue;
      const history = await res.json();
      const image = parseComfyHistoryImage(history, promptId);
      if (!image) continue;

      const viewUrl = comfyViewUrl(this.baseUrl, image);
      const fileRes = await fetch(viewUrl);
      if (!fileRes.ok) throw new Error(`ComfyUI /view failed: ${fileRes.status}`);

      const outDir = path.join(process.env.TROLLY_DATA_DIR ?? path.join(process.cwd(), 'data'), 'artistry');
      fs.mkdirSync(outDir, { recursive: true });
      const file = path.join(outDir, image.filename);
      fs.writeFileSync(file, Buffer.from(await fileRes.arrayBuffer()));
      return { promptId, file, url: viewUrl, kind: image.kind ?? 'image' };
    }
    throw new Error('ComfyUI generation timed out');
  }
}
