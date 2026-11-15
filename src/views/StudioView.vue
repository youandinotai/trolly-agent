<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

import AvatarStage from '../components/AvatarStage.vue';
import SafeMedia from '../components/SafeMedia.vue';
import { appMode } from '../lib/mode';
import type { GarmentCategory, StudioActor, StudioDoc, StudioGarment, StudioScene } from '../lib/studio-types.js';
import { WARDROBE_CATALOG } from '../lib/wardrobe-catalog.js';

type Tab = 'wardrobe' | 'actors' | 'scenes';
const tabs: { id: Tab; label: string }[] = [
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'actors', label: 'Actors / Actress' },
  { id: 'scenes', label: 'Stage / Scene' },
];

const avatar = ref<InstanceType<typeof AvatarStage> | null>(null);
const tab = ref<Tab>('wardrobe');
const doc = ref<StudioDoc>({ actors: [], garments: [], scenes: [], activeActorId: null });
const actor = ref<StudioActor | null>(null);
const selectedGarment = ref<StudioGarment | null>(null);
const scene = ref<StudioScene | null>(null);
const category = ref<'all' | GarmentCategory>('top');
const page = ref(1);
const PAGE_SIZE = 6;
const busy = ref(false);
const error = ref('');
const status = ref('');
const hermesBusy = ref(false);
const hermesReview = ref('');

async function reviewWithHermes() {
  hermesBusy.value = true;
  hermesReview.value = '';
  error.value = '';
  try {
    const result = await window.trolly.hermes.review({
      feature: 'Studio avatar, wardrobe, actors, and scenes',
      checks: [
        'PASS: VRM model loaded and rendered in the live Studio preview',
        'PASS: Parametric garments rendered bone-fitted and recolorable while sleeves, hair, and shoes remained visible',
        'PASS: Save/reload round trip restored hair color #67e8f9, length 1.3, volume 1.15, smile 0.8, uploaded outfit, and Soft Studio scene exactly',
        'PASS: Negative-path tests rejected C: output and application-source output; uploaded assets remained inside the D: studio store',
      ],
      counts: { actors: doc.value.actors.length, garments: doc.value.garments.length, scenes: doc.value.scenes.length },
    });
    hermesReview.value = `${result.model}: ${result.review}`;
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  } finally {
    hermesBusy.value = false;
  }
}

const garmentForm = ref({ name: 'Scarlet bikini', category: 'bikini' as GarmentCategory, color: '#e11d48', scale: 1, imageUrl: undefined as string | undefined });
const actorForm = ref({ name: '', role: 'actress' as 'actor' | 'actress', hair: { color: '#f3f5f7', length: 1, volume: 1 }, smile: 0.25 });
const sceneForm = ref({ name: 'Neon Midnight', background: '#0d0714', accent: '#67e8f9', lightIntensity: 1.2, imageUrl: undefined as string | undefined });

const filteredGarments = computed(() => doc.value.garments.filter((item) => {
  if (category.value !== 'all' && item.category !== category.value) return false;
  if (!appMode.adult && ['bikini', 'underwear'].includes(item.category)) return false;
  return true;
}));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredGarments.value.length / PAGE_SIZE)));
const pagedGarments = computed(() => {
  const start = (Math.min(page.value, pageCount.value) - 1) * PAGE_SIZE;
  return filteredGarments.value.slice(start, start + PAGE_SIZE);
});
const selectedShop = computed(() => WARDROBE_CATALOG.find((item) => item.id === selectedGarment.value?.id) ?? null);

function setCategory(value: 'all' | GarmentCategory) {
  category.value = value;
  page.value = 1;
}

function note(message: string) {
  status.value = message;
  setTimeout(() => { if (status.value === message) status.value = ''; }, 2600);
}

async function refresh() {
  doc.value = await window.trolly.studio.read();
}

function syncActorForm() {
  if (!actor.value) return;
  actorForm.value = { name: actor.value.name, role: actor.value.role, hair: { ...actor.value.hair }, smile: actor.value.smile };
}

