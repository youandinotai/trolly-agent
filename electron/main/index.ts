import { app, BrowserView, BrowserWindow, globalShortcut, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { McpSupervisor } from './mcp-supervisor.js';
import { OllamaClient } from './ollama.js';
import { ComfyClient } from './comfy.js';
import { AfterDarkClient } from './after-dark.js';
import { AfterDarkSafetyInspector } from './after-dark-safety.js';
import { JevTaskRouter } from './task-router.js';
import { StudioStore } from './studio.js';
import { HermesReviewer } from './hermes-review.js';
import { SpeechClient } from './speech.js';
import { MindStore } from './mind.js';
import { assertAfterDarkPrompt, resolveAfterDarkOutputDir } from '../../src/lib/after-dark.js';
import { assertAgeVerified, assertVaultAccess } from '../../src/lib/access-policy.js';
import { isLocalAudioTranscriptionRequest } from '../../src/lib/audio-transcription.js';
import {
  assertAdultContent21Plus,
  assertCleanPrompt,
  assertCleanResponse,
  assertMcpToolOutput,
  assertStandardMediaPrompt,
} from '../../src/lib/content-policy.js';
import { SessionMode, type SessionModeSnapshot } from '../../src/lib/session-mode.js';
import { MediaVault } from './vault.js';
import { GLANCE_NEWS_URL } from '../../src/lib/glance-cover.js';
import { AgentRegistry } from './agent-registry.js';
import { ProviderClient } from './provider.js';
import { WorkspaceStore } from './workspace.js';
import { resolveTrollyDataPaths } from './data-paths.js';

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname_, '..', '..', '..');

/** App state stays in its local data directory or a user-configured override. */
const DATA_PATHS = resolveTrollyDataPaths(app.getPath('userData'), process.env);
const DATA_DIR = DATA_PATHS.dataDir;
const vault = new MediaVault(DATA_PATHS.vaultDir, APP_ROOT);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let supervisor: McpSupervisor | null = null;

const ollama = new OllamaClient('http://127.0.0.1:11434');
const provider = new ProviderClient();
const agents = new AgentRegistry(DATA_DIR);
const workspace = new WorkspaceStore(DATA_DIR);
const router = new JevTaskRouter('http://127.0.0.1:11434', process.env.TROLLY_PANDA_URL || 'http://127.0.0.1:48710');
const comfy = new ComfyClient('http://127.0.0.1:8188', DATA_DIR);
const afterDark = new AfterDarkClient(
  'http://127.0.0.1:8188',
  resolveAfterDarkOutputDir(process.env, DATA_DIR, APP_ROOT),
  new AfterDarkSafetyInspector('http://127.0.0.1:11434', process.env.TROLLY_SAFETY_VISION_MODEL || 'qwen2.5vl:7b'),
);
const speech = new SpeechClient(DATA_DIR, (status) => {
  mainWindow?.webContents.send('trolly:speech:status', status);
});
const mind = new MindStore(DATA_DIR);
const contentMode = new SessionMode();
contentMode.restore(mind.readPreferences());
const studio = new StudioStore(DATA_PATHS.studioDir, { sourceRoot: APP_ROOT });
const hermes = new HermesReviewer(process.env.TROLLY_HERMES_URL || 'http://127.0.0.1:8645');

function publishMode(state: SessionModeSnapshot = contentMode.snapshot()): void {
  mainWindow?.webContents.send('trolly:mode:changed', state);
}

/** Opaque native cover: up before any renderer work, down only after the
 * renderer acknowledges the safe presentation is on screen. */
let cleanShield: BrowserView | null = null;
let glanceCover: BrowserView | null = null;
let lastCleanAt = 0;

