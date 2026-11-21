<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { AvatarEngine, type AvatarFraming, type AvatarQuality } from '../lib/avatar-engine';
import { detectEmotion, type AvatarEmotion } from '../lib/avatar-motion';
import type { StudioGarment } from '../lib/studio-types.js';

const emit = defineEmits<{
  (event: 'speaking-change', speaking: boolean): void;
}>();

const props = withDefaults(defineProps<{ compact?: boolean; adult?: boolean }>(), { compact: false, adult: false });

const canvasEl = ref<HTMLCanvasElement | null>(null);
const studioEl = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
let engine: AvatarEngine | null = null;

const modelName = ref('');
const modelKind = ref<'VRM' | 'GLB' | ''>('');
const modelCreator = ref('');
const loading = ref(false);
const error = ref('');
const speaking = ref(false);
const microphoneLive = ref(false);
const showControls = ref(true);
const activeTab = ref<'perform' | 'motion' | 'stage'>('perform');
const selectedEmotion = ref<AvatarEmotion>('neutral');
const framing = ref<AvatarFraming>('full');
const quality = ref<AvatarQuality>('balanced');
const background = ref<'aurora' | 'midnight' | 'studio' | 'transparent'>('aurora');
const zoom = ref(1);
const idleAmount = ref(1);
const micSensitivity = ref(1.4);
const gazeEnabled = ref(true);
const idleEnabled = ref(true);
const reducedMotion = ref(false);
const dragging = ref(false);
const customBackground = ref('');
const customImage = ref('');
const cleanCover = ref(false);
const safeReady = ref(false);
let adultScene: { background: string; accent: string; lightIntensity: number; imageUrl?: string } | null = null;

const expressions: { id: AvatarEmotion; label: string }[] = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'happy', label: 'Happy' },
  { id: 'sad', label: 'Sad' },
  { id: 'angry', label: 'Angry' },
  { id: 'relaxed', label: 'Calm' },
  { id: 'surprised', label: 'Surprised' },
];

let presentationEpoch = 0;

function applyPresentation(adult: boolean) {
  const epoch = ++presentationEpoch;
  if (!adult) {
    cleanCover.value = !!modelName.value;
    safeReady.value = false;
    engine?.stopAudio();
    if (engine && modelName.value) {
      safeReady.value = engine.setCleanMode(true);
      customBackground.value = '#25211d';
      customImage.value = '';
      requestAnimationFrame(() => {
        if (epoch !== presentationEpoch) return;
        cleanCover.value = !safeReady.value;
      });
    } else {
      cleanCover.value = false;
    }
    return;
  }
  engine?.setCleanMode(false);
  safeReady.value = false;
  cleanCover.value = false;
  if (adultScene) {
    customBackground.value = adultScene.background;
    customImage.value = adultScene.imageUrl ?? '';
    engine?.setSceneLighting({ accent: adultScene.accent, intensity: adultScene.lightIntensity });
  }
}

function onCleanStart() {
  cleanCover.value = !!modelName.value;
  safeReady.value = false;
  applyPresentation(false);
}

async function openAvatar(file?: File) {
  if (!file || !engine) return;
  loading.value = true;
  error.value = '';
  try {
    const result = await engine.loadModel(file);
    modelName.value = result.name;
    modelKind.value = result.kind;
    modelCreator.value = result.meta ?? '';
    selectedEmotion.value = 'neutral';
    engine.setEmotion('neutral');
    applyPresentation(props.adult);
  } catch (reason: any) {
    error.value = reason?.message ?? String(reason);
  } finally {
    loading.value = false;
    dragging.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

function chooseExpression(emotion: AvatarEmotion) {
  selectedEmotion.value = emotion;
  engine?.setEmotion(emotion);
}

async function toggleMicrophone() {
  if (!engine) return;
  error.value = '';
  try {
    microphoneLive.value = await engine.toggleMicrophone();
  } catch (reason: any) {
    error.value = `Microphone unavailable: ${reason?.message ?? reason}`;
  }
}

function updatePointer(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  engine?.setPointer(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1),
  );
}

function saveSnapshot() {
  if (!engine || !modelName.value) return;
  if (!props.adult && !safeReady.value) {
    error.value = 'Snapshots are disabled while the Clean safety cover is active.';
    return;
  }
  const link = document.createElement('a');
  link.href = engine.snapshot();
  link.download = `${modelName.value.replace(/[^a-z0-9_-]+/gi, '-') || 'trolly-avatar'}.png`;
  link.click();
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await studioEl.value?.requestFullscreen();
  } catch (reason: any) {
    error.value = `Fullscreen unavailable: ${reason?.message ?? reason}`;
  }
}

