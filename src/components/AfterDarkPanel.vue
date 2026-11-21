<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { AFTER_DARK_DEFAULT_NEGATIVE, AFTER_DARK_DEFAULT_POSITIVE } from '../lib/after-dark-shared';
import { appMode } from '../lib/mode';

const props = defineProps<{ online: boolean; checkpoints: string[]; prompt?: string }>();

const positive = ref(props.prompt?.trim() || AFTER_DARK_DEFAULT_POSITIVE);
const negative = ref(AFTER_DARK_DEFAULT_NEGATIVE);
const model = ref('');
const seed = ref(12345);
const steps = ref(30);
const cfg = ref(6.5);
const width = ref(832);
const height = ref(1216);
const denoise = ref(0.72);
const busy = ref(false);
const error = ref('');
const reference = ref<{ name: string; dataUrl: string; dataBase64: string } | null>(null);
const result = ref<{ file: string; url: string; outputDir: string } | null>(null);

const ponyInstalled = computed(() => props.checkpoints.some((name) => name.toLowerCase().includes('pony')));
const canGenerate = computed(() =>
  props.online && appMode.adult && appMode.ageVerified && !!reference.value && !busy.value && ponyInstalled.value,
);

function chooseDefaultModel() {
  if (model.value) return;
  model.value = props.checkpoints.find((name) => name.toLowerCase().includes('pony')) ?? '';
}

async function chooseReference(event: Event) {
  error.value = '';
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    error.value = 'Choose a PNG or JPEG reference.';
    input.value = '';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    error.value = 'Reference image must be 20 MB or smaller.';
    input.value = '';
    return;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
  reference.value = { name: file.name, dataUrl, dataBase64: dataUrl.split(',', 2)[1] };
  result.value = null;
}

async function generate() {
  if (!canGenerate.value || !reference.value) return;
  busy.value = true;
  error.value = '';
  result.value = null;
  try {
    const completion = await window.trolly.comfy.generateAfterDark({
      positive: positive.value,
      negative: negative.value,
      reference: { name: reference.value.name, dataBase64: reference.value.dataBase64 },
      checkpoint: model.value,
      seed: seed.value,
      steps: steps.value,
      cfg: cfg.value,
      width: width.value,
      height: height.value,
      denoise: denoise.value,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras',
    });
    if (completion.kind === 'suppressed' || !appMode.adult) {
      result.value = null;
      error.value = 'Clean mode protected the display. The private render finished without returning pixels to this view.';
    } else {
      result.value = completion.result;
    }
  } catch (err: any) {
    error.value = String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': Error: /, '');
  } finally {
    busy.value = false;
  }
}

watch(() => props.checkpoints, chooseDefaultModel);
watch(() => props.prompt, (value) => {
  if (value?.trim()) positive.value = value;
});
onMounted(chooseDefaultModel);
</script>

<template>
  <section class="panel after-dark-panel">
    <div class="after-dark-head">
      <div>
        <h2>Trolly — After Dark</h2>
        <p class="hint">Local Pony XL image-to-image with a mandatory safety negative and a local vision check before display or save.</p>
      </div>
      <span class="after-dark-badge">LOCAL · AGE GATED</span>
    </div>

    <div v-if="!appMode.ageVerified || !appMode.adult" class="gate-message" role="status">
      Complete the age check in <strong>Mind → Preferences</strong>, then switch the top bar to <strong>Adult</strong>. The main process independently enforces this lock.
    </div>

    <template v-else>
      <div class="after-dark-layout">
        <div class="reference-column">
          <label class="reference-drop" :class="{ ready: reference }">
            <input type="file" accept="image/png,image/jpeg" @change="chooseReference" />
            <img v-if="reference" :src="reference.dataUrl" alt="Selected After Dark reference" />
            <span v-else class="reference-placeholder">
              <strong>Choose Trolly reference</strong>
              <small>PNG or JPEG · max 20 MB</small>
            </span>
          </label>
          <span v-if="reference" class="reference-name">{{ reference.name }}</span>
          <div class="privacy-note">
            <strong>No cloud. No repo output.</strong>
            <span>Private local output · outside the repository</span>
          </div>
        </div>

        <div class="after-dark-controls">
          <div class="field">
            <label for="adult-model">Local checkpoint</label>
            <select id="adult-model" v-model="model">
              <option v-for="checkpoint in checkpoints" :key="checkpoint" :value="checkpoint">{{ checkpoint }}</option>
            </select>
            <p v-if="!ponyInstalled" class="field-warning">Pony XL was not found. Start ComfyUI with the Pony checkpoint visible.</p>
          </div>

          <div class="field">
            <label for="adult-positive">Adult prompt</label>
            <textarea id="adult-positive" v-model="positive" rows="7" />
          </div>
          <div class="field">
            <label for="adult-negative">Negative prompt</label>
            <textarea id="adult-negative" v-model="negative" rows="4" />
          </div>

          <div class="after-dark-grid">
            <div class="field"><label for="adult-seed">Seed</label><input id="adult-seed" v-model.number="seed" type="number" /></div>
            <div class="field"><label for="adult-steps">Steps</label><input id="adult-steps" v-model.number="steps" type="number" min="1" /></div>
            <div class="field"><label for="adult-cfg">CFG</label><input id="adult-cfg" v-model.number="cfg" type="number" step="0.5" /></div>
            <div class="field"><label for="adult-width">Width</label><input id="adult-width" v-model.number="width" type="number" step="8" /></div>
            <div class="field"><label for="adult-height">Height</label><input id="adult-height" v-model.number="height" type="number" step="8" /></div>
            <div class="field denoise-field">
              <label for="adult-denoise">Transformation · {{ denoise.toFixed(2) }}</label>
              <input id="adult-denoise" v-model.number="denoise" type="range" min="0.35" max="0.9" step="0.01" />
              <small>Lower preserves more; higher reimagines more.</small>
            </div>
          </div>

          <p class="boundaries-line">Legal adults · consensual content · no gore or extreme violence</p>
          <button class="btn primary after-dark-generate" :disabled="!canGenerate" @click="generate">
            {{ busy ? 'Rendering + checking locally…' : 'Generate After Dark' }}
          </button>
        </div>
      </div>
    </template>

    <p v-if="error" class="after-dark-error" role="alert">{{ error }}</p>
    <div v-if="result && appMode.adult" class="after-dark-result">
      <img :src="result.url" alt="Locally generated After Dark artwork" />
      <div class="result-path">
        <strong>Saved outside every repository</strong>
        <code>{{ result.file }}</code>
      </div>
    </div>
  </section>
