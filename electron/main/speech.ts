import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Offline speech synthesis via the Windows SAPI voice set (System.Speech).
 * No network, no model download, no cloud API — the OS already ships the
 * voices, so the app can talk without leaving the machine.
 */
export class SpeechClient {
  constructor(
    private readonly dataDir: string,
    private readonly psExe = 'powershell.exe',
  ) {}

  /** List the installed SAPI voices. */
  async voices(): Promise<{ name: string; culture: string }[]> {
    const script = [
      'Add-Type -AssemblyName System.Speech;',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      '$s.GetInstalledVoices() | ForEach-Object {',
      '  $_.VoiceInfo.Name + "`t" + $_.VoiceInfo.Culture',
      '}',
    ].join(' ');

    try {
      const { stdout } = await execFileAsync(
        this.psExe,
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 30_000, windowsHide: true },
      );
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, culture = ''] = line.split('\t');
          return { name: name.trim(), culture: culture.trim() };
        })
        .filter((v) => v.name);
    } catch (err: any) {
      throw new Error(`SAPI voice enumeration failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Synthesize text to a WAV file on disk and return its path.
   * The file lives under the app's D: data dir so nothing lands on C:.
   */
  async speak(
    text: string,
    opts: { voice?: string; rate?: number; volume?: number } = {},
  ): Promise<{ file: string; bytes: number; voice: string }> {
    const clean = String(text ?? '').trim();
    if (!clean) throw new Error('nothing to speak');

    const outDir = path.join(this.dataDir, 'speech');
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `trolly_${Date.now()}.wav`);

    // Strip characters the TTS engine stumbles over, and cap the length so a
    // long reply does not block the UI while it renders.
    const spoken = clean
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/[*_`#>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);

    const voice = opts.voice ?? '';
    const rate = Math.max(-10, Math.min(10, opts.rate ?? 0));
    const volume = Math.max(0, Math.min(100, opts.volume ?? 100));

    const script = [
      'Add-Type -AssemblyName System.Speech;',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}');` : '',
      `$s.Rate = ${rate};`,
      `$s.Volume = ${volume};`,
      `$s.SetOutputToWaveFile('${file.replace(/'/g, "''")}');`,
      `$s.Speak('${spoken.replace(/'/g, "''")}');`,
      '$s.Dispose();',
    ]
      .filter(Boolean)
      .join(' ');

    await execFileAsync(
      this.psExe,
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 120_000, windowsHide: true },
    );

    if (!fs.existsSync(file)) throw new Error('SAPI produced no audio file');
    return { file, bytes: fs.statSync(file).size, voice: voice || 'system default' };
  }
}
