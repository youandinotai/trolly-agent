<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';

import AvatarStage from '../components/AvatarStage.vue';
import SafeMedia from '../components/SafeMedia.vue';
import type { OllamaModel } from '../env';
import { appMode, loadMode, systemPrompt } from '../lib/mode';
import { planRouteSteps, type TaskRoute } from '../lib/task-router';
import { DEFAULT_VOICE, type SpeechVoice } from '../lib/voices';

const emit = defineEmits<{ (e: 'navigate', view: 'mcp' | 'providers' | 'artistry'): void }>();

interface Msg {
  role: 'user' | 'assistant' | 'tool';
  name: string;
  text: string;
}

const messages = ref<Msg[]>([
  {
    role: 'assistant',
    name: 'Trolly',
    text: 'Hey — I am running locally on your machine. I can talk, and with the tool servers connected I can drive ComfyUI, Maestro, and your browser. Say something.',
  },
]);

const draft = ref('');
const busy = ref(false);
const preview = ref<{ route: TaskRoute; steps: string[]; text: string; images?: string[] } | null>(null);

/* Speech: offline SAPI synthesis for replies. */
const voiceEnabled = ref(false);
const voices = ref<SpeechVoice[]>([]);
const voiceName = ref(DEFAULT_VOICE);
const speechStatus = ref('Natural voices · first use downloads once');
const speaking = ref(false);
const avatarStage = ref<InstanceType<typeof AvatarStage> | null>(null);

/* Vision: attach an image to the next message. */
const attachment = ref<{ name: string; dataUrl: string; base64: string } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const audioInput = ref<HTMLInputElement | null>(null);
const recording = ref(false);
const mediaRecorder = ref<MediaRecorder | null>(null);
const recordedChunks = ref<Blob[]>([]);
const models = ref<OllamaModel[]>([]);
const selectedModel = ref('');
const logEl = ref<HTMLElement | null>(null);

const DEFAULT_PERSONA = [
  'You are Trolly, a warm and candid companion living inside the Trolly Agent desktop app.',
  'You run on the user local machine. Keep replies conversational and reasonably short.',
  'You can call tools when the user asks for something you can actually do.',
].join(' ');

/** The persona saved under Mind > Consciousness wins over the built-in default. */
const persona = ref(DEFAULT_PERSONA);

/** Mirror the shared persona into this view so the composer shows it. */
async function syncPersona() {
  await loadMode();
  if (appMode.persona?.trim()) persona.value = appMode.persona;
}



async function loadPersona() {
  try {
    const saved = await window.trolly.mind.persona();
    if (saved?.content?.trim()) persona.value = saved.content;
  } catch {
    persona.value = DEFAULT_PERSONA;
  }
}

async function loadModels() {
  try {
    models.value = await window.trolly.ollama.models();
    if (!selectedModel.value && models.value.length) {
      // Prefer a local chat model with a decent context window.
      const preferred =
        models.value.find((m) => /eve-v2/i.test(m.name) && !/eve-cpu/i.test(m.name)) ??
        models.value.find((m) => (m.contextLength ?? 0) >= 32768 && !/eve-cpu/i.test(m.name)) ??
        models.value[0];
      selectedModel.value = preferred.name;
    }
  } catch {
    models.value = [];
  }
}

async function loadVoices() {
  try {
    voices.value = await window.trolly.speech.voices();
    if (!voices.value.some((voice) => voice.id === voiceName.value)) voiceName.value = DEFAULT_VOICE;
  } catch {
    voices.value = [];
  }
}

/** Speak the newest assistant reply through the offline voice engine. */
async function speakLatest() {
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant');
  if (!last || speaking.value) return;
  await speakText(last.text);
}

async function previewVoice() {
  if (speaking.value) return;
  const voice = voices.value.find((item) => item.id === voiceName.value);
  await speakText(`Hi, I'm ${voice?.name ?? 'Heart'}. This is my natural voice.`);
}