function updateGaze() {
  engine?.setGaze(gazeEnabled.value);
}

function updateIdle() {
  engine?.setIdle(idleEnabled.value);
}

function updateReducedMotion() {
  engine?.setReducedMotion(reducedMotion.value);
}

function updateIdleAmount() {
  engine?.setIdleAmount(idleAmount.value);
}

function updateMicSensitivity() {
  engine?.setMicSensitivity(micSensitivity.value);
}

function updateFraming() {
  engine?.setFraming(framing.value);
}

function updateQuality() {
  engine?.setQuality(quality.value);
}

function updateZoom() {
  engine?.setZoom(zoom.value);
}

/** Called by chat after SAPI creates a reply. Resolves when playback ends. */
async function playSpeech(audioBase64: string, replyText = '') {
  if (!engine) throw new Error('The avatar stage is not ready yet.');
  if (replyText) {
    selectedEmotion.value = detectEmotion(replyText);
    engine.setEmotion(selectedEmotion.value);
  }
  microphoneLive.value = false;
  await engine.playSpeech(audioBase64);
}

function stopSpeech() {
  engine?.stopAudio();
  microphoneLive.value = false;
}

async function loadModelData(name: string, dataBase64: string) {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  await openAvatar(new File([bytes], name, { type: 'application/octet-stream' }));
  if (error.value) throw new Error(error.value);
}

function setHair(settings: { color: string; length: number; volume: number }) {
  engine?.setHair(settings);
}

function setSmile(value: number) {
  engine?.setSmile(value);
}

function applyGarment(garment: StudioGarment) {
  engine?.applyGarment(garment);
}

function removeGarment(id: string) {
  engine?.removeGarment(id);
}

function clearGarments() {
  engine?.clearGarments();
}

function setScene(scene: { background: string; accent: string; lightIntensity: number; imageUrl?: string }) {
  adultScene = { ...scene };
  if (!props.adult) {
    customBackground.value = '#25211d';
    customImage.value = '';
    engine?.setSceneLighting({ accent: '#ffd21a', intensity: 1 });
    return;
  }
  customBackground.value = scene.background;
  customImage.value = scene.imageUrl ?? '';
  engine?.setSceneLighting({ accent: scene.accent, intensity: scene.lightIntensity });
}

defineExpose({
  playSpeech, stopSpeech, loadModelData, setHair, setSmile,
  applyGarment, removeGarment, clearGarments, setScene,
});

watch(() => props.adult, (adult) => applyPresentation(adult));