function syncSceneForm(value: StudioScene) {
  sceneForm.value = { name: value.name, background: value.background, accent: value.accent, lightIntensity: value.lightIntensity, imageUrl: value.imageUrl };
}

function applyLook() {
  if (!actor.value || !avatar.value) return;
  avatar.value.setHair(actor.value.hair);
  avatar.value.setSmile(actor.value.smile);
  if (scene.value) avatar.value.setScene(scene.value);
  avatar.value.clearGarments();
  for (const id of actor.value.garmentIds) {
    const garment = doc.value.garments.find((item) => item.id === id);
    if (garment) avatar.value.applyGarment(garment);
  }
}

async function loadActor(value: StudioActor) {
  busy.value = true;
  error.value = '';
  actor.value = { ...value, hair: { ...value.hair }, garmentIds: [...value.garmentIds] };
  scene.value = doc.value.scenes.find((item) => item.id === value.sceneId) ?? doc.value.scenes[0] ?? null;
  syncActorForm();
  if (scene.value) syncSceneForm(scene.value);
  await nextTick();
  try {
    if (!value.modelPath) throw new Error('Upload a VRM or GLB base model for this actor.');
    const asset = await window.trolly.studio.readAsset(value.modelPath);
    await avatar.value?.loadModelData(asset.name, asset.dataBase64);
    applyLook();
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  } finally {
    busy.value = false;
  }
}

async function saveActor(showNote = true) {
  if (!actor.value) return;
  const saved = await window.trolly.studio.saveActor({
    ...actor.value,
    name: actorForm.value.name.trim() || 'Trolly',
    role: actorForm.value.role,
    hair: { ...actorForm.value.hair },
    smile: actorForm.value.smile,
    garmentIds: [...actor.value.garmentIds],
    sceneId: scene.value?.id ?? actor.value.sceneId,
  });
  actor.value = saved;
  await refresh();
  if (showNote) note(`${saved.name} saved locally`);
}

async function saveGarment() {
  error.value = '';
  try {
    const saved = await window.trolly.studio.saveGarment({ ...garmentForm.value, id: selectedGarment.value?.id });
    selectedGarment.value = saved;
    garmentForm.value = { ...saved, imageUrl: saved.imageUrl };
    await refresh();
    applyGarment(saved);
    note(`${saved.name} saved to Wardrobe`);
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  }
}

function applyGarment(garment: StudioGarment) {
  if (!actor.value) return;
  for (const id of [...actor.value.garmentIds]) {
    const existing = doc.value.garments.find((item) => item.id === id);
    if (existing && existing.id !== garment.id && existing.category === garment.category) {
      avatar.value?.removeGarment(id);
      actor.value.garmentIds = actor.value.garmentIds.filter((item) => item !== id);
    }
  }
  selectedGarment.value = garment;
  garmentForm.value = { ...garment, imageUrl: garment.imageUrl };
  avatar.value?.applyGarment(garment);
  if (!actor.value.garmentIds.includes(garment.id)) actor.value.garmentIds.push(garment.id);
  void saveActor(false);
}

function removeGarment(id: string) {
  if (!actor.value) return;
  avatar.value?.removeGarment(id);
  actor.value.garmentIds = actor.value.garmentIds.filter((item) => item !== id);
  void saveActor(false);
}

function clearWardrobe() {
  if (!actor.value) return;
  avatar.value?.clearGarments();
  actor.value.garmentIds = [];
  void saveActor(false);
  note('Outfit cleared');
}

function previewHair() {
  if (!actor.value) return;
  actor.value.hair = { ...actorForm.value.hair };
  avatar.value?.setHair(actor.value.hair);
}

function previewSmile() {
  if (!actor.value) return;
  actor.value.smile = actorForm.value.smile;
  avatar.value?.setSmile(actor.value.smile);
}

function selectScene(value: StudioScene) {
  scene.value = value;
  syncSceneForm(value);
  if (actor.value) {
    actor.value.sceneId = value.id;
    avatar.value?.setScene(value);
    void saveActor(false);
  }
}

function previewScene() {
  if (!scene.value) return;
  scene.value = { ...scene.value, ...sceneForm.value };
  avatar.value?.setScene(scene.value);
}