async function speakText(text: string) {
  const startedAdult = appMode.adult;
  speaking.value = true;
  speechStatus.value = 'Preparing natural voice…';
  try {
    const result = await window.trolly.speech.speak({ text, voice: voiceName.value || undefined });
    if (!result.audioBase64) throw new Error('speech engine returned no playable audio');
    if (startedAdult && !appMode.adult) {
      speechStatus.value = 'Speech stopped by Clean mode';
      return;
    }
    speechStatus.value = `Playing ${result.voice} · local Kokoro`;
    if (!avatarStage.value) throw new Error('avatar stage is not ready');
    await avatarStage.value.playSpeech(result.audioBase64, text);
    speechStatus.value = 'Natural voices ready';
  } catch (err: any) {
    speechStatus.value = 'Voice failed';
    messages.value.push({ role: 'tool', name: 'speech', text: `voice failed: ${err?.message ?? err}` });
  } finally {
    speaking.value = false;
  }
}

/** Attach an image for the vision model. */
function pickImage() {
  fileInput.value?.click();
}

function onImagePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result ?? '');
    const base64 = dataUrl.split(',')[1] ?? '';
    attachment.value = { name: file.name, dataUrl, base64 };
  };
  reader.readAsDataURL(file);
  input.value = '';
}

/** Record a voice note; transcription runs through the local speech stack. */
async function toggleRecording() {
  if (recording.value) {
    mediaRecorder.value?.stop();
    recording.value = false;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    recordedChunks.value = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) recordedChunks.value.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(recordedChunks.value, { type: 'audio/webm' });
      if (!blob.size) return;
      const text = await transcribe(blob);
      if (text) {
        draft.value = draft.value ? `${draft.value} ${text}` : text;
      }
    };
    rec.start();
    mediaRecorder.value = rec;
    recording.value = true;
  } catch (err: any) {
    messages.value.push({
      role: 'tool',
      name: 'speech',
      text: `microphone unavailable: ${err?.message ?? err}`,
    });
  }
}

/** Transcribe a recorded clip with the local transcription model. */
async function transcribe(blob: Blob): Promise<string> {
  const models = await window.trolly.ollama.models();
  const stt = models.find((m) => /whisper|transcribe|stt/i.test(m.name));
  if (!stt) {
    messages.value.push({
      role: 'tool',
      name: 'speech',
      text: 'no transcription model installed (pull a whisper model into Ollama to enable dictation)',
    });
    return '';
  }
  const buf = await blob.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const reply = await window.trolly.ollama.chat({
    model: stt.name,
    messages: [
      {
        role: 'user',
        content: 'Transcribe this audio exactly as spoken. Reply with only the transcript.',
        images: [b64],
      },
    ],
    maxTokens: 512,
  });
  return reply.trim();
}

async function send() {
  const text = draft.value.trim();
  if (!text || busy.value || preview.value) return;
  draft.value = '';
  const attached = attachment.value;
  attachment.value = null;
  messages.value.push({ role: 'user', name: 'You', text });
  try {
    const route = await window.trolly.router.classify(text);
    const model = route.task === 'chat'
      ? (route.source === 'panda' ? route.model : selectedModel.value)
      : route.model;
    preview.value = {
      route: { ...route, model },
      steps: planRouteSteps({ ...route, model }, selectedModel.value),
      text,
      images: attached ? [attached.base64] : undefined,
    };
  } catch (err: any) {
    messages.value.push({ role: 'assistant', name: 'Trolly', text: `Router failed before any model call: ${err?.message ?? err}` });
  }
  await nextTick();
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight });
}

function stopPreview() {
  if (!preview.value) return;
  messages.value.push({ role: 'tool', name: 'Director', text: 'Stopped. No model call was made.' });
  preview.value = null;
}

