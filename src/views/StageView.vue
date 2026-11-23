<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import AvatarStage from '../components/AvatarStage.vue';
import type { OllamaModel } from '../env';
import type { AgentProfile } from '../lib/agency-roster';
import type { HarnessId } from '../lib/harness';
import { HARNESSES } from '../lib/harness';
import { appMode, loadMode, systemPrompt } from '../lib/mode';
import { planRouteSteps, type TaskRoute } from '../lib/task-router';
import { DEFAULT_VOICE, type SpeechVoice } from '../lib/voices';

const emit = defineEmits<{ (e: 'navigate', view: 'mcp' | 'providers' | 'artistry'): void }>();
const props = defineProps<{ provider: HarnessId; providerEndpoint: string }>();

interface Msg {
  role: 'user' | 'assistant' | 'tool';
  name: string;
  text: string;
}

interface RoutePreview {
  route: TaskRoute;
  steps: string[];
  text: string;
  provider: HarnessId;
  endpoint: string;
  agent?: AgentProfile;
}

const messages = ref<Msg[]>([
  {
    role: 'assistant',
    name: 'Trolly',
    text: 'Hey — choose a provider and agent profile, then send a message. The Director will show the plan before anything runs.',
  },
]);

const draft = ref('');
const busy = ref(false);
const preview = ref<RoutePreview | null>(null);
const previewProviderLabel = computed(() =>
  preview.value ? HARNESSES.find((item) => item.id === preview.value?.provider)?.label ?? preview.value.provider : '',
);

/* Speech: offline SAPI synthesis for replies. */
const voiceEnabled = ref(false);
const voices = ref<SpeechVoice[]>([]);
const voiceName = ref(DEFAULT_VOICE);
const speechStatus = ref('Natural voices · first use downloads once');
const speaking = ref(false);
const avatarStage = ref<InstanceType<typeof AvatarStage> | null>(null);

const audioInput = ref<HTMLInputElement | null>(null);
const recording = ref(false);
const mediaRecorder = ref<MediaRecorder | null>(null);
const recordedChunks = ref<Blob[]>([]);
const models = ref<OllamaModel[]>([]);
const selectedModel = ref('');
const profiles = ref<AgentProfile[]>([]);
const selectedAgentId = ref(localStorage.getItem('trolly-agent-profile') ?? 'auto');
const modelError = ref('');
const agentError = ref('');
const runStatus = ref('');
const logEl = ref<HTMLElement | null>(null);
let modelRequest = 0;
let removeSpeechListener: (() => void) | null = null;
let removeMcpListener: (() => void) | null = null;

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
  const request = ++modelRequest;
  modelError.value = '';
  try {
    const inventory = await window.trolly.provider.models({
      provider: props.provider,
      endpoint: props.providerEndpoint,
    });
    if (request !== modelRequest) return;
    models.value = inventory;
    const saved = localStorage.getItem(`trolly-model-${props.provider}`);
    if (saved && inventory.some((model) => model.name === saved)) {
      selectedModel.value = saved;
    } else if (inventory.length) {
      // Prefer a local chat model with a decent context window.
      const preferred =
        inventory.find((m) => /eve-v2/i.test(m.name) && !/eve-cpu/i.test(m.name)) ??
        inventory.find((m) => (m.contextLength ?? 0) >= 32768 && !/eve-cpu/i.test(m.name)) ??
        inventory[0];
      selectedModel.value = preferred.name;
    } else {
      selectedModel.value = '';
    }
  } catch (error: any) {
    if (request !== modelRequest) return;
    models.value = [];
    selectedModel.value = '';
    modelError.value = String(error?.message ?? error);
  }
}

watch(() => [props.provider, props.providerEndpoint] as const, () => { void loadModels(); });
watch(selectedModel, (model) => {
  if (model) localStorage.setItem(`trolly-model-${props.provider}`, model);
});
watch(selectedAgentId, (id) => localStorage.setItem('trolly-agent-profile', id));

