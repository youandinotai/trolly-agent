const AUDIO_PROMPT = 'Transcribe this audio exactly as spoken. Reply with only the transcript.';
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

export function isLocalAudioTranscriptionRequest(input: unknown): boolean {
  const request = input as {
    purpose?: unknown;
    model?: unknown;
    messages?: { role?: unknown; content?: unknown; images?: unknown }[];
  } | null;
  if (
    request?.purpose !== 'audio-transcription' ||
    typeof request.model !== 'string' ||
    !/(?:whisper|transcribe|stt)/i.test(request.model) ||
    !Array.isArray(request.messages) ||
    request.messages.length !== 1
  ) return false;
  const [message] = request.messages;
  if (
    message?.role !== 'user' ||
    message.content !== AUDIO_PROMPT ||
    !Array.isArray(message.images) ||
    message.images.length !== 1 ||
    typeof message.images[0] !== 'string'
  ) return false;
  const encoded = message.images[0];
  if (encoded.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 4) return false;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length >= WEBM_HEADER.length &&
    bytes.length <= MAX_AUDIO_BYTES &&
    bytes.subarray(0, WEBM_HEADER.length).equals(WEBM_HEADER) &&
    bytes.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '');
}