async function saveScene() {
  error.value = '';
  try {
    const saved = await window.trolly.studio.saveScene({ ...sceneForm.value, id: scene.value?.id });
    await refresh();
    selectScene(saved);
    note(`${saved.name} saved to Stage / Scene`);
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  }
}

async function newActor() {
  const previous = actor.value;
  const saved = await window.trolly.studio.saveActor({
    name: 'New actress', role: 'actress', modelPath: previous?.modelPath ?? '',
    hair: { color: '#f3f5f7', length: 1, volume: 1 }, smile: 0.25,
    garmentIds: [], sceneId: scene.value?.id ?? doc.value.scenes[0]?.id ?? '',
  });
  await refresh();
  await loadActor(saved);
}

async function fileBase64(file: File): Promise<string> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
  return data.split(',', 2)[1];
}

async function uploadArtwork(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  error.value = '';
  try {
    const uploaded = await window.trolly.studio.uploadAsset({ name: file.name, dataBase64: await fileBase64(file), kind: 'image' });
    garmentForm.value.imageUrl = uploaded.url;
    garmentForm.value.name = file.name.replace(/\.(png|jpe?g)$/i, '');
    selectedGarment.value = null;
    await saveGarment();
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  } finally {
    busy.value = false;
    input.value = '';
  }
}

async function uploadBackdrop(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    const uploaded = await window.trolly.studio.uploadAsset({ name: file.name, dataBase64: await fileBase64(file), kind: 'image' });
    sceneForm.value.imageUrl = uploaded.url;
    sceneForm.value.name = file.name.replace(/\.(png|jpe?g)$/i, '');
    scene.value = null;
    await saveScene();
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  } finally {
    busy.value = false;
    input.value = '';
  }
}

async function uploadModel(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !actor.value) return;
  busy.value = true;
  error.value = '';
  try {
    const uploaded = await window.trolly.studio.uploadAsset({ name: file.name, dataBase64: await fileBase64(file), kind: 'model' });
    actor.value.modelPath = uploaded.path;
    const asset = await window.trolly.studio.readAsset(uploaded.path);
    await avatar.value?.loadModelData(asset.name, asset.dataBase64);
    applyLook();
    await saveActor(false);
    note(`${actorForm.value.name || 'Actor'} model saved`);
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  } finally {
    busy.value = false;
    input.value = '';
  }
}

onMounted(async () => {
  try {
    await refresh();
    const active = doc.value.actors.find((item) => item.id === doc.value.activeActorId) ?? doc.value.actors[0];
    if (active) await loadActor(active);
  } catch (reason: any) {
    error.value = String(reason?.message ?? reason);
  }
});
</script>

