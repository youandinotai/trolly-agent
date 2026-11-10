<script setup lang="ts">
import { onMounted, ref } from 'vue';

import type { McpServerState, McpTool } from '../env';

const servers = ref<McpServerState[]>([]);
const tools = ref<Record<string, McpTool[]>>({});
const busy = ref<string | null>(null);
const log = ref<string[]>([]);

function note(line: string) {
  log.value.unshift(`${new Date().toLocaleTimeString()}  ${line}`);
  if (log.value.length > 200) log.value.pop();
}

async function refresh() {
  servers.value = await window.trolly.mcp.list();
  for (const s of servers.value) {
    if (s.status === 'connected' && !tools.value[s.id]) {
      tools.value[s.id] = await window.trolly.mcp.tools(s.id);
    }
  }
}

async function connect(s: McpServerState) {
  busy.value = s.id;
  try {
    servers.value = await window.trolly.mcp.connect(s.id);
    const fresh = servers.value.find((x) => x.id === s.id);
    note(`${s.name}: ${fresh?.status}${fresh?.error ? ` (${fresh.error})` : ''}`);
    if (fresh?.status === 'connected') {
      tools.value[s.id] = await window.trolly.mcp.tools(s.id);
      note(`${s.name}: ${tools.value[s.id].length} tools discovered`);
    }
  } catch (err: any) {
    note(`${s.name}: failed ${err?.message ?? err}`);
  } finally {
    busy.value = null;
  }
}

async function disconnect(s: McpServerState) {
  busy.value = s.id;
  servers.value = await window.trolly.mcp.disconnect(s.id);
  note(`${s.name}: disconnected`);
  busy.value = null;
}

function statusClass(s: McpServerState) {
  if (s.status === 'connected') return 'ok';
  if (s.status === 'error') return 'err';
  if (s.status === 'connecting') return 'warn';
  return '';
}

onMounted(refresh);
</script>

<template>
  <div class="view">
    <div class="panel">
      <h2>Tool servers</h2>
      <p class="hint">
        Trolly Agent speaks the Model Context Protocol. Each server below is a real backend on this
        machine — the character can call their tools on your behalf. Config lives in the app's
        <code>data/mcp-servers.json</code>.
      </p>

      <div v-if="!servers.length" class="empty">No tool servers configured.</div>

      <div v-for="s in servers" :key="s.id" class="row">
        <div class="grow">
          <div class="name">{{ s.name }}</div>
          <div class="meta">
            {{ s.transport }}
            <template v-if="s.command"> · {{ s.command }}</template>
            <template v-if="s.toolCount"> · {{ s.toolCount }} tools</template>
            <template v-if="s.serverInfo?.name"> · {{ s.serverInfo.name }}</template>
          </div>
          <div v-if="s.error" class="meta" style="color: var(--danger)">{{ s.error }}</div>
        </div>
        <span class="badge" :class="statusClass(s)">{{ s.status }}</span>
        <button
          v-if="s.status !== 'connected'"
          class="btn sm"
          :disabled="busy === s.id || !s.command"
          @click="connect(s)"
        >
          {{ busy === s.id ? '…' : 'Connect' }}
        </button>
        <button v-else class="btn sm" :disabled="busy === s.id" @click="disconnect(s)">
          Disconnect
        </button>
      </div>
    </div>

    <div v-for="s in servers.filter((x) => x.status === 'connected')" :key="s.id + '-tools'" class="panel">
      <h2>{{ s.name }} — tools</h2>
      <p class="hint">Available calls for the character.</p>
      <div class="tool-list">
        <div v-for="t in tools[s.id] ?? []" :key="t.name" class="tool-item">
          <div class="tname">{{ t.name }}</div>
          <div class="tdesc">{{ t.description }}</div>
        </div>
        <div v-if="!(tools[s.id] ?? []).length" class="empty">No tools reported.</div>
      </div>
    </div>

    <div class="panel">
      <h2>Activity</h2>
      <p class="hint">Connection events for this session.</p>
      <div class="scroll-box">{{ log.join('\n') || 'No events yet.' }}</div>
    </div>
  </div>
</template>
