<script setup lang="ts">
import { onMounted, ref } from 'vue';

import type { Memory, MindDoc, Persona, Preferences, Recipe } from '../env';

type Tab = 'Consciousness' | 'Memories' | 'Recipes' | 'Preferences';

const TABS: Tab[] = ['Consciousness', 'Memories', 'Recipes', 'Preferences'];

const tab = ref<Tab>('Consciousness');
const doc = ref<MindDoc>({
  personas: [],
  memories: [],
  recipes: [],
  preferences: { adultContent: false, ageVerified: false },
});
const status = ref('');

/* Consciousness */
const personaName = ref('');
const personaContent = ref('');

/* Memories */
const memTitle = ref('');
const memContent = ref('');
const memTags = ref('');
const editingMemory = ref<string | null>(null);

/* Recipes */
const recTitle = ref('');
const recPrompt = ref('');
const editingRecipe = ref<string | null>(null);

/* Preferences: adult content is a preference gated behind an age check. */
const prefs = ref<Preferences>({ adultContent: false, ageVerified: false });
const birthYear = ref('');
const confirmLegalAdult = ref(false);
const prefsError = ref('');

async function loadPrefs() {
  prefs.value = await window.trolly.mind.readPrefs();
}

async function verifyAge() {
  prefsError.value = '';
  try {
    prefs.value = await window.trolly.mind.verifyAge(Number(birthYear.value));
    note('Age check recorded');
  } catch (err: any) {
    prefsError.value = String(err?.message ?? err);
  }
}

async function toggleAdultContent(on: boolean) {
  prefsError.value = '';
  try {
    prefs.value = await window.trolly.mind.setAdultContent(on);
    note(on ? 'Adult content enabled' : 'Adult content disabled');
  } catch (err: any) {
    prefsError.value = String(err?.message ?? err);
    // Reflect the server-side truth if the change was refused.
    prefs.value = await window.trolly.mind.readPrefs();
  }
}

async function resetVerification() {
  prefsError.value = '';
  prefs.value = await window.trolly.mind.resetVerification();
  birthYear.value = '';
  confirmLegalAdult.value = false;
  note('Age check cleared');
}

async function load() {
  doc.value = await window.trolly.mind.read();
  await loadPrefs();
  const p = doc.value.personas[doc.value.personas.length - 1];
  if (p) {
    personaName.value = p.name;
    personaContent.value = p.content;
  }
}

function note(msg: string) {
  status.value = msg;
  setTimeout(() => {
    status.value = '';
  }, 2200);
}

async function savePersona() {
  const saved = await window.trolly.mind.savePersona({
    name: personaName.value,
    content: personaContent.value,
  });
  doc.value = await window.trolly.mind.read();
  note(`Consciousness saved at ${new Date(saved.updatedAt).toLocaleTimeString()}`);
}

async function saveMemory() {
  await window.trolly.mind.saveMemory({
    id: editingMemory.value ?? undefined,
    title: memTitle.value,
    content: memContent.value,
    tags: memTags.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  });
  memTitle.value = '';
  memContent.value = '';
  memTags.value = '';
  editingMemory.value = null;
  doc.value = await window.trolly.mind.read();
  note('Memory stored');
}

function editMemory(m: Memory) {
  editingMemory.value = m.id;
  memTitle.value = m.title;
  memContent.value = m.content;
  memTags.value = m.tags.join(', ');
  tab.value = 'Memories';
}

async function removeMemory(id: string) {
  await window.trolly.mind.deleteMemory(id);
  doc.value = await window.trolly.mind.read();
  note('Memory forgotten');
}

async function saveRecipe() {
  await window.trolly.mind.saveRecipe({
    id: editingRecipe.value ?? undefined,
    title: recTitle.value,
    prompt: recPrompt.value,
  });
  recTitle.value = '';
  recPrompt.value = '';
  editingRecipe.value = null;
  doc.value = await window.trolly.mind.read();
  note('Recipe saved');
}

