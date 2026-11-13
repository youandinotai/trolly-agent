import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_VOICE, FEMALE_VOICES, isNaturalVoice, type SpeechVoice } from '../../src/lib/voices.js';

export interface SpeechStatus {
  state: 'idle' | 'loading' | 'ready' | 'generating' | 'error';
  message: string;
}

type StatusListener = (status: SpeechStatus) => void;

/** Natural local Kokoro speech. Model and WAV files stay on D:. */
export class SpeechClient {
  private readonly dataDir: string;
  private readonly onStatus?: StatusListener;
  private modelPromise: Promise<any> | null = null;
  private lastProgress = -1;

  constructor(dataDir: string, onStatus?: StatusListener) {
    this.dataDir = dataDir;
    this.onStatus = onStatus;
  }

  private notify(state: SpeechStatus['state'], message: string) {
    this.onStatus?.({ state, message });
  }

  async voices(): Promise<SpeechVoice[]> {
    return [...FEMALE_VOICES];
  }

  private async model(): Promise<any> {
    if (this.modelPromise) return this.modelPromise;
    this.notify('loading', 'Preparing the natural voice model… first use downloads once.');
    this.modelPromise = (async () => {
      const [{ KokoroTTS }, { env }] = await Promise.all([
        import('kokoro-js'),
        import('@huggingface/transformers'),
      ]);
      const cacheDir = path.join(this.dataDir, 'models', 'huggingface');
      fs.mkdirSync(cacheDir, { recursive: true });
      env.cacheDir = cacheDir;
      env.allowRemoteModels = true;
      env.allowLocalModels = true;
      const model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'cpu',
        progress_callback: (progress: any) => {
          if (progress?.status !== 'progress' || !Number.isFinite(progress.progress)) return;
          const percent = Math.floor(progress.progress / 10) * 10;
          if (percent !== this.lastProgress) {
            this.lastProgress = percent;
            this.notify('loading', `Downloading natural voices · ${percent}%`);
          }
        },
      });
      this.notify('ready', 'Natural voices ready');
      return model;
    })();
    try {
      return await this.modelPromise;
    } catch (error: any) {
      this.modelPromise = null;
      this.notify('error', `Natural voice model failed: ${error?.message ?? error}`);
      throw error;
    }
  }

  async speak(
    text: string,
    opts: { voice?: string; rate?: number; volume?: number } = {},
  ): Promise<{ file: string; bytes: number; voice: string; audioBase64: string }> {
    const clean = String(text ?? '').trim();
    if (!clean) throw new Error('nothing to speak');
    const voice = opts.voice && isNaturalVoice(opts.voice) ? opts.voice : DEFAULT_VOICE;
    const spoken = clean
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/[*_`#>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
    const rate = Math.max(-10, Math.min(10, opts.rate ?? 0));
    const speed = Math.max(0.6, Math.min(1.6, 1 + rate / 20));

    const model = await this.model();
    this.notify('generating', `Speaking with ${FEMALE_VOICES.find((item) => item.id === voice)?.name ?? 'Heart'}`);
    const outDir = path.join(this.dataDir, 'speech');
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `trolly_${Date.now()}.wav`);
    const audio = await model.generate(spoken, { voice, speed });
    await audio.save(file);
    if (!fs.existsSync(file)) throw new Error('Kokoro produced no audio file');
    const bytes = fs.readFileSync(file);
    if (bytes.byteLength < 44) throw new Error('Kokoro produced an invalid WAV file');
    this.notify('ready', 'Natural voices ready');
    return { file, bytes: bytes.byteLength, voice, audioBase64: bytes.toString('base64') };
  }
}
