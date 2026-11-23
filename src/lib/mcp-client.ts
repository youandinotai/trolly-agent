/**
 * MCP stdio client — JSON-RPC 2.0 over newline-delimited JSON on a child process.
 *
 * This is the transport Trolly Agent uses to talk to MCP servers (ComfyUI FL-MCP,
 * Maestro, computer-use, browser, ...) so the character can call real tools.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

const PROTOCOL_VERSION = '2024-11-05';

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpCallResult {
  content?: { type: string; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export class McpError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'McpError';
    this.code = code;
  }
}

export interface McpStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
}

interface Pending {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

export class McpStdioClient {
  private config: McpStdioConfig;
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private closed = false;
  private serverInfo: any = null;

  constructor(config: McpStdioConfig) {
    if (!config?.command) throw new McpError('command is required');
    this.config = config;
  }

  get pid(): number {
    return this.child?.pid ?? 0;
  }

  async connect(): Promise<any> {
    if (this.child) return this.serverInfo;
    this.closed = false;

    this.child = spawn(this.config.command, this.config.args ?? [], {
      cwd: this.config.cwd,
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;

    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line: string) => this._onLine(line));

    this.child.on('exit', (code: number | null) => {
      this.closed = true;
      const err = new McpError(`MCP server exited with code ${code}`, -32000);
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    });

    this.child.on('error', (e: Error) => {
      this.closed = true;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(e);
      }
      this.pending.clear();
    });

    return this._initialize();
  }

  private _onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: any;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return; // servers may log noise on stdout; ignore non-JSON lines
    }
    if (msg?.id === undefined || !this.pending.has(msg.id)) return;
    const entry = this.pending.get(msg.id)!;
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.error) {
      entry.reject(new McpError(msg.error.message ?? 'MCP error', msg.error.code));
    } else {
      entry.resolve(msg.result);
    }
  }

  private _send(method: string, params: unknown): Promise<any> {
    if (this.closed || !this.child) {
      return Promise.reject(new McpError('MCP server is not running', -32000));
    }
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new McpError(`MCP call timed out: ${method}`, -32001));
        }
      }, this.config.timeoutMs ?? 120_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  private async _initialize(): Promise<any> {
    const result = await this._send('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'trolly-agent', version: '0.1.0' },
    });
    this.serverInfo = result;
    // notifications/initialized has no response
    this.child?.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
    );
    return result;
  }

  async listTools(): Promise<McpToolDef[]> {
    const result: any = await this._send('tools/list', {});
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    if (!name) throw new McpError('tool name is required');
    return this._send('tools/call', { name, arguments: args });
  }

  async listResources(): Promise<any[]> {
    const result: any = await this._send('resources/list', {});
    return result?.resources ?? [];
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new McpError('client closed', -32000));
    }
    this.pending.clear();
    if (this.child && !this.child.killed) {
      try {
        this.child.stdin.end();
      } catch {
        /* already gone */
      }
      this.child.kill();
    }
    this.child = null;
  }
}
