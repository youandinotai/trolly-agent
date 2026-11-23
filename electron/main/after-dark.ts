import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  AFTER_DARK_DEFAULT_NEGATIVE,
  AFTER_DARK_DEFAULT_POSITIVE,
  assertAfterDarkPrompt,
  buildAfterDarkWorkflow,
  imageBytesFromWebsocket,
} from '../../src/lib/after-dark.js';

import type { AfterDarkSafetyInspector } from './after-dark-safety.js';

export interface AfterDarkGenerateOptions {
  positive?: string;
  negative?: string;
  reference: { name: string; dataBase64: string };
  checkpoint?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  denoise?: number;
}

function historyError(entry: any): string {
  const messages = entry?.status?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.[0] === 'execution_error') {
      const detail = messages[i][1];
      return `${detail?.node_type ?? 'ComfyUI'}: ${detail?.exception_message ?? 'generation failed'}`;
    }
  }
  return 'ComfyUI After Dark generation failed.';
}

/** Local-only Pony img2img with no hosted image API and no ComfyUI output file. */
export class AfterDarkClient {
  private readonly baseUrl: string;
  private readonly outputDir: string;
  private readonly safety: AfterDarkSafetyInspector;

  constructor(baseUrl: string, outputDir: string, safety: AfterDarkSafetyInspector) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.outputDir = outputDir;
    this.safety = safety;
  }

  private url(route: string): string {
    return `${this.baseUrl}${route}`;
  }

  /** Upload only to the local ComfyUI listener; never to a hosted provider. */
  private async uploadReference(reference: { name: string; dataBase64: string }): Promise<string> {
    if (!reference?.dataBase64) throw new Error('Choose a reference image first.');
    const bytes = Buffer.from(reference.dataBase64, 'base64');
    if (!bytes.length || bytes.byteLength > 20 * 1024 * 1024) {
      throw new Error('Reference image must be between 1 byte and 20 MB.');
    }
    const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!png && !jpeg) throw new Error('Reference image must be a PNG or JPEG.');

    const extension = png ? '.png' : '.jpg';
    const filename = `trolly-reference-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const form = new FormData();
    form.append('image', new Blob([arrayBuffer], { type: png ? 'image/png' : 'image/jpeg' }), filename);
    form.append('overwrite', 'false');

    const response = await fetch(this.url('/upload/image'), { method: 'POST', body: form });
    if (!response.ok) throw new Error(`Local reference upload failed: HTTP ${response.status}`);
    const uploaded = await response.json();
    if (!uploaded?.name) throw new Error('ComfyUI did not return the uploaded reference name.');
    return uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  }

  private async openSocket(clientId: string): Promise<WebSocket> {
    const wsUrl = this.url(`/ws?clientId=${encodeURIComponent(clientId)}`).replace(/^http/, 'ws');
    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to the local ComfyUI websocket.')), 10_000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Could not connect to the local ComfyUI websocket.')); };
    });
    return socket;
  }

  async generate(options: AfterDarkGenerateOptions): Promise<{
    promptId: string;
    file: string;
    url: string;
    kind: 'image';
    outputDir: string;
  }> {
    const positive = options.positive?.trim() || AFTER_DARK_DEFAULT_POSITIVE;
    assertAfterDarkPrompt(positive);
    const referenceImage = await this.uploadReference(options.reference);
    const graph = buildAfterDarkWorkflow({
      ...options,
      positive,
      negative: options.negative ?? AFTER_DARK_DEFAULT_NEGATIVE,
      referenceImage,
    });
    const clientId = randomUUID();
    const socket = await this.openSocket(clientId);
    let image: Buffer | null = null;
    let socketError = '';

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') return;
      void (async () => {
        try {
          const packet = event.data instanceof Blob
            ? await event.data.arrayBuffer()
            : event.data instanceof ArrayBuffer
              ? event.data
              : null;
          if (packet) image = Buffer.from(imageBytesFromWebsocket(packet));
        } catch (error: any) {
          socketError = String(error?.message ?? error);
        }
      })();
    };
    socket.onerror = () => { socketError = 'The local ComfyUI websocket failed.'; };

    let promptId = '';
    try {
      const submit = await fetch(this.url('/prompt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...graph, client_id: clientId }),
      });
      if (!submit.ok) throw new Error(`ComfyUI /prompt failed: HTTP ${submit.status} ${(await submit.text()).slice(0, 300)}`);
      const submitted = await submit.json();
      promptId = submitted.prompt_id;
      if (!promptId) throw new Error('ComfyUI did not return a prompt_id.');

      const deadline = Date.now() + 300_000;
      while (Date.now() < deadline) {
        if (socketError) throw new Error(socketError);
        const response = await fetch(this.url(`/history/${encodeURIComponent(promptId)}`));
        if (response.ok) {
          const history = await response.json();
          const entry = history[promptId];
          if (entry?.status?.status_str === 'error') throw new Error(historyError(entry));
          if (entry?.status?.completed && image) {
            const rendered: Buffer = image;
            await this.safety.assertSafe(rendered);
            fs.mkdirSync(this.outputDir, { recursive: true });
            const file = path.join(this.outputDir, `trolly-after-dark-${promptId}.png`);
            fs.writeFileSync(file, rendered);
            if (!fs.statSync(file).size) throw new Error('ComfyUI returned an empty image.');
            return { promptId, file, url: pathToFileURL(file).href, kind: 'image', outputDir: this.outputDir };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(image ? 'ComfyUI rendered an image but did not close the run.' : 'ComfyUI After Dark generation timed out.');
    } finally {
      socket.close();
    }
  }
}
