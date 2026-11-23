import type { TaskRoute } from './task-router.js';

/** https://ollama.com/artokun/gemma4-comfyui-mcp — trained only for comfyui-mcp. */
export const COMFY_MCP_MODEL = 'artokun/gemma4-comfyui-mcp:e2b';

/** Stdio launch for the comfyui-mcp tool surface. Not a machine path. */
export const COMFY_MCP_SERVER = {
  name: 'ComfyUI MCP',
  command: 'npx',
  args: ['--yes', 'comfyui-mcp'],
};

const MEDIA = new Set(['image', 'video', 'edit']);

/** Ollama tool name for one connected comfyui-mcp server. */
export function comfyToolName(serverId: string, toolName: string): string {
  return `comfy_${serverId}_${toolName}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
}

export interface ComfyToolRef {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** One connected Comfy server, capped so the trained model keeps context. */
export function comfyToolMenu(servers: { id: string; name: string; status: string; command?: string; args?: string[] }[], tools: ComfyToolRef[]) {
  const server = servers.find((item) =>
    item.status === 'connected'
    && item.command === COMFY_MCP_SERVER.command
    && (item.args ?? []).join('\n') === COMFY_MCP_SERVER.args.join('\n'),
  );
  if (!server) return [];
  return tools
    .filter((tool) => tool.serverId === server.id && tool.name)
    .slice(0, 64)
    .map((tool) => ({
      serverId: server.id,
      wire: comfyToolName(server.id, tool.name),
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    }));
}

/** Media jobs stay in chat. Only this trained model may drive Comfy tools. */
export function assignComfyMcp(route: TaskRoute): TaskRoute {
  if (!MEDIA.has(route.task)) return route;
  return {
    ...route,
    task: 'chat',
    backend: 'ollama-chat',
    model: COMFY_MCP_MODEL,
    reason: `${route.reason} Comfy stays a tool. Only ${COMFY_MCP_MODEL} may call comfyui-mcp.`,
  };
}
