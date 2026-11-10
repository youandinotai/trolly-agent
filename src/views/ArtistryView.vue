<script setup lang="ts">
import { onMounted, ref } from 'vue';

const status = ref<{ online: boolean; comfyuiVersion?: string; device?: string; vramTotal?: number; vramFree?: number; error?: string }>(
  { online: false },
);

const mode = ref<'video' | 'image'>('video');

const positive = ref('a warm cozy cabin at dusk, cinematic lighting, high detail');
const negative = ref('blurry, low quality, distorted');
const seed = ref(12345);
const width = ref(832);
const height = ref(1216);
const steps = ref(4);
const duration = ref(2);
const busy = ref(false);
const result = ref('');
const resultFile = ref('');

async function refresh() {
  try {
    status.value = await window.trolly.comfy.status();
  } catch (err: any) {
    status.value = { online: false, error: String(err?.message ?? err) };
  }
}

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
          <button class="btn sm" :class="{ primary: mode === 'video' }" @click="mode = 'video'">
            Video (LTX)
          </button>
          <button class="btn sm" :class="{ primary: mode === 'image' }" @click="mode = 'image'">
            Image (SD)
          </button>
        </div>
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
    </div>
  </div>
</template>