function editRecipe(r: Recipe) {
  editingRecipe.value = r.id;
  recTitle.value = r.title;
  recPrompt.value = r.prompt;
  tab.value = 'Recipes';
}

async function removeRecipe(id: string) {
  await window.trolly.mind.deleteRecipe(id);
  doc.value = await window.trolly.mind.read();
  note('Recipe deleted');
}

onMounted(load);
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div>
        <h2>Mind</h2>
        <p class="hint">
          Who the agent is, what it remembers, and the prompts it reuses. Stored as plain
          JSON on this machine, with no cloud and no account.
        </p>
      </div>
      <span v-if="status" class="badge">{{ status }}</span>
    </header>

    <div class="tabs" style="margin-bottom: 14px">
      <button
        v-for="t in TABS"
        :key="t"
        class="tab"
        :class="{ active: tab === t }"
        @click="tab = t"
      >
        {{ t }}
      </button>
    </div>

    <!-- Consciousness -->
    <section v-if="tab === 'Consciousness'" class="panel">
      <h2>Consciousness</h2>
      <p class="hint">
        The persona the agent speaks with. This text is prepended to every conversation, so
        write it like instructions to yourself.
      </p>
      <div class="field">
        <label>Name</label>
        <input v-model="personaName" class="input" placeholder="Trolly" />
      </div>
      <div class="field">
        <label>Persona</label>
        <textarea v-model="personaContent" class="textarea" rows="12" />
      </div>
      <button class="btn primary" @click="savePersona">Save consciousness</button>
      <p v-if="doc.personas.length" class="hint" style="margin-top: 10px">
        Last updated
        {{ new Date(doc.personas[doc.personas.length - 1].updatedAt).toLocaleString() }}
      </p>
    </section>

    <!-- Memories -->
    <section v-if="tab === 'Memories'" class="panel">
      <h2>Long-term memories</h2>
      <p class="hint">Facts the agent should keep between sessions.</p>

      <div class="field">
        <label>Title</label>
        <input v-model="memTitle" class="input" placeholder="What is this about?" />
      </div>
      <div class="field">
        <label>Memory</label>
        <textarea v-model="memContent" class="textarea" rows="4" />
      </div>
      <div class="field">
        <label>Tags (comma separated)</label>
        <input v-model="memTags" class="input" placeholder="work, setup" />
      </div>
      <div class="row">
        <button class="btn primary" @click="saveMemory">
          {{ editingMemory ? 'Update memory' : 'Store memory' }}
        </button>
        <button v-if="editingMemory" class="btn" @click="editingMemory = null">Cancel</button>
      </div>

      <div v-for="m in doc.memories" :key="m.id" class="row" style="margin-top: 10px">
        <div class="grow">
          <div class="name">{{ m.title }}</div>
          <div class="meta">{{ m.content.slice(0, 140) }}</div>
          <div v-if="m.tags.length" style="margin-top: 4px">
            <span v-for="t in m.tags" :key="t" class="badge" style="margin-right: 4px">{{ t }}</span>
          </div>
        </div>
        <button class="btn sm" @click="editMemory(m)">Edit</button>
        <button class="btn sm" @click="removeMemory(m.id)">Forget</button>
      </div>
      <div v-if="!doc.memories.length" class="empty">No memories yet.</div>
    </section>

    <!-- Recipes -->
    <section v-if="tab === 'Recipes'" class="panel">
      <h2>Prompt recipes</h2>
      <p class="hint">Reusable prompts you can drop into the chat without retyping them.</p>

      <div class="field">
        <label>Title</label>
        <input v-model="recTitle" class="input" placeholder="Summarise this" />
      </div>
      <div class="field">
        <label>Prompt</label>
        <textarea v-model="recPrompt" class="textarea" rows="5" />
      </div>
      <div class="row">
        <button class="btn primary" @click="saveRecipe">
          {{ editingRecipe ? 'Update recipe' : 'Save recipe' }}
        </button>
        <button v-if="editingRecipe" class="btn" @click="editingRecipe = null">Cancel</button>
      </div>

      <div v-for="r in doc.recipes" :key="r.id" class="row" style="margin-top: 10px">
        <div class="grow">
          <div class="name">{{ r.title }}</div>
          <div class="meta">{{ r.prompt.slice(0, 140) }}</div>
        </div>
        <button class="btn sm" @click="editRecipe(r)">Edit</button>
        <button class="btn sm" @click="removeRecipe(r.id)">Delete</button>
      </div>
      <div v-if="!doc.recipes.length" class="empty">No recipes yet.</div>
    </section>

    <!-- Preferences -->
    <section v-if="tab === 'Preferences'" class="panel">
      <h2>Preferences</h2>
      <p class="hint">Content preferences for this install only.</p>

      <div class="boundaries">
        <h3>Always enforced</h3>
        <ul>
          <li>Legal adults only — nothing involving minors, ever.</li>
          <li>Consensual adults only.</li>
          <li>No gore or extreme violence.</li>
          <li>Everything stays on this machine.</li>
        </ul>
        <p class="hint">
          These are fixed limits, not settings. They cannot be switched off here.
        </p>
      </div>

      <h3>Adult content</h3>
      <p class="hint">
        Lets the agent answer adult requests directly instead of deflecting. Requires an age
        check first.
      </p>

      <div v-if="!prefs.ageVerified" class="age-gate">
        <p class="age-title">Age check</p>
        <p class="hint">
          This application is for adults only. Enter your year of birth and confirm you are a
          legal adult to continue.
        </p>
        <div class="row" style="gap: 8px; margin-top: 10px">
          <input
            v-model="birthYear"
            class="input"
            style="max-width: 130px"
            inputmode="numeric"
            placeholder="YYYY"
          />
          <label class="check">
            <input v-model="confirmLegalAdult" type="checkbox" />
            I confirm I am a legal adult.
          </label>
        </div>
        <button
          class="btn primary"
          style="margin-top: 12px"
          :disabled="!confirmLegalAdult || !birthYear"
          @click="verifyAge"
        >
          Complete age check
        </button>
      </div>

      <template v-else>
        <div class="row" style="gap: 10px">
          <span class="badge">Age verified</span>
          <span v-if="prefs.verifiedAt" class="hint">
            {{ new Date(prefs.verifiedAt).toLocaleString() }}
          </span>
        </div>

        <div class="row" style="margin-top: 14px; gap: 10px">
          <button
            class="btn"
            :class="{ primary: prefs.adultContent }"
            @click="toggleAdultContent(!prefs.adultContent)"
          >
            {{ prefs.adultContent ? 'Adult content: ON' : 'Adult content: OFF' }}
          </button>
          <button class="btn" @click="resetVerification">Clear age check</button>
        </div>
      </template>

      <p v-if="prefsError" class="error" style="margin-top: 10px">{{ prefsError }}</p>
    </section>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
  width: fit-content;
}
.tab {
  padding: 5px 15px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}
.tab.active {
  background: var(--accent);
  color: #17110a;
  font-weight: 600;
}
.field {
  margin: 12px 0;
}
.boundaries {
  padding: 12px 14px;
  margin-bottom: 18px;
  background: linear-gradient(90deg, var(--accent-glow), transparent 42%), var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.boundaries h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--accent);
}
.boundaries ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.7;
}
.age-gate {
  padding: 14px;
  margin-top: 12px;
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.age-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text-dim);
  cursor: pointer;
}
.error {
  color: var(--danger);
  font-size: 12.5px;
}
.field label {
  display: block;
  margin-bottom: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.input,
.textarea {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
}
.textarea {
  resize: vertical;
  line-height: 1.55;
}
</style>
