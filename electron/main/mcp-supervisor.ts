import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { McpStdioClient } from '../../src/lib/mcp-client.ts';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
}

export interface McpServerState extends McpServerConfig {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  toolCount?: number;
  serverInfo?: { name?: string; version?: string };
}

function isServerConfig(value: unknown): value is McpServerConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<McpServerConfig>;
  return typeof config.id === 'string'
    && /^[a-z0-9][a-z0-9-]{0,63}$/.test(config.id)
    && typeof config.name === 'string'
    && (config.transport === 'stdio' || config.transport === 'http')
    && typeof config.enabled === 'boolean'
    && (config.command === undefined || typeof config.command === 'string')
    && (config.args === undefined || (Array.isArray(config.args) && config.args.every((arg) => typeof arg === 'string')))
    && (config.env === undefined || (
      !!config.env
      && typeof config.env === 'object'
      && Object.values(config.env).every((item) => typeof item === 'string')
    ))
    && (config.url === undefined || typeof config.url === 'string');
}

/**
 * Owns every MCP server Trolly Agent talks to, and exposes them to the UI.
 * Servers are described by a JSON file in the data dir so the user can edit
 * them by hand; built-in templates stay disabled until the user configures them.
 */
export class McpSupervisor extends EventEmitter {
  private configs: McpServerConfig[] = [];
  private clients = new Map<string, McpStdioClient>();
  private pendingClients = new Map<string, McpStdioClient>();
  private states = new Map<string, McpServerState>();
  private filePath: string;
  private loadError = '';

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  /** No MCP command is preconfigured or auto-started on a fresh install. */
  static defaultServers(): McpServerConfig[] {
    return [];
  }

  async load() {
    this.loadError = '';
    if (!fs.existsSync(this.filePath)) {
      this.configs = McpSupervisor.defaultServers();
      await this.save();
    } else {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (!Array.isArray(parsed) || !parsed.every(isServerConfig)) {
          throw new Error('configuration must be an array of valid server definitions');
        }
        this.configs = parsed;
      } catch (error) {
        this.configs = [];
        this.loadError = `Could not load MCP configuration at ${this.filePath}: ${String(error)}`;
        console.error(this.loadError);
      }
    }
    for (const cfg of this.configs) {
      this.states.set(cfg.id, { ...cfg, status: 'disconnected' });
    }
  }

  error(): string {
    return this.loadError;
  }

  async save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.configs, null, 2));
  }

  async addServer(input: { name: string; command: string; args?: string[] }) {
    const name = String(input.name ?? '').trim();
    const command = String(input.command ?? '').trim();
    const args = input.args ?? [];
    if (!name || name.length > 80) throw new Error('Enter a server name (up to 80 characters).');
    if (!command || command.length > 260) throw new Error('Enter a server command (up to 260 characters).');
    if (!Array.isArray(args) || args.length > 80 || args.some((arg) => typeof arg !== 'string' || arg.length > 1000)) {
      throw new Error('Server arguments must be a list of strings.');
    }
    const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'mcp';
    let id = baseId;
    let suffix = 2;
    while (this.configs.some((server) => server.id === id)) id = `${baseId}-${suffix++}`;
    const config: McpServerConfig = { id, name, transport: 'stdio', command, args: [...args], enabled: false };
    this.configs.push(config);
    this.states.set(id, { ...config, status: 'disconnected' });
    await this.save();
    this.emit('servers-changed');
    return this.listServers();
  }

  async removeServer(id: string) {
    await this.disconnect(id);
    this.configs = this.configs.filter((server) => server.id !== id);
    this.states.delete(id);
    await this.save();
    this.emit('servers-changed');
    return this.listServers();
  }

  listServers(): McpServerState[] {
    return this.configs.map((cfg) => this.states.get(cfg.id) ?? { ...cfg, status: 'disconnected' });
  }

  async connect(id: string) {
    const cfg = this.configs.find((c) => c.id === id);
    if (!cfg) throw new Error(`unknown MCP server: ${id}`);
    if (this.clients.has(id) || this.pendingClients.has(id)) return this.listServers();
    if (cfg.transport !== 'stdio') {
      throw new Error(`transport ${cfg.transport} is not implemented yet`);
    }
    if (!cfg.command) {
      this._setState(id, { status: 'error', error: 'no command configured' });
      return this.listServers();
    }

    this._setState(id, { status: 'connecting' });
    const client = new McpStdioClient({
      command: cfg.command,
      args: cfg.args ?? [],
      env: cfg.env,
    });
    this.pendingClients.set(id, client);
    try {
      const info = await client.connect();
      const tools = await client.listTools();
      if (this.pendingClients.get(id) !== client) {
        await client.close().catch(() => {});
        return this.listServers();
      }
      this.pendingClients.delete(id);
      this.clients.set(id, client);
      this._setState(id, {
        status: 'connected',
        toolCount: tools.length,
        serverInfo: info?.serverInfo,
        error: undefined,
      });
    } catch (err: any) {
      if (this.pendingClients.get(id) !== client) return this.listServers();
      this.pendingClients.delete(id);
      await client.close().catch(() => {});
      this._setState(id, { status: 'error', error: String(err?.message ?? err) });
    }
    this.emit('servers-changed');
    return this.listServers();
  }

  async disconnect(id: string) {
    const pending = this.pendingClients.get(id);
    if (pending) {
      this.pendingClients.delete(id);
      await pending.close().catch(() => {});
    }
    const client = this.clients.get(id);
    if (client) {
      await client.close().catch(() => {});
      this.clients.delete(id);
    }
    this._setState(id, { status: 'disconnected', toolCount: undefined, serverInfo: undefined });
    this.emit('servers-changed');
    return this.listServers();
  }

  async listTools(id: string) {
    const client = this.clients.get(id);
    if (!client) return [];
    try {
      return await client.listTools();
    } catch {
      return [];
    }
  }

  async callTool(id: string, name: string, args: Record<string, unknown> = {}) {
    const client = this.clients.get(id);
    if (!client) throw new Error(`MCP server ${id} is not connected`);
    return client.callTool(name, args);
  }

  async shutdown() {
    await this.disconnectAll();
  }

  async disconnectAll() {
    await Promise.all(this.configs.map((config) => this.disconnect(config.id)));
  }

  private _setState(id: string, patch: Partial<McpServerState>) {
    const current = this.states.get(id);
    if (!current) return;
    this.states.set(id, { ...current, ...patch });
  }
}
