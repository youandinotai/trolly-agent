<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

const status = ref<{ online: boolean; comfyuiVersion?: string; device?: string; vramTotal?: number; vramFree?: number; error?: string }>(
  { online: false },
);

const mode = ref<'video' | 'image'>('video');

/* What the local machine actually has installed. */
const inventory = ref<{
  checkpoints: string[];
  diffusionModels: string[];
  textEncoders: string[];
  vaes: string[];
}>({ checkpoints: [], diffusionModels: [], textEncoders: [], vaes: [] });

/** Chosen model. Empty means "use the default for this mode". */
const model = ref('');

/* Recently generated media, straight from the ComfyUI history. */
const library = ref<{ filename: string; url: string }[]>([]);

const positive = ref('a warm cozy cabin at dusk, cinematic lighting, high detail');
const negative = ref('blurry, low quality, distorted');
const seed = ref(12345);
const width = ref(832);
const height = ref(1216);
const steps = ref(4);
const duration = ref(2);

/**
 * Each backend wants its own shape: Z-Image Turbo is a distilled model that
 * wants 8 steps at square resolution, the LTX video model wants 4 steps.
 */
function setMode(next: 'video' | 'image') {
  mode.value = next;
  if (next === 'image') {
    steps.value = 8;
    width.value = 1024;
    height.value = 1024;
  } else {
    steps.value = 4;
    width.value = 832;
    height.value = 1216;
  }
}
const busy = ref(false);
const result = ref('');
const resultFile = ref('');

/**
 * Per-model presets. Each backend wants different numbers: SDXL checkpoints
 * want a real step count and a cfg above 1, the distilled diffusion models
 * want almost no steps and cfg 1.
 */
const PRESETS: Record<string, { steps: number; cfg: number; sampler: string; scheduler: string; width: number; height: number }> = {
  pony: { steps: 30, cfg: 7, sampler: 'euler', scheduler: 'normal', width: 832, height: 1216 },
  zimage: { steps: 8, cfg: 1, sampler: 'res_multistep', scheduler: 'simple', width: 1024, height: 1024 },
  ltx: { steps: 4, cfg: 1, sampler: 'euler', scheduler: 'normal', width: 832, height: 1216 },
};

function presetFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('pony')) return PRESETS.pony;
  if (n.includes('z_image') || n.includes('z-image')) return PRESETS.zimage;
  if (n.includes('ltx')) return PRESETS.ltx;
  return null;
}

function applyModel(next: string) {
  model.value = next;
  const preset = presetFor(next);
  if (!preset) return;
  steps.value = preset.steps;
  cfg.value = preset.cfg;
  sampler.value = preset.sampler;
  width.value = preset.width;
  height.value = preset.height;
}

const cfg = ref(7);
const sampler = ref('euler');

async function refresh() {
  try {
    status.value = await window.trolly.comfy.status();
  } catch (err: any) {
    status.value = { online: false, error: String(err?.message ?? err) };
  }
  try {
    inventory.value = await window.trolly.comfy.inventory();
  } catch {
    /* keep whatever we had */
  }
  try {
    library.value = await window.trolly.comfy.outputs(24);
  } catch {
    library.value = [];
  }
}

/** Models the picker offers for the current mode. */
const modelOptions = computed(() =>
  mode.value === 'image'
    ? [...inventory.value.checkpoints, ...inventory.value.diffusionModels]
    : [...inventory.value.checkpoints, ...inventory.value.diffusionModels],
);

