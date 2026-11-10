import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { McpStdioClient } from '../../src/lib/mcp-client.js';

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

/**
 * Owns every MCP server Trolly Agent talks to, and exposes them to the UI.
 * Servers are described by a JSON file in the data dir so the user can edit
 * them by hand; the built-in defaults point at this machine's real servers.
 */
export class McpSupervisor extends EventEmitter {
  private configs: McpServerConfig[] = [];
  private clients = new Map<string, McpStdioClient>();
  private states = new Map<string, McpServerState>();
  private filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  /** Servers shipped with the app, pre-wired to this machine's real backends. */
  static defaultServers(): McpServerConfig[] {
    return [
      {
        id: 'comfyui',
        name: 'ComfyUI (FL-MCP)',
        transport: 'stdio',
        command: 'D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\standalone-env\\python.exe',
        args: [
          'D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\custom_nodes\\comfyui-fl-mcp\\backend\\mcp_server.py',
        ],
        enabled: true,
      },
      {
        id: 'maestro',
        name: 'Maestro',
        transport: 'stdio',
        command: 'D:\\pinokio\\api\\maestro\\app\\env-agent\\Scripts\\python.exe',
        args: [
          'D:\\pinokio\\api\\maestro\\app\\maestro_mcp.py',
          '--client',
          'c8c28422-b39c-43cd-87e1-a2fb20b8f151',
        ],
        enabled: true,
      },
      {
        id: 'computer-use',
        name: 'Computer Use',
        transport: 'stdio',
        command: process.env.CUA_DRIVER_PATH || '',
        args: [],
        enabled: false,
      },
    ];
  }

  async load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.configs = JSON.parse(raw);
    } catch {
      this.configs = McpSupervisor.defaultServers();
      await this.save();
    }
    for (const cfg of this.configs) {
      this.states.set(cfg.id, { ...cfg, status: 'disconnected' });
    }
  }

  async save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.configs, null, 2));
  }

  listServers(): McpServerState[] {
    return this.configs.map((cfg) => this.states.get(cfg.id) ?? { ...cfg, status: 'disconnected' });
  }

  async connect(id: string) {
    const cfg = this.configs.find((c) => c.id === id);
    if (!cfg) throw new Error(`unknown MCP server: ${id}`);
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
    try {
      const info = await client.connect();
      const tools = await client.listTools();
      this.clients.set(id, client);
      this._setState(id, {
        status: 'connected',
        toolCount: tools.length,
        serverInfo: info?.serverInfo,
        error: undefined,
      });
    } catch (err: any) {
      await client.close().catch(() => {});
      this._setState(id, { status: 'error', error: String(err?.message ?? err) });
    }
    this.emit('servers-changed');
    return this.listServers();
  }

  async disconnect(id: string) {
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
    for (const client of this.clients.values()) {
      await client.close().catch(() => {});
    }
    this.clients.clear();
  }

  private _setState(id: string, patch: Partial<McpServerState>) {
    const current = this.states.get(id);
    if (!current) return;
    this.states.set(id, { ...current, ...patch });
  }
}