</template>

<style scoped>
.after-dark-panel { --adult-accent: var(--danger); border-color: #582a22; background: linear-gradient(145deg, rgba(255,85,69,.055), transparent 42%), var(--bg-raised); }
.after-dark-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
.after-dark-head h2 { color: #ff9a83; }
.after-dark-head .hint { max-width: 720px; line-height: 1.6; }
.after-dark-badge { flex: none; padding: 5px 8px; border: 1px solid #7d3028; border-radius: 5px; color: #ff9a83; font: 9px var(--mono); letter-spacing: .08em; }
.gate-message { padding: 15px; border: 1px solid #7d3028; border-radius: var(--radius-sm); background: rgba(255,85,69,.06); color: #e2b9ae; line-height: 1.7; }
.after-dark-layout { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 20px; }
.reference-column { min-width: 0; }
.reference-drop { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 832 / 1216; overflow: hidden; border: 1px dashed #704032; border-radius: 10px; background: #171411; cursor: pointer; }
.reference-drop:hover, .reference-drop:focus-within { border-color: var(--danger); }
.reference-drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.reference-drop img { width: 100%; height: 100%; object-fit: cover; }
.reference-placeholder { display: flex; flex-direction: column; gap: 8px; text-align: center; color: #ff9a83; }
.reference-placeholder small { color: var(--text-dim); }
.reference-name { display: block; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); font: 10px var(--mono); }
.privacy-note { display: flex; flex-direction: column; gap: 5px; margin-top: 14px; padding: 11px; border: 1px solid rgba(255,85,69,.28); border-radius: var(--radius-sm); background: rgba(255,85,69,.04); font-size: 11px; line-height: 1.5; }
.privacy-note span { color: var(--text-dim); font-family: var(--mono); overflow-wrap: anywhere; }
.after-dark-controls { min-width: 0; }
.after-dark-controls textarea, .after-dark-controls select, .after-dark-controls input[type="number"] { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--bg-panel); color: var(--text); }
.after-dark-controls textarea { resize: vertical; line-height: 1.5; }
.after-dark-grid { display: grid; grid-template-columns: repeat(3, minmax(90px, 1fr)); gap: 0 10px; }
.field label { display: block; margin-bottom: 5px; color: var(--text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.field-warning { color: #ff9a83; font-size: 11px; }
.denoise-field { grid-column: span 2; }
.denoise-field input { width: 100%; accent-color: var(--danger); }
.denoise-field small { display: block; margin-top: 4px; color: var(--text-faint); }
.boundaries-line { color: #b89a8e; font-size: 10.5px; }
.after-dark-generate { background: var(--danger) !important; border-color: var(--danger) !important; color: #1b0e0b !important; min-width: 190px; }
.after-dark-error { margin-top: 14px; padding: 10px 12px; border: 1px solid #7d3028; border-radius: 7px; background: rgba(125,48,40,.2); color: #ffd2c9; white-space: pre-wrap; }
.after-dark-result { display: grid; grid-template-columns: minmax(220px, 480px) minmax(180px, 1fr); gap: 18px; margin-top: 20px; padding-top: 18px; border-top: 1px solid #582a22; }
.after-dark-result img { width: 100%; border: 1px solid #7d3028; border-radius: 10px; }
.result-path { display: flex; flex-direction: column; gap: 8px; align-self: center; color: #ff9a83; }
.result-path code { color: var(--text-dim); white-space: normal; overflow-wrap: anywhere; line-height: 1.6; }
@media (max-width: 1000px) { .after-dark-layout { grid-template-columns: 220px minmax(0, 1fr); } .after-dark-grid { grid-template-columns: 1fr 1fr; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