async function generate() {
  busy.value = true;
  result.value = '';
  resultFile.value = '';
  try {
    const out = await window.trolly.comfy.generate({
      positive: positive.value,
      negative: negative.value,
      seed: seed.value,
      width: width.value,
      height: height.value,
      steps: steps.value,
      cfg: cfg.value,
      sampler: sampler.value,
      checkpoint: model.value || undefined,
      duration: duration.value,
      mode: mode.value,
      filenamePrefix: mode.value === 'video' ? 'trolly_video' : 'trolly',
    });
    result.value = out.url;
    resultFile.value = out.file;
  } catch (err: any) {
    result.value = `error: ${err?.message ?? err}`;
  } finally {
    busy.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <div class="view">
    <div class="panel">
      <h2>Artistry — ComfyUI</h2>
      <p class="hint">
        Renders images on the local ComfyUI backend (<code>127.0.0.1:8188</code>). Everything runs
        on your own GPU; nothing is uploaded.
      </p>

      <div class="row" style="border-top: none; padding-top: 0">
        <div class="grow">
          <div class="name">
            Backend
            <span v-if="status.device" class="meta"> · {{ status.device }}</span>
          </div>
          <div class="meta">
            <template v-if="status.online">
              ComfyUI {{ status.comfyuiVersion }}
              <template v-if="status.vramTotal">
                · {{ ((status.vramFree ?? 0) / 1e9).toFixed(1) }} / {{ (status.vramTotal / 1e9).toFixed(1) }} GB VRAM free
              </template>
            </template>
            <template v-else>unreachable{{ status.error ? `: ${status.error}` : '' }}</template>
          </div>
        </div>
        <span class="badge" :class="status.online ? 'ok' : 'err'">
          {{ status.online ? 'online' : 'offline' }}
        </span>
        <button class="btn sm" @click="refresh">Refresh</button>
      </div>
    </div>

    <div class="panel">
      <h2>Generate</h2>
      <p class="hint">A standard txt2img graph: checkpoint → text encode → sampler → decode → save.</p>

      <div class="field">
        <label>Mode</label>
        <div style="display: flex; gap: 8px">
          <button class="btn sm" :class="{ primary: mode === 'video' }" @click="setMode('video')">
            Video (LTX)
          </button>
          <button class="btn sm" :class="{ primary: mode === 'image' }" @click="setMode('image')">
            Image (SD)
          </button>
        </div>
      </div>

      <div class="field">
        <label>Model</label>
        <select :value="model" @change="applyModel(($event.target as HTMLSelectElement).value)">
          <option value="">Automatic (best for this mode)</option>
          <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
        </select>
        <p v-if="!modelOptions.length" class="hint">
          No models found. ComfyUI must be running with its model folders visible.
        </p>
      </div>

      <div class="field">
        <label>Positive prompt</label>
        <textarea v-model="positive" />
      </div>
      <div class="field">
        <label>Negative prompt</label>
        <textarea v-model="negative" />
      </div>

      <div class="grid2">
        <div class="field">
          <label>Seed</label>
          <input v-model.number="seed" type="number" />
        </div>
        <div class="field">
          <label>Steps</label>
          <input v-model.number="steps" type="number" />
        </div>
        <div class="field">
          <label>CFG</label>
          <input v-model.number="cfg" type="number" step="0.5" />
        </div>
        <div class="field">
          <label>Width</label>
          <input v-model.number="width" type="number" step="8" />
        </div>
        <div class="field">
          <label>Height</label>
          <input v-model.number="height" type="number" step="8" />
        </div>
      </div>

      <button class="btn primary" :disabled="busy || !status.online" @click="generate">
        {{ busy ? 'rendering…' : 'Generate image' }}
      </button>

      <div v-if="result" style="margin-top: 14px">
        <video
          v-if="status.online && !result.startsWith('error') && result.endsWith('.mp4')"
          :src="result"
          controls
          autoplay
          loop
          muted
          style="max-width: 100%; border-radius: var(--radius); border: 1px solid var(--line)"
        />
        <img
          v-else-if="status.online && !result.startsWith('error')"
          :src="result"
          alt="Generated artwork"
          style="max-width: 100%; border-radius: var(--radius); border: 1px solid var(--line)"
        />
        <div class="scroll-box">{{ resultFile || result }}</div>
      </div>

      <div v-if="library.length" style="margin-top: 18px">
        <h3 style="font-size: 13px; margin: 0 0 8px">Library</h3>
        <div class="lib-grid">
          <button
            v-for="item in library"
            :key="item.filename"
            class="lib-item"
            :title="item.filename"
            @click="result = item.url"
          >
            <video
              v-if="item.filename.endsWith('.mp4')"
              :src="item.url"
              muted
              loop
              autoplay
            />
            <img v-else :src="item.url" :alt="item.filename" />
            <span class="lib-name">{{ item.filename }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
}
.lib-item {
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.lib-item img,
.lib-item video {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
.lib-name {
  padding: 4px 6px;
  font-size: 10px;
  color: var(--text-dim);
  font-family: var(--mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lib-item:hover {
  border-color: var(--accent);
}
</style>
