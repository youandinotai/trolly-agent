<script setup lang="ts">
import { onMounted, ref } from 'vue';

import StageView from './views/StageView.vue';
import McpView from './views/McpView.vue';
import ProvidersView from './views/ProvidersView.vue';
import ArtistryView from './views/ArtistryView.vue';
import MindView from './views/MindView.vue';
import StudioView from './views/StudioView.vue';
import FloatingPets from './components/FloatingPets.vue';
import VaultPanel from './components/VaultPanel.vue';
import { appMode, applyModeState, loadMode, setAdultMode } from './lib/mode';

type ViewId = 'stage' | 'mcp' | 'providers' | 'artistry' | 'studio' | 'mind';

const view = ref<ViewId>('stage');
const vaultOpen = ref(false);

const NAV: { id: ViewId; label: string }[] = [
  { id: 'stage', label: 'Stage' },
  { id: 'mcp', label: 'Tools (MCP)' },
  { id: 'providers', label: 'Providers' },
  { id: 'artistry', label: 'Artistry' },
  { id: 'studio', label: 'Studio' },
  { id: 'mind', label: 'Mind' },
];

const ollamaOnline = ref(false);
const modelCount = ref(0);
const comfyOnline = ref(false);
const hermesOnline = ref(false);
const mcpConnected = ref(0);
const mcpTotal = ref(0);
const dataDir = ref('');
const modeBusy = ref(false);

/** Toggle the global content mode. The age gate lives in the Mind store. */
function onCleanHotkey(event: KeyboardEvent) {
  if (!event.ctrlKey || !event.altKey || event.code !== 'KeyC') return;
  event.preventDefault();
  void setAdultMode(false);
}

async function toggleAdult() {
  if (modeBusy.value) return;
  modeBusy.value = true;
  try {
    await setAdultMode(!appMode.adult);
  } finally {
    modeBusy.value = false;
  }
}

async function refreshHealth() {
  try {
    const models = await window.trolly.ollama.models();
    ollamaOnline.value = true;
    modelCount.value = models.length;
  } catch {
    ollamaOnline.value = false;
    modelCount.value = 0;
  }
  try {
    const status = await window.trolly.comfy.status();
    comfyOnline.value = !!status.online;
  } catch {
    comfyOnline.value = false;
  }
  try {
    const status = await window.trolly.hermes.status();
    hermesOnline.value = !!status.online;
  } catch {
    hermesOnline.value = false;
  }
  try {
    const servers = await window.trolly.mcp.list();
    mcpTotal.value = servers.length;
    mcpConnected.value = servers.filter((s: any) => s.status === 'connected').length;
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  const paths = await window.trolly.paths();
  dataDir.value = paths.dataDir;
  await loadMode();
  window.trolly.mode.onChanged(applyModeState);
  window.addEventListener('keydown', onCleanHotkey);
  await refreshHealth();
  window.trolly.mcp.onChanged(() => refreshHealth());
  setInterval(refreshHealth, 8000);
});
</script>

<template>
  <div class="shell">
    <aside class="rail">
      <div class="rail-brand">
        <div class="rail-mark">T</div>
        <div>
          <div class="rail-title">Trolly Agent</div>
          <div class="rail-sub">desktop companion</div>
        </div>
      </div>

      <nav class="rail-nav">
        <button
          v-for="item in NAV"
          :key="item.id"
          class="rail-item"
          :class="{ active: view === item.id }"
          @click="view = item.id"
        >
          <span class="rail-dot" />
          {{ item.label }}
        </button>
      </nav>

      <div class="rail-foot">
        <div><code>{{ dataDir || 'D:\\…' }}</code></div>
        <div>{{ mcpConnected }}/{{ mcpTotal }} tool servers</div>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <h1>{{ NAV.find((n) => n.id === view)?.label }}</h1>
        <div class="spacer" />
        <span class="chip" :class="ollamaOnline ? 'online' : 'offline'">
          <span class="led" />
          Ollama {{ ollamaOnline ? `${modelCount} models` : 'offline' }}
        </span>
        <span class="chip" :class="comfyOnline ? 'online' : 'offline'">
          <span class="led" />
          ComfyUI {{ comfyOnline ? 'ready' : 'offline' }}
        </span>
        <span class="chip" :class="hermesOnline ? 'online' : ''" title="Optional Hermes ethics and QA reviewer">
          <span class="led" />
          Hermes {{ hermesOnline ? 'review' : 'offline' }}
        </span>
        <span class="chip" :class="mcpConnected ? 'online' : ''">
          <span class="led" />
          MCP {{ mcpConnected }}/{{ mcpTotal }}
        </span>

        <div class="mode-switch" :title="appMode.gateError || 'How the agent answers'">
          <button
            class="mode-btn"
            :class="{ active: !appMode.adult }"
            @click="setAdultMode(false)"
          >
            SFW
          </button>
          <button
            class="mode-btn"
            :class="{ active: appMode.adult }"
            :disabled="!appMode.ageVerified || modeBusy"
            :title="
              appMode.ageVerified
                ? 'Adult content mode'
                : 'Complete the age check in Mind to enable adult mode'
            "
            @click="toggleAdult()"
          >
            Adult
          </button>
        </div>

        <button
          class="chip"
          :class="appMode.brainstorming ? 'online' : ''"
          title="Always offer options, push back, and end with a next step"
          @click="appMode.brainstorming = !appMode.brainstorming"
        >
          <span class="led" />
          Brainstorm
        </button>
        <button class="chip" type="button" title="Quick cover. Opens an AI news page. Esc brings this screen back. Does not change SFW." @click="window.trolly.glance.toggle()">
          News
        </button>
        <button class="chip" type="button" title="Locked image vault" @click="vaultOpen = true">
          Vault
        </button>
      </header>

      <section v-if="!appMode.adult" class="clean-status" role="status">
        <strong>SFW</strong>
        <span>Top switch covers every picture, pet, and clip · Ctrl+Alt+C</span>
      </section>
      <StageView v-show="view === 'stage'" @navigate="view = $event" />
      <McpView v-show="view === 'mcp'" />
      <ProvidersView v-show="view === 'providers'" />
      <ArtistryView v-show="view === 'artistry'" />
      <StudioView v-show="view === 'studio'" />
      <MindView v-show="view === 'mind'" />
      <VaultPanel v-if="vaultOpen" @back="vaultOpen = false" />
    </main>
    <FloatingPets />
    <button
      class="clean-pet"
      :class="{ armed: appMode.adult }"
      type="button"
      title="SFW. Hides every adult picture, pet, and clip."
      @click="setAdultMode(false)"
    >
      <span class="clean-pet-mark" aria-hidden="true" />
      <span>SFW</span>
    </button>
  </div>
</template>