onMounted(() => {
  if (!canvasEl.value) return;
  try {
    engine = new AvatarEngine(canvasEl.value, {
      onSpeaking: (value) => {
        speaking.value = value;
        emit('speaking-change', value);
      },
      onError: (message) => { error.value = message; },
    });
    engine.setGaze(gazeEnabled.value);
    engine.setIdleAmount(idleAmount.value);
    engine.setMicSensitivity(micSensitivity.value);
    window.addEventListener('trolly:clean-start', onCleanStart);
    applyPresentation(props.adult);
  } catch (reason: any) {
    error.value = `WebGL could not start: ${reason?.message ?? reason}`;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('trolly:clean-start', onCleanStart);
  engine?.dispose();
  engine = null;
});
</script>

<template>
  <section
    ref="studioEl"
    class="stage-visual avatar-studio"
    :class="[`backdrop-${background}`, { compact: props.compact, 'custom-scene': customBackground }]"
    :style="customBackground ? { '--scene-background': customBackground } : undefined"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="openAvatar($event.dataTransfer?.files?.[0])"
  >
    <div v-if="!props.compact" class="avatar-toolbar">
      <div class="avatar-title">
        <span class="status-dot" :class="{ live: speaking || microphoneLive }" />
        <strong>VTuber stage</strong>
        <span v-if="modelKind" class="avatar-format">{{ modelKind }}</span>
      </div>
      <div class="avatar-toolbar-actions">
        <button class="btn sm" @click="fileInput?.click()">{{ modelName ? 'Replace' : 'Load avatar' }}</button>
        <button class="btn sm" :class="{ primary: showControls }" @click="showControls = !showControls">
          Controls
        </button>
        <button class="btn sm icon-btn" title="Toggle fullscreen" aria-label="Toggle fullscreen" @click="fullscreen">⛶</button>
      </div>
    </div>

    <div
      class="avatar-viewport"
      :class="{ 'drop-active': dragging }"
      @pointermove="updatePointer"
      @pointerleave="engine?.setPointer(0, 0)"
    >
      <img v-if="customImage && props.adult" class="scene-backdrop-image" :src="customImage" alt="" />
      <canvas
        ref="canvasEl"
        class="avatar-canvas"
        aria-label="Interactive 3D VTuber avatar"
        :data-presentation="props.adult ? 'adult' : 'clean'"
        :data-safe-ready="safeReady ? 'true' : 'false'"
      />

      <div v-if="cleanCover && modelName" class="avatar-safety-cover" role="status">
        <strong>Clean stage</strong>
        <span>{{ safeReady ? 'Safe outfit ready' : 'Covering private visuals while the safe outfit is prepared' }}</span>
      </div>

      <div v-if="modelName" class="model-overlay">
        <strong>{{ modelName }}</strong>
        <span>{{ modelKind === 'VRM' ? 'Face rig ready' : 'Static rig · use VRM for face animation' }}</span>
      </div>

      <div v-if="microphoneLive" class="live-indicator"><span /> MIC LIVE</div>

      <div v-if="!modelName && !loading" class="avatar-welcome">
        <div class="welcome-kicker">LOCAL 3D · READY TO PERFORM</div>
        <div class="welcome-mark" aria-hidden="true"><span>T</span></div>
        <h2>Your character. Live on stage.</h2>
        <p>Drop in a VRM exported from VRoid Studio. Trolly will blink, breathe, watch your cursor, and move its mouth with speech.</p>
        <button class="btn primary avatar-load" @click="fileInput?.click()">Choose VRM or GLB</button>
        <small>or drag the file anywhere on this stage · nothing is uploaded</small>
      </div>

      <div v-if="loading" class="avatar-loading"><span class="spinner" /> Preparing your avatar…</div>
      <div v-if="dragging" class="drop-message">Drop your VRM or GLB to take the stage</div>

      <div v-if="modelName && !props.compact" class="expression-dock" aria-label="Avatar expressions">
        <button
          v-for="expression in expressions"
          :key="expression.id"
          :class="{ active: selectedEmotion === expression.id }"
          @click="chooseExpression(expression.id)"
        >{{ expression.label }}</button>
      </div>
    </div>

    <div v-if="error" class="avatar-error" role="alert">{{ error }}</div>

    <div v-if="showControls && !props.compact" class="avatar-console">
      <div class="console-tabs" role="tablist" aria-label="Avatar controls">
        <button :class="{ active: activeTab === 'perform' }" @click="activeTab = 'perform'">Perform</button>
        <button :class="{ active: activeTab === 'motion' }" @click="activeTab = 'motion'">Motion</button>
        <button :class="{ active: activeTab === 'stage' }" @click="activeTab = 'stage'">Stage</button>
        <span class="console-spacer" />
        <span class="console-local">LOCAL · NO UPLOADS</span>
      </div>

      <div v-if="activeTab === 'perform'" class="console-body perform-grid">
        <div class="console-action">
          <span class="control-label">VOICE-DRIVEN LIP SYNC</span>
          <strong>{{ speaking ? 'Speaking through the avatar' : microphoneLive ? 'Listening to your microphone' : 'Ready for speech or microphone' }}</strong>
          <p>Use Voice in chat for replies, or drive the mouth live with your mic.</p>
        </div>
        <button class="btn" :class="{ primary: microphoneLive }" :disabled="!modelName" @click="toggleMicrophone">
          {{ microphoneLive ? 'Stop microphone' : 'Start mic lip sync' }}
        </button>
        <label class="slider-control">Mic / voice sensitivity <output>{{ micSensitivity.toFixed(1) }}×</output>
          <input v-model.number="micSensitivity" type="range" min="0.4" max="2.6" step="0.1" @input="updateMicSensitivity" />
        </label>
      </div>

      <div v-else-if="activeTab === 'motion'" class="console-body motion-grid">
        <label class="toggle-control"><input v-model="gazeEnabled" type="checkbox" @change="updateGaze" /><span>Cursor gaze<small>Head and eyes follow your pointer</small></span></label>
        <label class="toggle-control"><input v-model="idleEnabled" type="checkbox" @change="updateIdle" /><span>Idle life<small>Breathing, sway, and natural blinking</small></span></label>
        <label class="toggle-control"><input v-model="reducedMotion" type="checkbox" @change="updateReducedMotion" /><span>Reduced motion<small>Minimize idle movement and blinking</small></span></label>
        <label class="slider-control">Motion intensity <output>{{ idleAmount.toFixed(1) }}×</output>
          <input v-model.number="idleAmount" type="range" min="0" max="2" step="0.1" @input="updateIdleAmount" />
        </label>
      </div>

      <div v-else class="console-body stage-grid">
        <label class="select-control">Background
          <select v-model="background"><option value="aurora">Aurora</option><option value="midnight">Midnight</option><option value="studio">Studio</option><option value="transparent">Transparent</option></select>
        </label>
        <label class="select-control">Camera
          <select v-model="framing" @change="updateFraming"><option value="full">Full body</option><option value="portrait">Portrait</option></select>
        </label>
        <label class="select-control">Render quality
          <select v-model="quality" @change="updateQuality"><option value="low">Battery saver</option><option value="balanced">Balanced</option><option value="high">High</option></select>
        </label>
        <label class="slider-control">Zoom <output>{{ Math.round(zoom * 100) }}%</output>
          <input v-model.number="zoom" type="range" min="0.65" max="2" step="0.05" @input="updateZoom" />
        </label>
        <button class="btn" :disabled="!modelName" @click="saveSnapshot">Save PNG snapshot</button>
      </div>
    </div>

    <div v-if="!props.compact" class="avatar-footer">
      <span>{{ modelName ? (modelCreator || modelName) : 'VRM 0.x / 1.0 · GLB · WebGL' }}</span>
      <span>Drag to orbit · Scroll to zoom</span>
    </div>
    <input ref="fileInput" type="file" accept=".vrm,.glb" hidden @change="openAvatar(($event.target as HTMLInputElement).files?.[0])" />
  </section>
</template>

<style scoped>
.custom-scene .avatar-viewport { background: var(--scene-background); }
.scene-backdrop-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .72; }
.scene-backdrop-image + .avatar-canvas { z-index: 1; }
.avatar-studio.compact { width: 100%; height: 100%; min-height: 420px; }
.avatar-safety-cover { position: absolute; inset: 0; z-index: 8; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; background: #15120f; color: #ffd21a; text-align: center; }
.avatar-safety-cover strong { font-size: 18px; }
.avatar-safety-cover span { max-width: 340px; color: #c1b6a6; font-size: 12px; line-height: 1.5; }
</style>