async function loadAgentProfiles() {
  try {
    const result = await window.trolly.agents.list();
    profiles.value = result.profiles;
    agentError.value = result.error;
  } catch (error: any) {
    profiles.value = [];
    agentError.value = String(error?.message ?? error);
  }
  if (selectedAgentId.value !== 'auto' && !profiles.value.some((profile) => profile.id === selectedAgentId.value)) {
    selectedAgentId.value = 'auto';
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
      try {
        const text = await transcribe(blob);
        if (text) draft.value = draft.value ? `${draft.value} ${text}` : text;
      } catch (err: any) {
        messages.value.push({
          role: 'tool',
          name: 'speech',
          text: `transcription failed: ${err?.message ?? err}`,
        });
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
  if (blob.size > 20 * 1024 * 1024) {
    messages.value.push({ role: 'tool', name: 'speech', text: 'recording is too large; keep dictation under 20 MiB' });
    return '';
  }
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
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const b64 = btoa(binary);
  const reply = await window.trolly.ollama.chat({
    model: stt.name,
    purpose: 'audio-transcription',
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
  messages.value.push({ role: 'user', name: 'You', text });
  try {
    const route = await window.trolly.router.classify(text);
    const model = route.task === 'chat' ? selectedModel.value : route.model;
    const selectedProfile = profiles.value.find((profile) => profile.id === selectedAgentId.value);
    const plannedRoute = {
      ...route,
      model,
      specialist: selectedProfile?.name ?? route.specialist,
    };
    preview.value = {
      route: plannedRoute,
      steps: planRouteSteps(plannedRoute, selectedModel.value),
      text,
      provider: props.provider,
      endpoint: props.providerEndpoint,
      agent: selectedProfile,
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
  runStatus.value = `${route.specialist || 'Trolly'} · ${HARNESSES.find((item) => item.id === pending.provider)?.label ?? pending.provider}`;
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

    const history: { role: 'user' | 'assistant'; content: string }[] =
      messages.value
        .filter((m): m is Msg & { role: 'user' | 'assistant' } => m.role !== 'tool')
        .map((m) => ({ role: m.role, content: m.text }));
    const instructions = pending.agent && pending.agent.name === route.specialist
      ? `${systemPrompt()}\n\n${pending.agent.systemPrompt}`
      : systemPrompt();
    const reply = await window.trolly.provider.chat({
      provider: pending.provider,
      endpoint: pending.endpoint,
      model: route.model,
      messages: [{ role: 'system', content: instructions }, ...history],
      temperature: 0.85,
      maxTokens: 1024,
    });
    messages.value.push({ role: 'assistant', name: 'Trolly', text: reply || '(no reply)' });
    if (voiceEnabled.value) void speakLatest();
  } catch (err: any) {
    const detail = String(err?.message ?? err);
    messages.value.push({
      role: 'assistant',
      name: 'Trolly',
      text: detail.includes('Clean mode') || detail.includes('21') || detail.includes('age/content classified')
        ? detail
        : `I could not reach the model: ${detail}`,
    });
  } finally {
    busy.value = false;
    runStatus.value = '';
    await nextTick();
    logEl.value?.scrollTo({ top: logEl.value.scrollHeight });
  }
}

async function saveDraftAsTask() {
  const text = draft.value.trim();
  if (!text) return;
  try {
    const title = text.split(/\r?\n/, 1)[0].slice(0, 160) || 'New task';
    await window.trolly.workspace.create({ title, description: text });
    messages.value.push({ role: 'tool', name: 'Workspace', text: 'Saved this prompt as a task.' });
  } catch (error: any) {
    messages.value.push({ role: 'tool', name: 'Workspace', text: `Could not save task: ${error?.message ?? error}` });
  }
}

function resumeTask(event: Event) {
  const prompt = (event as CustomEvent<string>).detail;
  if (typeof prompt === 'string') draft.value = prompt;
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
  window.addEventListener('trolly:resume-task', resumeTask);
  await loadAgentProfiles();
  await loadModels();
  await syncPersona();
  await loadVoices();
  removeSpeechListener = window.trolly.speech.onStatus((status) => { speechStatus.value = status.message; });
  await loadToolButtons();
  removeMcpListener = window.trolly.mcp.onChanged(() => loadToolButtons());
});

onUnmounted(() => {
  window.removeEventListener('trolly:resume-task', resumeTask);
  removeSpeechListener?.();
  removeMcpListener?.();
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
              <div class="msg-name">Agent run · {{ runStatus }}</div>
              <div class="bubble"><span class="spinner" /> Working through the approved plan…</div>
            </div>
          </div>
        </div>

        <aside v-if="preview" class="route-preview" aria-label="Director preview">
          <div class="route-preview-head">
            <strong>Director</strong>
            <span>{{ preview.route.specialist || 'product' }}</span>
          </div>
          <p>{{ previewProviderLabel }} · {{ preview.route.task }} · {{ preview.route.backend }} · {{ preview.route.model }}</p>
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

        <div class="chat-input">
          <select
            v-model="selectedModel"
            aria-label="Model"
            style="max-width: 210px; background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); padding: 0 8px"
          >
            <option v-for="m in models" :key="m.name" :value="m.name">{{ m.name }}</option>
          </select>
          <select v-model="selectedAgentId" aria-label="Agent profile">
            <option value="auto">Auto specialist</option>
            <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
          </select>
          <div v-if="agentError" class="provider-error" role="status">{{ agentError }}</div>
          <div v-if="modelError" class="provider-error" role="status">{{ modelError }}</div>
          <button class="btn sm" disabled title="Image attachments are disabled until local age/content classification is available" aria-describedby="stage-image-note">
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
          <button class="btn sm" :disabled="!draft.trim()" @click="saveDraftAsTask">Save task</button>
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
        <p id="stage-image-note" class="hint">Image attachments are disabled until Trolly can classify them locally.</p>

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

      </section>
    </div>
  </div>
</template>

<style scoped>
.voice-bar { margin-top: 8px; flex-wrap: wrap; gap: 8px; }
.voice-select { flex: 1; min-width: 180px; background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); padding: 5px 8px; font-size: 12px; }
.voice-preview { padding: 5px 10px; border: 1px solid var(--accent-dim); border-radius: 6px; color: var(--accent); font-size: 12px; }
.voice-status { flex-basis: 100%; }
</style>