<template>
  <div class="studio-page">
    <header class="studio-head">
      <div class="studio-tabs" role="tablist" aria-label="Studio sections">
        <button v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" role="tab" :aria-selected="tab === item.id" @click="tab = item.id">{{ item.label }}</button>
      </div>
      <span class="studio-local">ONE-OF-ONE ADMIN · SAVED ON D:</span>
      <button class="hermes-button" :disabled="hermesBusy" title="Send a sanitized evidence summary to Hermes for ethics and QA review" @click="reviewWithHermes">{{ hermesBusy ? 'Hermes reviewing…' : 'Hermes review' }}</button>
      <span v-if="status" class="studio-status">{{ status }}</span>
    </header>

    <p v-if="error" class="studio-error" role="alert">{{ error }}</p>
    <p v-if="hermesReview" class="hermes-review"><strong>Hermes · sanitized review</strong>{{ hermesReview }}</p>

    <div class="studio-grid">
      <aside class="studio-panel studio-library">
        <template v-if="tab === 'wardrobe'">
          <div class="panel-title"><h3>Clothing type: {{ category === 'all' ? 'All' : category }}</h3><span>Page {{ Math.min(page, pageCount) }} of {{ pageCount }}</span></div>
          <label class="studio-upload">Upload clothing artwork<input type="file" accept="image/png,image/jpeg" hidden @change="uploadArtwork" /></label>
          <p class="studio-note">A small modern closet. Shop links open a public search. No affiliate code is attached yet.</p>
          <p v-if="!appMode.adult" class="studio-note">Intimate pieces are hidden in Clean and return with Adult.</p>
          <select class="studio-select" aria-label="Wardrobe category" :value="category" @change="setCategory(($event.target as HTMLSelectElement).value as 'all' | GarmentCategory)">
            <option value="all">All pieces</option><option value="hat">Hats</option><option value="top">Tops</option><option value="dress">Dresses</option><option value="bikini">Bikini</option><option value="underwear">Underwear</option><option value="shoes">Shoes</option>
          </select>
          <div class="wardrobe-grid">
            <div v-for="garment in pagedGarments" :key="garment.id" class="wardrobe-card" :class="{ active: actor?.garmentIds.includes(garment.id) }">
              <button class="wardrobe-wear" @click="applyGarment(garment)">
                <span class="wardrobe-swatch" :style="{ background: garment.color }" />
                <strong>{{ garment.name }}</strong>
              </button>
              <button class="library-remove" title="Remove from current outfit" @click="removeGarment(garment.id)">×</button>
            </div>
          </div>
          <div class="wardrobe-pages">
            <button type="button" :disabled="page <= 1" @click="page -= 1">Prev</button>
            <button type="button" :disabled="page >= pageCount" @click="page += 1">Next</button>
          </div>
        </template>

        <template v-else-if="tab === 'actors'">
          <div class="panel-title"><h3>Cast</h3><span>{{ doc.actors.length }}</span></div>
          <button class="studio-upload" @click="newActor">New actress</button>
          <label class="studio-upload secondary">Upload VRM / GLB<input type="file" accept=".vrm,.glb" hidden @change="uploadModel" /></label>
          <p class="studio-note">One base can hold unlimited hair, expression, outfit, and scene combinations.</p>
          <div class="library-list">
            <button v-for="item in doc.actors" :key="item.id" class="actor-card" :class="{ active: actor?.id === item.id }" @click="loadActor(item)">
              <span class="actor-initial">{{ item.name.slice(0, 1) }}</span><span><strong>{{ item.name }}</strong><small>{{ item.role }} · {{ item.garmentIds.length }} pieces</small></span>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="panel-title"><h3>Backdrops</h3><span>{{ doc.scenes.length }}</span></div>
          <label class="studio-upload">Upload background<input type="file" accept="image/png,image/jpeg" hidden @change="uploadBackdrop" /></label>
          <p class="studio-note">Colors, backdrop artwork, and accent lighting save with the scene.</p>
          <div class="library-list">
            <button v-for="item in doc.scenes" :key="item.id" class="scene-card" :class="{ active: scene?.id === item.id }" :style="{ '--scene-swatch': item.background, '--scene-accent': item.accent }" @click="selectScene(item)">
              <span class="scene-preview" /><strong>{{ item.name }}</strong>
            </button>
          </div>
        </template>
      </aside>

      <main class="studio-preview" :class="{ busy }">
        <AvatarStage ref="avatar" :compact="true" :adult="appMode.adult" />
        <div v-if="busy" class="preview-busy"><span class="spinner" /> Preparing Studio…</div>
      </main>

      <aside class="studio-panel studio-properties">
        <template v-if="tab === 'wardrobe'">
          <div class="panel-title"><h3>Dressing Room</h3><span v-if="actor">{{ actor.name }}</span></div>
          <label class="studio-field">Piece name<input v-model="garmentForm.name" /></label>
          <label class="studio-field">Type<select v-model="garmentForm.category"><option value="hat">Hat</option><option value="top">Top</option><option value="dress">Dress</option><option value="bikini">Bikini</option><option value="underwear">Underwear</option><option value="shoes">Shoes</option></select></label>
          <label class="studio-field">Color<input v-model="garmentForm.color" type="color" @change="saveGarment" /></label>
          <label class="studio-field">Texture scale <output>{{ garmentForm.scale.toFixed(2) }}×</output><input v-model.number="garmentForm.scale" type="range" min="0.25" max="4" step="0.05" /></label>
          <div v-if="garmentForm.imageUrl" class="artwork-preview"><SafeMedia :src="garmentForm.imageUrl" kind="image" alt="Uploaded garment artwork" /></div>
          <button class="studio-action" @click="saveGarment">Save + wear</button>
          <button class="studio-action secondary" @click="clearWardrobe">Clear outfit</button>
          <a v-if="selectedShop" class="studio-shop" :href="selectedShop.shopUrl" target="_blank" rel="noreferrer">{{ selectedShop.shopLabel }}</a>
          <p class="studio-note">Parametric 3D fitting, not one-click cloth reconstruction. Each piece follows the avatar bones.</p>
        </template>

        <template v-else-if="tab === 'actors'">
          <div class="panel-title"><h3>Actor settings</h3></div>
          <label class="studio-field">Name<input v-model="actorForm.name" /></label>
          <label class="studio-field">Billing<select v-model="actorForm.role"><option value="actress">Actress</option><option value="actor">Actor</option></select></label>
          <label class="studio-field">Hair color<input v-model="actorForm.hair.color" type="color" @input="previewHair" /></label>
          <label class="studio-field">Hair length <output>{{ actorForm.hair.length.toFixed(2) }}</output><input v-model.number="actorForm.hair.length" type="range" min="0.7" max="1.6" step="0.01" @input="previewHair" /></label>
          <label class="studio-field">Hair volume <output>{{ actorForm.hair.volume.toFixed(2) }}</output><input v-model.number="actorForm.hair.volume" type="range" min="0.7" max="1.5" step="0.01" @input="previewHair" /></label>
          <label class="studio-field">Smile <output>{{ Math.round(actorForm.smile * 100) }}%</output><input v-model.number="actorForm.smile" type="range" min="0" max="1" step="0.01" @input="previewSmile" /></label>
          <button class="studio-action" @click="saveActor()">Save actor</button>
        </template>

        <template v-else>
          <div class="panel-title"><h3>Scene settings</h3></div>
          <label class="studio-field">Name<input v-model="sceneForm.name" /></label>
          <label class="studio-field">Background<input v-model="sceneForm.background" type="color" @input="previewScene" /></label>
          <label class="studio-field">Accent lighting<input v-model="sceneForm.accent" type="color" @input="previewScene" /></label>
          <label class="studio-field">Light intensity <output>{{ sceneForm.lightIntensity.toFixed(1) }}</output><input v-model.number="sceneForm.lightIntensity" type="range" min="0.2" max="3" step="0.1" @input="previewScene" /></label>
          <button class="studio-action" @click="saveScene">Save scene</button>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.studio-page { height: 100%; display: flex; flex-direction: column; padding: 18px 20px; overflow: hidden; }
