<script setup lang="ts">
import { onMounted, ref } from 'vue';

import type { McpServerState, McpTool } from '../env';
import { appMode } from '../lib/mode';

const servers = ref<McpServerState[]>([]);
const tools = ref<Record<string, McpTool[]>>({});
const busy = ref<string | null>(null);
const log = ref<string[]>([]);
const error = ref('');
const configurationError = ref('');
const template = ref<'filesystem' | 'agent' | 'browser' | 'playwright'>('filesystem');
const serverName = ref('Filesystem');
const command = ref('npx');
const argsText = ref('--yes\n@modelcontextprotocol/server-filesystem');
const filesystemRoot = ref('');
const newServerBusy = ref(false);

function applyTemplate() {
  const presets = {
    filesystem: { name: 'Filesystem', command: 'npx', args: '--yes\n@modelcontextprotocol/server-filesystem' },
    agent: { name: 'Agent tools', command: '', args: '' },
    browser: { name: 'Browser', command: 'npx', args: '--yes\n@modelcontextprotocol/server-puppeteer' },
    playwright: { name: 'Playwright', command: 'npx', args: '--yes\n@playwright/mcp@latest' },
  };
  const preset = presets[template.value];
  serverName.value = preset.name;
  command.value = preset.command;
  argsText.value = preset.args;
  filesystemRoot.value = '';
}

async function addServer() {
  if (configurationError.value) return;
  error.value = '';
  newServerBusy.value = true;
  try {
    const args = argsText.value.split(/\r?\n/).map((arg) => arg.trim()).filter(Boolean);
    if (template.value === 'filesystem') {
      if (!filesystemRoot.value.trim()) throw new Error('Choose an allowed folder for the filesystem server.');
      args.push(filesystemRoot.value.trim());
    }
    servers.value = await window.trolly.mcp.add({
      name: serverName.value,
      command: command.value,
      args,
    });
    note(`${serverName.value}: configured, disconnected until you choose Connect`);
  } catch (err: any) {
    error.value = String(err?.message ?? err);
  } finally {
    newServerBusy.value = false;
  }
}

function note(line: string) {
  log.value.unshift(`${new Date().toLocaleTimeString()}  ${line}`);
  if (log.value.length > 200) log.value.pop();
}

async function refresh() {
  error.value = '';
  try {
    servers.value = await window.trolly.mcp.list();
    configurationError.value = await window.trolly.mcp.error();
    for (const s of servers.value) {
      if (s.status === 'connected' && !tools.value[s.id]) {
        tools.value[s.id] = await window.trolly.mcp.tools(s.id);
      }
    }
  } catch (err: any) {
    error.value = String(err?.message ?? err);
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

async function removeServer(s: McpServerState) {
  if (!window.confirm(`Remove the ${s.name} MCP configuration?`)) return;
  busy.value = s.id;
  try {
    servers.value = await window.trolly.mcp.remove(s.id);
    delete tools.value[s.id];
    note(`${s.name}: configuration removed`);
  } catch (err: any) {
    error.value = String(err?.message ?? err);
  } finally {
    busy.value = null;
  }
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
        Configure filesystem, agent, browser, or Playwright servers here. New servers stay disconnected until you choose Connect.
        A 21+ age check is required to connect or run tools. Servers run with your account's OS permissions; Trolly does not sandbox their commands.
      </p>
      <p class="clean-status" role="status">
        <strong>Filesystem boundary</strong>
        <span>The filesystem template passes the folder you choose to the server; it does not restrict other access that server or its OS account may have.</span>
      </p>
      <p class="clean-status" role="status">
        <strong>Tool results</strong>
        <span>Trolly filters returned text in both modes and withholds non-text results. Filtering happens after the tool runs and cannot undo its side effects.</span>
      </p>

      <form class="mcp-form" @submit.prevent="addServer">
        <div class="grid2">
          <label class="field">
            <span>Server template</span>
            <select v-model="template" @change="applyTemplate">
              <option value="filesystem">Filesystem</option>
              <option value="agent">Agent tools (custom)</option>
              <option value="browser">Browser</option>
              <option value="playwright">Playwright</option>
            </select>
          </label>
          <label class="field">
            <span>Display name</span>
            <input v-model="serverName" maxlength="80" required />
          </label>
        </div>
        <div class="grid2">
          <label class="field">
            <span>Command</span>
            <input v-model="command" maxlength="260" required placeholder="npx, node, python…" />
          </label>
          <label v-if="template === 'filesystem'" class="field">
            <span>Allowed folder</span>
            <input v-model="filesystemRoot" required placeholder="Absolute folder path" />
          </label>
        </div>
        <label class="field">
          <span>Arguments (one per line)</span>
          <textarea v-model="argsText" rows="3" placeholder="--yes&#10;package-name" />
        </label>
        <p class="hint">Only stdio servers are supported. This form saves configuration without connecting. Do not put secrets in arguments.</p>
        <button class="btn primary" :disabled="newServerBusy || !!configurationError">{{ newServerBusy ? 'Saving…' : 'Add server' }}</button>
      </form>

      <div v-if="configurationError" class="badge err" role="alert">{{ configurationError }}</div>
      <div v-if="error" class="badge err" role="alert">{{ error }}</div>
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
          :disabled="busy === s.id || !s.command || !!configurationError || !appMode.ageVerified"
          @click="connect(s)"
        >
          {{ busy === s.id ? '…' : 'Connect' }}
        </button>
        <button v-else class="btn sm" :disabled="busy === s.id || !!configurationError" @click="disconnect(s)">
          Disconnect
        </button>
        <button class="btn sm" :disabled="busy === s.id || !!configurationError" @click="removeServer(s)">Remove</button>
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

<style scoped>
.mcp-form { padding: 14px; margin: 14px 0; border: 1px solid var(--line-soft); border-radius: var(--radius-sm); background: var(--bg-panel); }
.mcp-form .field { margin-bottom: 10px; }
.mcp-form .hint { margin-bottom: 10px; }
</style>
