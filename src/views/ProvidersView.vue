<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { OllamaModel } from '../env';

/**
 * Provider categories are organised by the job a model does, not by who serves
 * it: Chat, Vision, Speech, Transcription, Artistry. Everything here is served
 * by the local daemon, so the pricing/deployment filters narrow to what is
 * actually installed.
 */
type Category = 'Chat' | 'Vision' | 'Speech' | 'Transcription' | 'Artistry';

const CATEGORIES: Category[] = ['Chat', 'Vision', 'Speech', 'Transcription', 'Artistry'];

const models = ref<OllamaModel[]>([]);
const error = ref('');
const probeResult = ref('');
const probing = ref(false);

const category = ref<Category>('Chat');
const pricing = ref<'All' | 'Free'>('All');
const deployment = ref<'All' | 'Local'>('All');
const search = ref('');

/** Capability tags are inferred from the model name; Ollama exposes no capability index. */
function tagsOf(name: string): Category[] {
  const n = name.toLowerCase();
  const tags: Category[] = ['Chat'];
  if (/vl|vision|llava|moondream|minicpm-v|bakllava|pixtral/.test(n)) tags.push('Vision');
  if (/whisper|parler|tts|voice|speech|bark/.test(n)) tags.push('Speech');
  if (/whisper|stt|transcribe/.test(n)) tags.push('Transcription');
  return tags;
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return models.value.filter((m) => {
    if (!tagsOf(m.name).includes(category.value)) return false;
    if (pricing.value === 'Free' && /paid|api/i.test(m.name)) return false;
    if (deployment.value === 'Local' && m.size === 0) return false;
    if (q && !m.name.toLowerCase().includes(q)) return false;
    return true;
  });
});

async function load() {
  error.value = '';
  try {
    models.value = await window.trolly.ollama.models();
  } catch (err: any) {
    error.value = String(err?.message ?? err);
    models.value = [];
  }
}

async function runProbe() {
  probeResult.value = '';
  const local = models.value.find((m) => m.name.toLowerCase().includes('eve-v2')) ?? models.value[0];
  if (!local) {
    probeResult.value = 'no model available';
    return;
  }
  probing.value = true;
  try {
    const reply = await window.trolly.ollama.chat({
      model: local.name,
      messages: [{ role: 'user', content: 'Reply with exactly: TROLLY OK' }],
      maxTokens: 64,
    });
    probeResult.value = reply;
  } catch (err: any) {
    probeResult.value = `error: ${err?.message ?? err}`;
  } finally {
    probing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="view">
    <div class="panel">
      <h2>Providers</h2>
      <p class="hint">
        Every model your local daemon serves. Pick by job, not by vendor — one Ollama instance
        covers all five categories. Daemon on <code>127.0.0.1:11434</code>, model store on
        <code>D:\ollama\models</code>.
      </p>

      <div class="row" style="margin: 14px 0; flex-wrap: wrap; gap: 10px">
        <div class="tabs">
          <button
            v-for="c in CATEGORIES"
            :key="c"
            class="tab"
            :class="{ active: category === c }"
            @click="category = c"
          >
            {{ c }}
          </button>
        </div>

        <div class="tabs">
          <button
            v-for="p in (['All', 'Free'] as const)"
            :key="p"
            class="tab"
            :class="{ active: pricing === p }"
            @click="pricing = p"
          >
            {{ p }}
          </button>
        </div>

        <div class="tabs">
          <button
            v-for="d in (['All', 'Local'] as const)"
            :key="d"
            class="tab"
            :class="{ active: deployment === d }"
            @click="deployment = d"
          >
            {{ d }}
          </button>
        </div>

        <input v-model="search" class="input" placeholder="Filter models..." />
      </div>

      <div v-if="error" class="badge err" style="margin-bottom: 12px">
        Ollama unreachable: {{ error }}
      </div>

      <div v-for="m in filtered" :key="m.name" class="row">
        <div class="grow">
          <div class="name" style="font-family: var(--mono); font-size: 12.5px">{{ m.name }}</div>
          <div class="meta">
            {{ (m.size / 1e9).toFixed(2) }} GB
            <template v-if="m.contextLength"> · {{ Math.round(m.contextLength / 1024) }}k ctx</template>
            <template v-if="m.family"> · {{ m.family }}</template>
            · {{ tagsOf(m.name).join(' · ') }}
          </div>
        </div>
        <span class="badge">{{ m.size === 0 ? 'cloud' : 'local' }}</span>
      </div>

      <div v-if="!filtered.length && !error" class="empty">
        No {{ category.toLowerCase() }} models match this filter.
      </div>
    </div>

    <div class="panel">
      <h2>Provider probe</h2>
      <p class="hint">Send a one-token round trip to confirm the provider path works end to end.</p>
      <button class="btn primary" :disabled="probing" @click="runProbe">
        {{ probing ? 'Probing...' : 'Run probe' }}
      </button>
      <div v-if="probeResult" class="scroll-box" style="margin-top: 12px">{{ probeResult }}</div>
    </div>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
}
.tab {
  padding: 5px 13px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}
.tab.active {
  background: var(--accent);
  color: #06121a;
  font-weight: 600;
}
.input {
  padding: 6px 10px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12px;
}
</style>