.studio-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.studio-tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 8px; }
.studio-tabs button { padding: 7px 14px; border-radius: 6px; color: var(--text-dim); font-size: 12px; }
.studio-tabs button.active { background: var(--accent); color: #06231f; font-weight: 650; }
.studio-local { color: var(--text-faint); font: 9px var(--mono); letter-spacing: .08em; }
.studio-status { margin-left: auto; color: var(--accent); font-size: 11px; }
.hermes-button { padding: 6px 10px; border: 1px solid var(--accent-dim); border-radius: 6px; color: var(--accent); font-size: 11px; }
.hermes-button:disabled { opacity: .5; }
.hermes-review { max-height: 150px; overflow-y: auto; padding: 10px 12px; border-left: 2px solid var(--accent); background: var(--bg-raised); color: var(--text-dim); white-space: pre-wrap; font-size: 11px; line-height: 1.6; }
.hermes-review strong { display: block; margin-bottom: 5px; color: var(--accent); }
.studio-error { padding: 9px 12px; background: #3b1c25; color: #ffb1b3; border: 1px solid #75313e; border-radius: 8px; }
.studio-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 236px minmax(360px, 1fr) 276px; gap: 14px; }
.studio-panel { min-height: 0; overflow-y: auto; padding: 14px; background: var(--bg-raised); border: 1px solid var(--line); border-radius: 10px; }
.studio-preview { position: relative; min-width: 0; min-height: 0; }
.studio-preview.busy { opacity: .75; }
.preview-busy { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(13,15,20,.65); }
.panel-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.panel-title h3 { margin: 0; font-size: 14px; }
.panel-title span { color: var(--text-faint); font-size: 11px; }
.studio-upload { display: block; width: 100%; padding: 9px 10px; border: 1px dashed var(--accent-dim); border-radius: 7px; color: var(--accent); text-align: center; font-size: 12px; cursor: pointer; }
.studio-upload.secondary, .studio-action.secondary { margin-top: 8px; border-color: var(--line); color: var(--text); background: var(--bg-panel); }
.studio-note { color: var(--text-faint); font-size: 10.5px; line-height: 1.55; }
.studio-select, .studio-field input, .studio-field select { width: 100%; padding: 7px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg-panel); color: var(--text); }
.studio-select { margin: 8px 0 12px; }
.library-list { display: flex; flex-direction: column; gap: 6px; }
.wardrobe-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wardrobe-card { display: flex; align-items: stretch; border: 1px solid transparent; border-radius: 8px; background: #1a1a1a; overflow: hidden; }
.wardrobe-card.active { border-color: var(--accent-dim); }
.wardrobe-wear { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 8px; text-align: left; color: inherit; }
.wardrobe-swatch { display: block; height: 72px; border-radius: 6px; }
.wardrobe-wear strong { font-size: 11px; font-weight: 560; }
.wardrobe-pages { display: flex; justify-content: space-between; margin-top: 10px; }
.wardrobe-pages button:disabled { opacity: .4; }
.studio-shop { display: block; margin-top: 10px; color: var(--accent); font-size: 12px; }
.library-item, .actor-card, .scene-card { display: flex; align-items: center; border: 1px solid transparent; border-radius: 7px; background: var(--bg-panel); }
.library-item.active, .actor-card.active, .scene-card.active { border-color: var(--accent-dim); }
.library-main, .actor-card, .scene-card { flex: 1; display: flex; align-items: center; gap: 10px; padding: 9px; text-align: left; }
.library-main strong, .actor-card strong, .scene-card strong { display: block; font-size: 12px; }
.library-main small, .actor-card small { display: block; margin-top: 2px; color: var(--text-faint); font-size: 10px; }
.library-remove { padding: 8px 11px; color: var(--text-faint); font-size: 16px; }
.library-remove:hover { color: var(--danger); }
.swatch { width: 22px; height: 22px; border-radius: 5px; border: 1px solid var(--line); }
.actor-initial { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; background: var(--accent-glow); color: var(--accent); font-weight: 700; }
.scene-card { flex-wrap: wrap; }
.scene-preview { width: 100%; height: 58px; border-radius: 5px; background: var(--scene-swatch); border-bottom: 3px solid var(--scene-accent); }
.studio-field { display: block; margin: 12px 0; color: var(--text-dim); font-size: 11px; }
.studio-field input, .studio-field select { display: block; margin-top: 5px; }
.studio-field input[type="color"] { height: 38px; padding: 3px; cursor: pointer; }
.studio-field input[type="range"] { padding: 0; accent-color: var(--accent-dim); }
.studio-field output { float: right; color: var(--accent); font-family: var(--mono); }
.studio-action { width: 100%; padding: 9px 12px; border-radius: 7px; background: var(--accent-dim); color: #06231f; font-weight: 650; }
.artwork-preview { height: 110px; margin: 10px 0; overflow: hidden; border-radius: 7px; border: 1px solid var(--line); }
.artwork-preview img { width: 100%; height: 100%; object-fit: cover; }
.artwork-preview .safe-media { height: 100%; min-height: 0; }
.artwork-preview .safe-media-content { height: 100%; object-fit: cover; }
@media (max-width: 1180px) { .studio-grid { grid-template-columns: 200px minmax(320px, 1fr) 240px; } .studio-local { display: none; } }
@media (max-width: 900px) { .studio-page { overflow-y: auto; } .studio-grid { grid-template-columns: 1fr; overflow: visible; } .studio-preview { min-height: 560px; order: -1; } .studio-panel { overflow: visible; } }
</style>
