<script setup lang="ts">
import { onMounted, ref } from 'vue';

import type { WorkspaceTask, WorkspaceTaskStatus } from '../env';

const emit = defineEmits<{ (event: 'resume', prompt: string): void }>();

const tasks = ref<WorkspaceTask[]>([]);
const title = ref('');
const description = ref('');
const error = ref('');
const busy = ref(false);
const loading = ref(false);

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    tasks.value = await window.trolly.workspace.list();
  } catch (err: any) {
    error.value = String(err?.message ?? err);
  } finally {
    loading.value = false;
  }
}

async function createTask() {
  error.value = '';
  busy.value = true;
  try {
    await window.trolly.workspace.create({ title: title.value, description: description.value });
    title.value = '';
    description.value = '';
    await refresh();
  } catch (err: any) {
    error.value = String(err?.message ?? err);
  } finally {
    busy.value = false;
  }
}

async function setStatus(task: WorkspaceTask, event: Event) {
  const status = (event.target as HTMLSelectElement).value as WorkspaceTaskStatus;
  error.value = '';
  try {
    await window.trolly.workspace.setStatus(task.id, status);
    await refresh();
  } catch (err: any) {
    error.value = String(err?.message ?? err);
  }
}

async function removeTask(task: WorkspaceTask) {
  if (!window.confirm(`Delete “${task.title}” from the workspace?`)) return;
  error.value = '';
  try {
    await window.trolly.workspace.delete(task.id);
    await refresh();
  } catch (err: any) {
    error.value = String(err?.message ?? err);
  }
}

function resume(task: WorkspaceTask) {
  emit('resume', task.description ? `${task.title}\n\n${task.description}` : task.title);
}

onMounted(refresh);
</script>

<template>
  <div class="view workspace-view">
    <section class="panel">
      <h2>Task workspace</h2>
      <p class="hint">Keep prompts and next steps on this device. Resume loads a task into Stage; it never runs it automatically.</p>
      <form class="workspace-form" @submit.prevent="createTask">
        <label class="field">
          <span>Task title</span>
          <input v-model="title" maxlength="160" required placeholder="What are you working on?" />
        </label>
        <label class="field">
          <span>Prompt and notes</span>
          <textarea v-model="description" maxlength="20000" placeholder="Add context or the prompt to resume…" />
        </label>
        <div class="row workspace-actions">
          <button class="btn primary" :disabled="busy || !title.trim()">{{ busy ? 'Saving…' : 'Save task' }}</button>
          <button class="btn" type="button" :disabled="loading" @click="refresh">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
        </div>
      </form>
      <div v-if="error" class="badge err" role="alert">{{ error }}</div>
    </section>

    <section class="panel">
      <div class="workspace-list-head">
        <h2>Saved tasks</h2>
        <span class="badge">{{ tasks.length }} on this device</span>
      </div>
      <div v-if="loading && !tasks.length" class="empty">Loading tasks…</div>
      <div v-else-if="!tasks.length" class="empty">No saved tasks yet. Save a draft from Stage or create one above.</div>
      <article v-for="task in tasks" :key="task.id" class="workspace-task">
        <div class="workspace-task-copy">
          <h3>{{ task.title }}</h3>
          <p v-if="task.description">{{ task.description }}</p>
          <small>Updated {{ new Date(task.updatedAt).toLocaleString() }}</small>
        </div>
        <div class="workspace-task-actions">
          <select :value="task.status" :aria-label="`Status for ${task.title}`" @change="setStatus(task, $event)">
            <option value="open">Open</option>
            <option value="in-progress">In progress</option>
            <option value="done">Done</option>
          </select>
          <button class="btn sm primary" @click="resume(task)">Resume in Stage</button>
          <button class="btn sm" @click="removeTask(task)">Delete</button>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.workspace-view { display: grid; grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.4fr); gap: 16px; align-items: start; }
.workspace-form .field { margin-bottom: 12px; }
.workspace-actions { justify-content: flex-start; }
.workspace-list-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.workspace-list-head h2 { margin: 0; }
.workspace-task { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-top: 1px solid var(--line-soft); }
.workspace-task-copy { min-width: 0; flex: 1; }
.workspace-task-copy h3 { margin: 0; font-size: 13px; }
.workspace-task-copy p { margin: 6px 0; color: var(--text-dim); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 120px; overflow: auto; }
.workspace-task-copy small { color: var(--text-faint); }
.workspace-task-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.workspace-task-actions select { min-width: 110px; background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); padding: 5px 8px; }
@media (max-width: 900px) { .workspace-view { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .workspace-task { flex-direction: column; } .workspace-task-actions { justify-content: flex-start; } }
</style>
