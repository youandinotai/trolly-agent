import test from 'node:test';
import assert from 'node:assert/strict';

import { isLocalAudioTranscriptionRequest } from '../src/lib/audio-transcription.ts';

const prompt = 'Transcribe this audio exactly as spoken. Reply with only the transcript.';

test('only a bounded WebM transcription request can pass the Ollama audio exception', () => {
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x01]).toString('base64');
  const request = {
    purpose: 'audio-transcription',
    model: 'whisper-local',
    messages: [{ role: 'user', content: prompt, images: [webm] }],
  };
  assert.equal(isLocalAudioTranscriptionRequest(request), true);
  assert.equal(isLocalAudioTranscriptionRequest({ ...request, model: 'vision-model' }), false);
  assert.equal(isLocalAudioTranscriptionRequest({ ...request, messages: [{ ...request.messages[0], content: 'summarize this' }] }), false);
  assert.equal(isLocalAudioTranscriptionRequest({ ...request, messages: [{ ...request.messages[0], images: [Buffer.from('not audio').toString('base64')] }] }), false);
});