function showCleanShield(): void {
  if (!mainWindow || cleanShield) return;
  cleanShield = new BrowserView({
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.addBrowserView(cleanShield);
  const [width, height] = mainWindow.getContentSize();
  cleanShield.setBounds({ x: 0, y: 0, width, height });
  cleanShield.setAutoResize({ width: true, height: true });
  cleanShield.setBackgroundColor('#15120f');
  const html = `<!doctype html><html><body style="margin:0;background:#15120f;color:#ffd21a;font:600 16px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;user-select:none"><div style="text-align:center"><div style="font-size:22px;margin-bottom:8px">Clean protection</div><div style="font-weight:400;font-size:13px;color:#c1b6a6">Visuals are secured. The workspace returns in a moment.</div></div></body></html>`;
  void cleanShield.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
}

function hideCleanShield(): void {
  if (!mainWindow || !cleanShield) return;
  try {
    mainWindow.removeBrowserView(cleanShield);
    cleanShield.webContents.close();
  } catch { /* window may already be gone */ }
  cleanShield = null;
}

function showGlance(): void {
  if (!mainWindow) return;
  if (!glanceCover) {
    glanceCover = new BrowserView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    mainWindow.addBrowserView(glanceCover);
    const [width, height] = mainWindow.getContentSize();
    glanceCover.setBounds({ x: 0, y: 0, width, height });
    glanceCover.setAutoResize({ width: true, height: true });
    glanceCover.setBackgroundColor('#111111');
    glanceCover.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && (input.key === 'Escape' || (input.control && input.alt && input.key.toLowerCase() === 'g'))) {
        hideGlance();
      }
    });
    void glanceCover.webContents.loadURL(GLANCE_NEWS_URL).catch(() => {});
  }
  mainWindow?.webContents.setAudioMuted(true);
}

function hideGlance(): void {
  if (!mainWindow || !glanceCover) return;
  try {
    mainWindow.removeBrowserView(glanceCover);
    glanceCover.webContents.close();
  } catch { /* window may already be gone */ }
  glanceCover = null;
  if (contentMode.snapshot().adult) mainWindow.webContents.setAudioMuted(false);
}

function toggleGlance(): void {
  if (glanceCover) hideGlance();
  else showGlance();
}

/** Clean is fail-closed: in-memory protection applies even if preference
 * persistence fails. Adult is deliberate: persistence must succeed first. */
function setSessionAdult(enabled: boolean): SessionModeSnapshot {
  if (enabled) {
    const prefs = mind.setAdultContent(true);
    const state = contentMode.unlock(prefs);
    hideCleanShield();
    mainWindow?.webContents.setAudioMuted(false);
    publishMode(state);
    return state;
  }
  return cleanNow();
}

function cleanNow(force = false): SessionModeSnapshot {
  hideGlance();
  vault.lock();
  // Dedupe the renderer keydown and Electron globalShortcut firing together.
  const now = Date.now();
  if (!force && now - lastCleanAt < 400 && cleanShield) return contentMode.snapshot();
  lastCleanAt = now;
  mainWindow?.webContents.setAudioMuted(true);
  showCleanShield();
  let prefs = mind.readPreferences();
  try {
    prefs = mind.setAdultContent(false);
  } catch (error) {
    console.warn('Clean mode applied but the preference could not be persisted:', error);
  }
  const state = contentMode.clean(prefs);
  publishMode(state);
  return state;
}

function requireAgeVerified(action: string): void {
  assertAgeVerified(mind.readPreferences().ageVerified, action);
}

function requireVaultAccess(): void {
  assertVaultAccess(mind.readPreferences().ageVerified, contentMode.snapshot().adult);
}

