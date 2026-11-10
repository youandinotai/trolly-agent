<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

import type { OllamaModel } from '../env';

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

/* Speech: offline SAPI synthesis for replies. */
const voiceEnabled = ref(false);
const voices = ref<{ name: string; culture: string }[]>([]);
const voiceName = ref('');
const speaking = ref(false);

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

/**
 * Adult content preference. Honoured only when the user has passed the age
 * check; the hard limits (adults only, consensual, no gore) always apply and
 * are restated to the model here so a preference cannot widen them.
 */
const adultContent = ref(false);

const ADULT_PREFERENCE = [
  'The user has enabled adult content in their preferences.',
  'You may engage with legal adult content when asked directly.',
  'Hard limits that do not change: legal adults only, never minors,',
  'consensual adults only, no gore or extreme violence.',
].join(' ');

async function loadPrefs() {
  try {
    const prefs = await window.trolly.mind.readPrefs();
    adultContent.value = prefs.adultContent === true && prefs.ageVerified === true;
  } catch {
    adultContent.value = false;
  }
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
        models.value.find((m) => m.name.includes('eve-v2')) ??
        models.value.find((m) => (m.contextLength ?? 0) >= 32768) ??
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
    if (!voiceName.value && voices.value.length) voiceName.value = voices.value[0].name;
  } catch {
    voices.value = [];
  }
}

/** Speak the newest assistant reply through the offline voice engine. */
async function speakLatest() {
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant');
  if (!last || speaking.value) return;
  speaking.value = true;
  try {
    await window.trolly.speech.speak({ text: last.text, voice: voiceName.value || undefined });
  } catch (err: any) {
    messages.value.push({
      role: 'tool',
      name: 'speech',
      text: `voice failed: ${err?.message ?? err}`,
    });
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
  if (!text || busy.value) return;
  draft.value = '';
  const attached = attachment.value;
  attachment.value = null;
  messages.value.push({ role: 'user', name: 'You', text });
  busy.value = true;

  try {
    const history: { role: 'user' | 'assistant'; content: string; images?: string[] }[] =
      messages.value
        .filter((m): m is Msg & { role: 'user' | 'assistant' } => m.role !== 'tool')
        .map((m) => ({ role: m.role, content: m.text }));
    const last = history[history.length - 1];
    if (attached) last.images = [attached.base64];
    const reply = await window.trolly.ollama.chat({
      model: selectedModel.value,
      messages: [
        {
          role: 'system',
          content: adultContent.value ? `${persona.value} ${ADULT_PREFERENCE}` : persona.value,
        },
        ...history,
      ],
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
  await loadPersona();
  await loadPrefs();
  await loadVoices();
  await loadToolButtons();
  window.trolly.mcp.onChanged(() => loadToolButtons());
});
</script>

<template>
  <div class="view" style="padding: 0; overflow: hidden">
    <div class="stage">
      <section class="stage-visual">
        <div class="stage-canvas">
          <div class="avatar">
            <span class="avatar-label">TRO</span>
          </div>
        </div>
        <div class="stage-meta">
          <div class="stage-name">Trolly</div>
          <div class="stage-persona">
            Your local companion. Runs on Ollama at <code>127.0.0.1:11434</code>; reaches ComfyUI and
            the MCP tool servers on this machine.
          </div>
        </div>
      </section>

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

        <div style="padding: 0 12px 10px" v-if="toolButtons.length">
          <div style="display: flex; gap: 6px; flex-wrap: wrap">
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
          <img :src="attachment.dataUrl" alt="" />
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

        <div v-if="voices.length" class="row" style="margin-top: 8px; gap: 8px">
          <label class="hint">Voice</label>
          <select
            v-model="voiceName"
            style="background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); padding: 2px 8px; font-size: 12px"
          >
            <option v-for="v in voices" :key="v.name" :value="v.name">
              {{ v.name }} ({{ v.culture }})
            </option>
          </select>
        </div>

        <input ref="fileInput" type="file" accept="image/*" hidden @change="onImagePicked" />
      </section>
    </div>
  </div>
</template>
