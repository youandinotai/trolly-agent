import path from 'node:path';

import type { ComfyPromptGraph } from './comfyui.js';
import {
  AFTER_DARK_DEFAULT_NEGATIVE,
  AFTER_DARK_DEFAULT_POSITIVE,
  AFTER_DARK_SAFETY_NEGATIVE,
} from './after-dark-shared.js';

export { AFTER_DARK_DEFAULT_NEGATIVE, AFTER_DARK_DEFAULT_POSITIVE, AFTER_DARK_SAFETY_NEGATIVE } from './after-dark-shared.js';

export interface AfterDarkPreferences {
  ageVerified: boolean;
  adultContent: boolean;
}

export interface AfterDarkWorkflowOptions {
  positive: string;
  negative?: string;
  referenceImage: string;
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

const AFTER_DARK_DEFAULTS = {
  checkpoint: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
  seed: 42,
  width: 832,
  height: 1216,
  steps: 30,
  cfg: 6.5,
  sampler: 'dpmpp_2m_sde',
  scheduler: 'karras',
  denoise: 0.72,
};

/** The renderer cannot unlock this on its own; the Electron main process calls it too. */
export function assertAfterDarkAllowed(prefs: AfterDarkPreferences, currentSessionAdult = false): void {
  if (!prefs?.ageVerified) throw new Error('Complete the age check in Mind before using After Dark.');
  if (!prefs.adultContent) throw new Error('Enable adult content in Mind before using After Dark.');
  if (!currentSessionAdult) throw new Error('Adult content is not unlocked in the current session.');
}

/** Fixed product boundaries, independent of model or user prompt. */
export function assertAfterDarkPrompt(prompt: string): void {
  const value = String(prompt ?? '').trim();
  if (!value) throw new Error('A positive prompt is required.');
  if (/\b(underage|minor|child|loli|shota|preteen|jailbait|young[-\s]?looking|schoolgirl|schoolboy|high\s+school|infant|toddler|baby)\b/i.test(value)) {
    throw new Error('After Dark is for clearly depicted legal adults only.');
  }
  const legalAdultTeen = /\b(?:18|19)[-\s]+year[-\s]?old\b/i.test(value) || /\badult\s+teen\b/i.test(value);
  if (/\bteen\b/i.test(value) && !legalAdultTeen) {
    throw new Error('State that the person is a legal adult (18 or 19) instead of using an ambiguous age description.');
  }
  if (/\b(non[-\s]?consensual|rape|raped|coercion|coerced|unwilling|unconscious|drugged|incapacitated|blackmail|trafficking)\b/i.test(value)) {
    throw new Error('After Dark allows consensual adults only.');
  }
  if (/\b(incest|bestiality|zoophilia|animal\s+sex|celebrity|deepfake|revenge\s+porn|hidden\s+camera|exploitation)\b/i.test(value)) {
    throw new Error('After Dark rejected exploitative or prohibited content.');
  }
  if (/\b(gore|gory|violence|torture|mutilation|dismemberment|snuff|corpse|self[-\s]?harm|suicide|choking|strangling|bloodshed|bloody)\b/i.test(value)) {
    throw new Error('After Dark does not allow gore, self-harm, or extreme violence.');
  }
}

/**
 * Build a Pony/SDXL img2img graph. SaveImageWebsocket returns pixels directly to
 * Electron so ComfyUI never writes an explicit render into its output directory.
 */
export function buildAfterDarkWorkflow(options: AfterDarkWorkflowOptions): ComfyPromptGraph {
  assertAfterDarkPrompt(options?.positive);
  if (!options?.referenceImage?.trim()) throw new Error('A reference image is required.');
  const opt = { ...AFTER_DARK_DEFAULTS, ...options };
  if (!Number.isFinite(opt.denoise) || opt.denoise <= 0 || opt.denoise > 1) {
    throw new Error('denoise must be greater than 0 and no more than 1');
  }
  for (const [name, value] of [['width', opt.width], ['height', opt.height], ['steps', opt.steps]] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  }

  return {
    prompt: {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: opt.checkpoint } },
      '2': { class_type: 'LoadImage', inputs: { image: opt.referenceImage } },
      '3': { class_type: 'VAEEncode', inputs: { pixels: ['2', 0], vae: ['1', 2] } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: opt.positive, clip: ['1', 1] } },
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: [AFTER_DARK_SAFETY_NEGATIVE, opt.negative ?? AFTER_DARK_DEFAULT_NEGATIVE].join(', '),
          clip: ['1', 1],
        },
      },
      '6': {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['3', 0],
          seed: opt.seed, steps: opt.steps, cfg: opt.cfg,
          sampler_name: opt.sampler, scheduler: opt.scheduler, denoise: opt.denoise,
        },
      },
      '7': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
      '8': { class_type: 'SaveImageWebsocket', inputs: { images: ['7', 0] } },
    },
  };
}

/** Adult renders live outside every source tree, in the dedicated D: adult lane. */
export function resolveAfterDarkOutputDir(
  env: Record<string, string | undefined>,
  appRoot: string,
): string {
  const dir = path.resolve(env.TROLLY_AFTER_DARK_DIR || 'D:/Trolly/data/after-dark');
  if (!/^d:/i.test(dir)) throw new Error('After Dark output must be on the D: drive.');
  const relative = path.relative(path.resolve(appRoot), dir);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('After Dark output must be outside the application source tree.');
  }
  return dir;
}

/** Strip ComfyUI's two uint32 websocket headers and verify the remaining payload. */
export function imageBytesFromWebsocket(packet: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(packet);
  if (bytes.byteLength < 9) throw new Error('ComfyUI websocket image packet is too short.');
  const image = bytes.slice(8);
  const png = image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47;
  const jpeg = image[0] === 0xff && image[1] === 0xd8;
  if (!png && !jpeg) throw new Error('ComfyUI websocket payload is not a PNG or JPEG image.');
  return image;
}