async function runPreview() {
  const pending = preview.value;
  if (!pending || busy.value) return;
  preview.value = null;
  const route = pending.route;
  busy.value = true;
  try {
    if (route.task !== 'chat') {
      const routerName = route.source === 'panda'
        ? 'Panda'
        : route.source === 'jev'
          ? `JEV · ${route.routerModel ?? 'local'}`
          : 'Router · deterministic fallback';
      messages.value.push({
        role: 'tool',
        name: routerName,
        text: route.task === 'avatar'
          ? `Avatar → Stage VRM · ${route.model}. Skill ${route.specialist || 'product'}.`
          : `${route.task} → ${route.backend} · ${route.model}. Skill ${route.specialist || 'product'}. Opening Artistry.`,
      });
      if (route.task !== 'avatar') {
        window.dispatchEvent(new CustomEvent('trolly:task-route', { detail: route }));
        emit('navigate', 'artistry');
      }
      return;
    }

    const history: { role: 'user' | 'assistant'; content: string; images?: string[] }[] =
      messages.value
        .filter((m): m is Msg & { role: 'user' | 'assistant' } => m.role !== 'tool')
        .map((m) => ({ role: m.role, content: m.text }));
    const last = history[history.length - 1];
    if (pending.images && last) last.images = pending.images;
    const reply = await window.trolly.ollama.chat({
      model: route.model,
      messages: [{ role: 'system', content: systemPrompt() }, ...history],
      temperature: 0.85,
      maxTokens: 1024,
    });
    messages.value.push({ role: 'assistant', name: 'Trolly', text: reply || '(no reply)' });
    if (voiceEnabled.value) void speakLatest();
  } catch (err: any) {
    messages.value.push({
      role: 'assistant',
      name: 'Trolly',
      text: `I could not reach the model: ${err?.message ?? err}`,
    });
  } finally {
    busy.value = false;
    await nextTick();
    logEl.value?.scrollTo({ top: logEl.value.scrollHeight });
  }
}

async function runTool(serverId: string, toolName: string, args: Record<string, unknown>) {
  messages.value.push({
    role: 'tool',
    name: `${serverId} · ${toolName}`,
    text: `calling with ${JSON.stringify(args)}`,
  });
  await nextTick();
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight });
  try {
    const result = await window.trolly.mcp.call(serverId, toolName, args);
    const text = (result?.content ?? []).map((c) => c.text).join('\n');
    messages.value.push({ role: 'tool', name: `${serverId} · ${toolName}`, text: text || '(no output)' });
  } catch (err: any) {
    messages.value.push({ role: 'tool', name: `${serverId} · ${toolName}`, text: `error: ${err?.message ?? err}` });
  }
  await nextTick();
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight });
}

const toolButtons = ref<{ server: string; name: string; label: string }[]>([]);

async function loadToolButtons() {
  const servers = await window.trolly.mcp.list();
  const out: { server: string; name: string; label: string }[] = [];
  for (const s of servers.filter((x) => x.status === 'connected')) {
    const tools = await window.trolly.mcp.tools(s.id);
    for (const t of tools.slice(0, 3)) {
      out.push({ server: s.id, name: t.name, label: t.name });
    }
  }
  toolButtons.value = out;
}

onMounted(async () => {
  await loadModels();
  await syncPersona();
  await loadVoices();
  window.trolly.speech.onStatus((status) => { speechStatus.value = status.message; });
  await loadToolButtons();
  window.trolly.mcp.onChanged(() => loadToolButtons());
});
</script>