async function runChatWithPolicy(messages: any[], send: () => Promise<string>, allowAudio = false): Promise<string> {
  const adult = contentMode.snapshot().adult;
  const ticket = adult ? contentMode.beginAdultWork(mind.readPreferences()) : undefined;
  const lastUser = [...(messages ?? [])].reverse().find((message: any) => message.role === 'user');
  const userText = String(lastUser?.content ?? '');
  if (!allowAudio && (messages ?? []).some((message: any) => Array.isArray(message.images) && message.images.length)) {
    throw new Error('Chat image attachments are not age/content classified. Remove the attachment before sending.');
  }
  if (adult) assertAdultContent21Plus(userText);
  else assertCleanPrompt(userText);

  const reply = await send();
  if (ticket && contentMode.finishAdultWork(ticket, reply).kind === 'suppressed') {
    throw new Error('Clean mode suppressed this Adult response before it could be shown.');
  }
  if (adult) assertAdultContent21Plus(reply);
  else assertCleanResponse(reply);
  return reply;
}


function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Keep Electron's cache and localStorage with the configured app data.
  app.setPath('userData', path.join(DATA_DIR, 'userData'));
  app.setPath('sessionData', path.join(DATA_DIR, 'sessionData'));
  app.setPath('temp', path.join(DATA_DIR, 'temp'));
  app.setPath('logs', path.join(DATA_DIR, 'logs'));
  fs.mkdirSync(path.join(DATA_DIR, 'userData'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'temp'), { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#0c0b09',
    title: 'Trolly Agent',
    icon: path.join(__dirname_, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname_, 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) cleanNow();
  });

  const devUrl = process.env.TROLLY_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(APP_ROOT, 'dist', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links open in the real browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  const iconPath = path.join(__dirname_, 'assets', 'tray.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('Trolly Agent');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Trolly Agent', click: () => mainWindow?.show() },
      { label: 'Clean now · Ctrl+Alt+C', click: () => cleanNow() },
      { label: 'News cover · Ctrl+Alt+G', click: () => toggleGlance() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  tray.on('click', () => mainWindow?.show());
}

/* ------------------------------------------------------------------ */
/* IPC: renderer -> main                                               */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('trolly:ollama:models', async () => ollama.listModels());
  ipcMain.handle('trolly:ollama:chat', async (_e, payload) => {
    const audioTranscription = isLocalAudioTranscriptionRequest(payload);
    return runChatWithPolicy(payload?.messages, () => ollama.chat(payload), audioTranscription);
  });
  ipcMain.handle('trolly:ollama:pull', async (_e, name: string) => ollama.pullModel(name));
  ipcMain.handle('trolly:ollama:delete', async (_e, name: string) => ollama.deleteModel(name));
  ipcMain.handle('trolly:provider:models', async (_e, input) => provider.listModels(input));
  ipcMain.handle('trolly:provider:chat', async (_e, input) =>
    runChatWithPolicy(input?.messages, () => provider.chat(input)));
  ipcMain.handle('trolly:agents:list', async () => ({ profiles: agents.list(), error: agents.error() }));
  ipcMain.handle('trolly:workspace:list', async () => workspace.list());
  ipcMain.handle('trolly:workspace:create', async (_e, input) => workspace.create(input));
  ipcMain.handle('trolly:workspace:status', async (_e, input) => workspace.setStatus(input.id, input.status));
  ipcMain.handle('trolly:workspace:delete', async (_e, id: string) => workspace.delete(id));
  ipcMain.handle('trolly:router:classify', async (_e, prompt: string) => {
    if (contentMode.snapshot().adult) assertAdultContent21Plus(prompt);
    else assertCleanPrompt(prompt);
    return router.classify(prompt);
  });
  ipcMain.handle('trolly:comfy:status', async () => comfy.status());
  ipcMain.handle('trolly:comfy:generate', async (_e, payload) => {
    assertStandardMediaPrompt(String(payload?.positive ?? ''));
    return comfy.generate(payload);
  });
  ipcMain.handle('trolly:comfy:inventory', async () => comfy.inventory());
  ipcMain.handle('trolly:comfy:outputs', async (_e, limit) => comfy.outputs(limit));
  ipcMain.handle('trolly:comfy:after-dark', async (_e, payload) => {
    const ticket = contentMode.beginAdultWork(mind.readPreferences());
    assertAfterDarkPrompt(payload?.positive ?? '');
    const rendered = await afterDark.generate(payload);
    return contentMode.finishAdultWork(ticket, rendered);
  });

  ipcMain.handle('trolly:mcp:list', async () => supervisor?.listServers() ?? []);
  ipcMain.handle('trolly:mcp:error', async () => supervisor?.error() ?? '');
  ipcMain.handle('trolly:mcp:connect', async (_e, id: string) => {
    requireAgeVerified('connecting an MCP server');
    return supervisor?.connect(id);
  });
  ipcMain.handle('trolly:mcp:disconnect', async (_e, id: string) => supervisor?.disconnect(id));
  ipcMain.handle('trolly:mcp:tools', async (_e, id: string) => supervisor?.listTools(id) ?? []);
  ipcMain.handle('trolly:mcp:call', async (_e, payload) => {
    requireAgeVerified('calling an MCP tool');
    const result = await supervisor?.callTool(payload.id, payload.name, payload.args);
    const adult = contentMode.snapshot().adult;
    for (const item of result?.content ?? []) {
      if (item?.type !== 'text' || typeof item?.text !== 'string') {
        throw new Error('Trolly cannot classify non-text MCP output. The result was not returned.');
      }
      assertMcpToolOutput(item.text, adult);
    }
    if (result?.structuredContent !== undefined) {
      const structuredText = JSON.stringify(result.structuredContent);
      if (typeof structuredText !== 'string') throw new Error('MCP output could not be safely inspected.');
      assertMcpToolOutput(structuredText, adult);
    }
    return result;
  });
  ipcMain.handle('trolly:mcp:add', async (_e, input) => supervisor?.addServer(input));
  ipcMain.handle('trolly:mcp:remove', async (_e, id: string) => supervisor?.removeServer(id));
  ipcMain.handle('trolly:speech:voices', async () => speech.voices());
  ipcMain.handle('trolly:speech:speak', async (_e, payload) => speech.speak(payload?.text, payload));
  ipcMain.handle('trolly:mind:read', async () => mind.read());
  ipcMain.handle('trolly:mind:persona', async () => mind.activePersona());
  ipcMain.handle('trolly:mind:persona:save', async (_e, payload) => mind.savePersona(payload));
  ipcMain.handle('trolly:mind:memory:save', async (_e, payload) => mind.saveMemory(payload));
  ipcMain.handle('trolly:mind:memory:delete', async (_e, id: string) => mind.deleteMemory(id));
  ipcMain.handle('trolly:mind:recipe:save', async (_e, payload) => mind.saveRecipe(payload));
  ipcMain.handle('trolly:mind:recipe:delete', async (_e, id: string) => mind.deleteRecipe(id));
  ipcMain.handle('trolly:mind:prefs:read', async () => mind.readPreferences());
  ipcMain.handle('trolly:mind:prefs:verify', async (_e, birthDate: string) => mind.verifyAge(birthDate));
  ipcMain.handle('trolly:mind:prefs:adult', async (_e, enabled: boolean) => {
    setSessionAdult(enabled);
    return mind.readPreferences();
  });
  ipcMain.handle('trolly:mind:prefs:reset', async () => {
    mind.resetVerification();
    vault.lock();
    await supervisor?.disconnectAll();
    cleanNow(true);
    return mind.readPreferences();
  });
  ipcMain.handle('trolly:mode:state', async () => contentMode.snapshot());
  ipcMain.handle('trolly:mode:adult', async (_e, enabled: boolean) => setSessionAdult(enabled));
  ipcMain.handle('trolly:mode:clean', async () => cleanNow());
  ipcMain.handle('trolly:glance:toggle', async () => { toggleGlance(); return { covered: !!glanceCover }; });
  ipcMain.handle('trolly:mode:clean-ack', async (_e, epoch: number) => {
    const state = contentMode.snapshot();
    if (!state.adult && epoch === state.epoch) {
      hideCleanShield();
      mainWindow?.webContents.setAudioMuted(false);
    }
    return contentMode.snapshot();
  });
  ipcMain.handle('trolly:paths', async () => ({ dataDir: DATA_DIR, appRoot: APP_ROOT }));
  ipcMain.handle('trolly:vault:status', async () => vault.status());
  ipcMain.handle('trolly:vault:lock', async () => vault.lock());
  ipcMain.handle('trolly:vault:set', async (_e, password: string) => {
    requireVaultAccess();
    return vault.setPassword(password);
  });
  ipcMain.handle('trolly:vault:unlock', async (_e, password: string, confirmMigration: boolean) => {
    requireVaultAccess();
    return vault.unlock(password, confirmMigration);
  });
  ipcMain.handle('trolly:vault:change', async (_e, current: string, next: string, confirmMigration: boolean) => {
    requireVaultAccess();
    return vault.changePassword(current, next, confirmMigration);
  });
  ipcMain.handle('trolly:vault:reset', async (_e, password: string) => {
    requireVaultAccess();
    return vault.reset(password);
  });
  ipcMain.handle('trolly:vault:list', async () => {
    requireVaultAccess();
    return vault.list();
  });
  ipcMain.handle('trolly:vault:add', async (_e, payload: { name: string; dataBase64: string }) => {
    requireVaultAccess();
    return vault.add(payload.name, payload.dataBase64);
  });
  ipcMain.handle('trolly:vault:read', async (_e, name: string) => {
    requireVaultAccess();
    return vault.read(name);
  });
  ipcMain.handle('trolly:vault:remove', async (_e, name: string) => {
    requireVaultAccess();
    return vault.remove(name);
  });
  ipcMain.handle('trolly:studio:read', async () => studio.read());
  ipcMain.handle('trolly:studio:garment:save', async (_e, payload) => studio.saveGarment(payload));
  ipcMain.handle('trolly:studio:actor:save', async (_e, payload) => studio.saveActor(payload));
  ipcMain.handle('trolly:studio:scene:save', async (_e, payload) => studio.saveScene(payload));
  ipcMain.handle('trolly:studio:asset:upload', async (_e, payload) => studio.uploadAsset(payload));
  ipcMain.handle('trolly:studio:asset:read', async (_e, filePath: string) => studio.readAsset(filePath));
  ipcMain.handle('trolly:hermes:status', async () => hermes.status());
  ipcMain.handle('trolly:hermes:review', async (_e, packet) => hermes.review(packet));
}

app.whenReady().then(async () => {
  ensureDataDir();
  agents.load();
  registerIpc();

  supervisor = new McpSupervisor(path.join(DATA_DIR, 'mcp-servers.json'));
  await supervisor.load();
  supervisor.on('servers-changed', () => {
    mainWindow?.webContents.send('trolly:mcp:changed', supervisor!.listServers());
  });

  // Bring up the tool servers the user enabled, so the character has hands
  // from the moment the window opens.
  for (const cfg of supervisor.listServers()) {
    if (mind.readPreferences().ageVerified && cfg.enabled && cfg.command) {
      supervisor.connect(cfg.id).catch((error) => {
        console.warn(`Configured MCP server ${cfg.name} failed to connect:`, error);
      });
    }
  }

  createWindow();
  createTray();
  if (!globalShortcut.register('Control+Alt+C', cleanNow)) {
    console.warn('Clean hotkey Ctrl+Alt+C could not be registered; the top-bar and tray controls remain available.');
  }
  if (!globalShortcut.register('Control+Alt+G', toggleGlance)) {
    console.warn('News cover hotkey Ctrl+Alt+G could not be registered; the top-bar control remains available.');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  globalShortcut.unregisterAll();
  await supervisor?.shutdown();
});
