import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { McpSupervisor } from '../electron/main/mcp-supervisor.ts';

test('fresh MCP setup has no machine-specific commands and added servers stay disconnected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-mcp-'));
  const file = path.join(dir, 'mcp-servers.json');
  const supervisor = new McpSupervisor(file);
  await supervisor.load();
  assert.deepEqual(supervisor.listServers(), []);
  assert.deepEqual(McpSupervisor.defaultServers(), []);

  const configured = await supervisor.addServer({
    name: 'Playwright',
    command: 'npx',
    args: ['--yes', '@playwright/mcp@latest'],
  });
  assert.equal(configured[0].status, 'disconnected');
  assert.equal(configured[0].enabled, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8'))[0].args, ['--yes', '@playwright/mcp@latest']);

  assert.deepEqual(await supervisor.removeServer(configured[0].id), []);
});

test('invalid MCP config is reported and left untouched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-mcp-'));
  const file = path.join(dir, 'mcp-servers.json');
  fs.writeFileSync(file, '{broken');
  const supervisor = new McpSupervisor(file);
  await supervisor.load();

  assert.match(supervisor.error(), /could not load MCP configuration/i);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  assert.deepEqual(supervisor.listServers(), []);
});
