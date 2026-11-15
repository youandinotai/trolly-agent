/**
 * ComfyUI client helpers — workflow graph construction and history parsing.
 *
 * Trolly Agent's "Artistry" feature talks to a ComfyUI backend (default
 * http://127.0.0.1:8188) to render the character's images.
 */

export interface Txt2ImgOptions {
  positive: string;
  negative?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  checkpoint?: string;
  vae?: string;
  sampler?: string;
  scheduler?: string;
  filenamePrefix?: string;
}

export interface LtxvVideoOptions {
  positive: string;
  negative?: string;
  seed?: number;
  width?: number;
  height?: number;
  /** Number of video frames. */
  length?: number;
  frameRate?: number;
  steps?: number;
  cfg?: number;
  checkpoint?: string;
  /** Separate text-encoder weights for the LTXV clip. */
  textEncoder?: string;
  sampler?: string;
  /** Comma separated sigma schedule for the sampler. */
  sigmas?: string;
  filenamePrefix?: string;
}

export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
  /** 'video' for SaveVideo outputs, 'image' otherwise. */
  kind?: string;
}

export interface ComfyPromptGraph {
  prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
}

const DEFAULTS = {
  seed: 42,
  width: 832,
  height: 1216,
  steps: 20,
  cfg: 6.5,
  checkpoint: 'model.safetensors',
  vae: 'vae.safetensors',
  sampler: 'euler',
  scheduler: 'normal',
  filenamePrefix: 'trolly',
  negative: 'blurry, low quality, distorted, watermark',
};

/** Always appended. Callers cannot drop this by passing their own negative. */
export const SAFETY_NEGATIVE = [
  'blood, bloody, gore, gory, violence, torture, mutilation, dismemberment',
  'snuff, corpse, injury, wounds, weapons, self-harm, suicide',
  'underage, minor, child, loli, shota, non-consensual, rape',
].join(', ');

function withSafetyNegative(negative: string | undefined, fallback: string): string {
  const base = (negative && negative.trim()) || fallback;
  return base.includes('gore') ? base : `${base}, ${SAFETY_NEGATIVE}`;
}

const LTXV_DEFAULTS = {
  seed: 42,
  width: 512,
  height: 512,
  length: 25,
  frameRate: 25,
  steps: 12,
  cfg: 3.0,
  checkpoint: 'ltx-2.3-22b-distilled-fp8.safetensors',
  textEncoder: 'gemma_3_12B_it_fp4_mixed.safetensors',
  sampler: 'euler',
  sigmas: '0.85, 0.7250, 0.4219, 0.0',
  filenamePrefix: 'trolly_video',
  negative: 'low quality, worst quality, deformed, distorted, motion smear',
};

function requirePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got ${value}`);
  }
  return value;
}

/**
 * Build a standard txt2img ComfyUI prompt graph.
 * Node ids are stable so the graph is reproducible across runs.
 */
/**
 * Z-Image Turbo text-to-image graph.
 *
 * This machine has no Stable Diffusion checkpoint, so the classic
 * checkpoint -> KSampler chain cannot run. Z-Image Turbo is a standalone
 * diffusion model (diffusion_models/) with its own Qwen3-VL text encoder and
 * a separate VAE, so it needs UNETLoader + ModelSamplingAuraFlow rather than
 * CheckpointLoaderSimple.
 *
 * Chain mirrors ComfyUI's shipped `image_z_image_turbo.json` template.
 */
export interface ZImageOptions {
  positive: string;
  negative?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  filenamePrefix?: string;
  /** diffusion_models/ entry. */
  unetName?: string;
  /** text_encoders/ entry loaded with type 'lumina2'. */
  textEncoder?: string;
  /** vae/ entry. */
  vaeName?: string;
}

const ZIMAGE_DEFAULTS = {
  seed: 42,
  width: 1024,
  height: 1024,
  steps: 8,
  cfg: 1,
  sampler: 'res_multistep',
  scheduler: 'simple',
  filenamePrefix: 'trolly_image',
  negative: '',
  unetName: 'z_image_turbo_bf16.safetensors',
  textEncoder: 'qwen_3_4b.safetensors',
  vaeName: 'ae.safetensors',
};

export function buildZImageWorkflow(options: ZImageOptions): ComfyPromptGraph {
  if (!options?.positive || !options.positive.trim()) {
    throw new Error('positive prompt is required');
  }
  const opt = { ...ZIMAGE_DEFAULTS, ...options };
  requirePositive(opt.width, 'width');
  requirePositive(opt.height, 'height');
  requirePositive(opt.steps, 'steps');

  const prompt: ComfyPromptGraph['prompt'] = {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: opt.unetName, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: opt.textEncoder, type: 'lumina2', device: 'default' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: opt.vaeName },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: opt.positive, clip: ['2', 0] },
    },
    '5': {
      // Z-Image Turbo is a distilled model: the negative prompt is zeroed out.
      class_type: 'ConditioningZeroOut',
      inputs: { conditioning: ['4', 0] },
    },
    '6': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['1', 0], shift: 3 },
    },
    '7': {
      class_type: 'EmptySD3LatentImage',
      inputs: { width: opt.width, height: opt.height, batch_size: 1 },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['6', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['7', 0],
        seed: opt.seed,
        steps: opt.steps,
        cfg: opt.cfg,
        sampler_name: opt.sampler,
        scheduler: opt.scheduler,
        denoise: 1,
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: opt.filenamePrefix },
    },
  };

  return { prompt };
}

export function buildTxt2ImgWorkflow(options: Txt2ImgOptions): ComfyPromptGraph {
  if (!options?.positive || !options.positive.trim()) {
    throw new Error('positive prompt is required');
  }
  const opt = { ...DEFAULTS, ...options, negative: withSafetyNegative(options.negative, DEFAULTS.negative) };
  requirePositive(opt.width, 'width');
  requirePositive(opt.height, 'height');

  const prompt: ComfyPromptGraph['prompt'] = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: opt.checkpoint },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: opt.positive, clip: ['1', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: opt.negative, clip: ['1', 1] },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: opt.width, height: opt.height, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: opt.seed,
        steps: opt.steps,
        cfg: opt.cfg,
        sampler_name: opt.sampler,
        scheduler: opt.scheduler,
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: opt.filenamePrefix, images: ['6', 0] },
    },
  };

  return { prompt };
}

/**
 * Find the first saved image for a prompt id inside a /history response.
 */
/**
 * Build an LTXV text-to-video prompt graph.
 *
 * The local checkpoint on this machine (ltx-2.3-22b-distilled) is a VIDEO
 * model, so a plain txt2img graph cannot run it. This graph is the LTXV
 * chain: checkpoint -> model sampling -> text encode -> LTXV conditioning ->
 * empty latent video -> sampler -> VAE decode -> animated save.
 */
export function buildLtxvVideoWorkflow(options: LtxvVideoOptions): ComfyPromptGraph {
  if (!options?.positive || !options.positive.trim()) {
    throw new Error('positive prompt is required');
  }
  const opt = { ...LTXV_DEFAULTS, ...options, negative: withSafetyNegative(options.negative, LTXV_DEFAULTS.negative) };
  requirePositive(opt.width, 'width');
  requirePositive(opt.height, 'height');
  requirePositive(opt.length, 'length');

  // Chain mirrors ComfyUI's shipped LTX-2.3 text-to-video template:
  //   checkpoint -> text encode -> LTXV conditioning -> crop guides (needs the
  //   latent so the guide matches the frame count) -> CFG guider ->
  //   SamplerCustomAdvanced -> VAE decode -> CreateVideo -> SaveVideo.
  const prompt: ComfyPromptGraph['prompt'] = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: opt.checkpoint },
    },
    '2': {
      // The LTX-2.3 text encoder is loaded against the checkpoint itself,
      // not as a standalone CLIP.
      class_type: 'LTXAVTextEncoderLoader',
      inputs: {
        text_encoder: opt.textEncoder,
        ckpt_name: opt.checkpoint,
        device: 'default',
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: opt.positive, clip: ['2', 0] },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: opt.negative, clip: ['2', 0] },
    },
    '5': {
      class_type: 'LTXVConditioning',
      inputs: { positive: ['3', 0], negative: ['4', 0], frame_rate: opt.frameRate },
    },
    '6': {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: { width: opt.width, height: opt.height, length: opt.length, batch_size: 1 },
    },
    '7': {
      class_type: 'LTXVCropGuides',
      inputs: { positive: ['5', 0], negative: ['5', 1], latent: ['6', 0] },
    },
    '8': {
      class_type: 'CFGGuider',
      inputs: {
        model: ['1', 0],
        positive: ['7', 0],
        negative: ['7', 1],
        cfg: opt.cfg,
      },
    },
    '9': {
      class_type: 'KSamplerSelect',
      inputs: { sampler_name: opt.sampler },
    },
    '10': {
      class_type: 'RandomNoise',
      inputs: { noise_seed: opt.seed },
    },
    '11': {
      class_type: 'ManualSigmas',
      inputs: { sigmas: opt.sigmas },
    },
    '12': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['10', 0],
        guider: ['8', 0],
        sampler: ['9', 0],
        sigmas: ['11', 0],
        latent_image: ['6', 0],
      },
    },
    '13': {
      class_type: 'VAEDecode',
      inputs: { samples: ['12', 0], vae: ['1', 2] },
    },
    '14': {
      class_type: 'CreateVideo',
      inputs: { images: ['13', 0], fps: opt.frameRate },
    },
    '15': {
      class_type: 'SaveVideo',
      inputs: { video: ['14', 0], filename_prefix: opt.filenamePrefix, format: 'auto' },
    },
  };

  return { prompt };
}

export function parseComfyHistoryImage(
  history: Record<string, any> | null | undefined,
  promptId: string,
): ComfyImageRef | null {
  if (!history || typeof history !== 'object') return null;
  const entry = history[promptId];
  if (!entry?.outputs) return null;
  for (const output of Object.values(entry.outputs) as any[]) {
    const images = output?.images;
    if (Array.isArray(images) && images.length > 0) {
      const first = images[0];
      return {
        filename: first.filename,
        subfolder: first.subfolder ?? '',
        type: first.type ?? 'output',
        kind: first.metadata?.kind,
      };
    }
  }
  return null;
}

/** Build the /view URL for a saved image. */
export function comfyViewUrl(baseUrl: string, image: ComfyImageRef): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type ?? 'output',
  });
  return `${baseUrl.replace(/\/+$/, '')}/view?${params.toString()}`;
}

/**
 * Submit a graph and wait for the image.
 * @param {string} baseUrl ComfyUI backend root
 */
export async function generateImage(
  baseUrl: string,
  graph: ComfyPromptGraph,
  { pollMs = 1500, timeoutMs = 300000 }: { pollMs?: number; timeoutMs?: number } = {},
): Promise<{ promptId: string; image: ComfyImageRef; url: string }> {
  const root = baseUrl.replace(/\/+$/, '');
  const submit = await fetch(`${root}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph),
  });
  if (!submit.ok) {
    throw new Error(`ComfyUI /prompt failed: ${submit.status} ${await submit.text()}`);
  }
  const submitted = await submit.json();
  const promptId = submitted.prompt_id;
  if (!promptId) throw new Error('ComfyUI did not return a prompt_id');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const res = await fetch(`${root}/history/${promptId}`);
    if (!res.ok) continue;
    const history = await res.json();
    const image = parseComfyHistoryImage(history, promptId);
    if (image) {
      return { promptId, image, url: comfyViewUrl(root, image) };
    }
  }
  throw new Error('ComfyUI generation timed out');
}
