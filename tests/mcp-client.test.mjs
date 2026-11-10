// TDD RED: MCP JSON-RPC client contract.
// A stdio MCP server must be spoken to correctly: initialize handshake,
// tools/list, and tools/call over newline-delimited JSON on stdin/stdout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { McpStdioClient } from '../src/lib/mcp-client.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_SERVER = path.join(here, 'fixtures', 'fake-mcp-server.mjs');

test('initialize handshake returns the server capabilities', async () => {
  const client = new McpStdioClient({ command: process.execPath, args: [FAKE_SERVER] });
  const info = await client.connect();
  assert.equal(info.serverInfo.name, 'fake-mcp');
  assert.ok(info.capabilities.tools, 'server must advertise tools capability');
  await client.close();
});

test('tools/list returns tool definitions with input schemas', async () => {
  const client = new McpStdioClient({ command: process.execPath, args: [FAKE_SERVER] });
  await client.connect();
  const tools = await client.listTools();
  assert.ok(tools.length >= 2, `expected >=2 tools, got ${tools.length}`);
  const echo = tools.find((t) => t.name === 'echo');
  assert.ok(echo, 'echo tool must be present');
  assert.ok(echo.inputSchema, 'tool must carry an inputSchema');
  assert.equal(echo.inputSchema.type, 'object');
  await client.close();
});

test('tools/call returns structured content for a valid argument', async () => {
  const client = new McpStdioClient({ command: process.execPath, args: [FAKE_SERVER] });
  await client.connect();
  const result = await client.callTool('echo', { text: 'hello trolly' });
  assert.ok(Array.isArray(result.content), 'result.content must be an array');
  assert.equal(result.content[0].type, 'text');
  assert.match(result.content[0].text, /hello trolly/);
  await client.close();
});

test('tools/call surfaces an error for an unknown tool', async () => {
  const client = new McpStdioClient({ command: process.execPath, args: [FAKE_SERVER] });
  await client.connect();
  await assert.rejects(
    () => client.callTool('does-not-exist', {}),
    /unknown tool/i,
  );
  await client.close();
});

test('close() terminates the child process', async () => {
  const client = new McpStdioClient({ command: process.execPath, args: [FAKE_SERVER] });
  await client.connect();
  const pid = client.pid;
  assert.ok(pid > 0, 'client must expose the child pid');
  await client.close();
  await new Promise((r) => setTimeout(r, 400));
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  assert.equal(alive, false, 'child process must be gone after close');
});