<template>
  <div class="view" style="padding: 0; overflow: hidden">
  <div class="stage">
    <AvatarStage ref="avatarStage" :adult="appMode.adult" @speaking-change="speaking = $event" />

      <section class="chat">
        <div class="chat-log" ref="logEl">
          <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
            <div class="msg-body">
              <div class="msg-name">{{ m.name }}</div>
              <div class="bubble">{{ m.text }}</div>
            </div>
          </div>
          <div v-if="busy" class="msg assistant">
            <div class="msg-body">
              <div class="msg-name">Trolly</div>
              <div class="bubble"><span class="spinner" /> thinking</div>
            </div>
          </div>
        </div>

        <aside v-if="preview" class="route-preview" aria-label="Director preview">
          <div class="route-preview-head">
            <strong>Director</strong>
            <span>{{ preview.route.specialist || 'product' }}</span>
          </div>
          <p>{{ preview.route.task }} · {{ preview.route.model }}</p>
          <ol>
            <li v-for="step in preview.steps" :key="step">{{ step }}</li>
          </ol>
          <div class="route-preview-actions">
            <button type="button" class="btn sm" @click="stopPreview">Stop</button>
            <button type="button" class="btn sm primary" @click="runPreview">Run</button>
          </div>
        </aside>

        <div class="stage-tool-actions" v-if="toolButtons.length">
          <div class="stage-tool-actions-inner">
            <button
              v-for="t in toolButtons"
              :key="t.server + t.name"
              class="btn sm"
              @click="runTool(t.server, t.name, {})"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

        <div v-if="attachment" class="attach-chip">
          <SafeMedia class="attach-preview" :src="attachment.dataUrl" kind="image" alt="Attached image" />
          <span>{{ attachment.name }}</span>
          <button class="btn sm" @click="attachment = null">Remove</button>
        </div>

        <div class="chat-input">
          <select
            v-model="selectedModel"
            style="max-width: 210px; background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); padding: 0 8px"
          >
            <option v-for="m in models" :key="m.name" :value="m.name">{{ m.name }}</option>
          </select>
          <button class="btn sm" title="Attach an image for the vision model" @click="pickImage">
            Attach
          </button>
          <button
            class="btn sm"
            :class="{ primary: recording }"
            title="Dictate"
            @click="toggleRecording"
          >
            {{ recording ? 'Stop' : 'Dictate' }}
          </button>
          <textarea
            v-model="draft"
            placeholder="Talk to Trolly…"
            @keydown.enter.exact.prevent="send"
          />
          <button class="btn sm" :class="{ primary: voiceEnabled }" @click="voiceEnabled = !voiceEnabled">
            {{ voiceEnabled ? 'Voice on' : 'Voice off' }}
          </button>
          <button class="btn sm" :disabled="speaking" @click="speakLatest">
            {{ speaking ? '…' : 'Speak' }}
          </button>
          <button class="btn primary" :disabled="busy || !selectedModel" @click="send">
            {{ busy ? '…' : 'Send' }}
          </button>
        </div>

        <div v-if="voices.length" class="row voice-bar">
          <label class="hint">Voice</label>
          <select v-model="voiceName" class="voice-select">
            <option v-for="v in voices" :key="v.id" :value="v.id">
              {{ v.name }} · {{ v.culture }} — {{ v.description }}
            </option>
          </select>
          <button class="voice-preview" :disabled="speaking" @click="previewVoice">{{ speaking ? 'Speaking…' : 'Preview' }}</button>
          <span class="hint voice-status">{{ speechStatus }}</span>
        </div>

        <input ref="fileInput" type="file" accept="image/*" hidden @change="onImagePicked" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.voice-bar { margin-top: 8px; flex-wrap: wrap; gap: 8px; }
.voice-select { flex: 1; min-width: 180px; background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); padding: 5px 8px; font-size: 12px; }
.voice-preview { padding: 5px 10px; border: 1px solid var(--accent-dim); border-radius: 6px; color: var(--accent); font-size: 12px; }
.voice-status { flex-basis: 100%; }
.attach-preview { width: 44px; min-height: 44px; flex: none; }
.attach-preview :deep(.safe-media-cover) { padding: 3px; }
.attach-preview :deep(.safe-media-cover strong) { font-size: 8px; }
.attach-preview :deep(.safe-media-cover span), .attach-preview :deep(.safe-media-cover small) { display: none; }
</style>
