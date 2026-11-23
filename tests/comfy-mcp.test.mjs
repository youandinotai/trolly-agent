import test from 'node:test';
import assert from 'node:assert/strict';

import { assignComfyMcp, COMFY_MCP_MODEL, COMFY_MCP_SERVER, comfyToolMenu, comfyToolName } from '../src/lib/comfy-mcp.ts';
import { routeTaskDeterministic } from '../src/lib/task-router.ts';

test('a picture job stays in chat on the trained comfy mcp model', () => {
  const route = assignComfyMcp(routeTaskDeterministic('draw a picture of a red cabin'));
  assert.equal(route.task, 'chat');
  assert.equal(route.backend, 'ollama-chat');
  assert.equal(route.model, COMFY_MCP_MODEL);
  assert.equal(route.model, 'artokun/gemma4-comfyui-mcp:e2b');
});

test('ordinary chat is not forced onto the comfy model', () => {
  const route = assignComfyMcp(routeTaskDeterministic('what should we eat'));
  assert.equal(route.task, 'chat');
  assert.notEqual(route.model, COMFY_MCP_MODEL);
});

test('only a connected comfyui-mcp server is offered to the model', () => {
  const servers = [
    { id: 'comfyui-mcp', name: 'ComfyUI MCP', status: 'connected', command: 'npx', args: ['--yes', 'comfyui-mcp'] },
    { id: 'files', name: 'Filesystem', status: 'connected', command: 'npx', args: ['--yes', '@modelcontextprotocol/server-filesystem'] },
    { id: 'off', name: 'ComfyUI MCP', status: 'disconnected', command: 'npx', args: ['--yes', 'comfyui-mcp'] },
  ];
  const menu = comfyToolMenu(servers, [
    { serverId: 'comfyui-mcp', name: 'run_workflow' },
    { serverId: 'files', name: 'read_file' },
    { serverId: 'off', name: 'run_workflow' },
  ]);
  assert.equal(menu.length, 1);
  assert.equal(menu[0].name, 'run_workflow');
  assert.equal(menu[0].wire, comfyToolName('comfyui-mcp', 'run_workflow'));
});

test('the comfy server template is npx and has no machine path', () => {
  assert.equal(COMFY_MCP_SERVER.command, 'npx');
  assert.deepEqual(COMFY_MCP_SERVER.args, ['--yes', 'comfyui-mcp']);
});
