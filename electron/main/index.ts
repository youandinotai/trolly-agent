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
import { resolveAfterDarkOutputDir } from '../../src/lib/after-dark.js';
import { SessionMode, type SessionModeSnapshot } from '../../src/lib/session-mode.js';
import { MediaVault } from './vault.js';

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname_, '..', '..', '..');

/** All mutable state lives on D: — never on the system drive. */
const DATA_DIR = process.env.TROLLY_DATA_DIR || path.join(APP_ROOT, 'data');
const vault = new MediaVault(process.env.TROLLY_VAULT_DIR || 'D:/Trolly/data/vault');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let supervisor: McpSupervisor | null = null;

const ollama = new OllamaClient('http://127.0.0.1:11434');
const router = new JevTaskRouter('http://127.0.0.1:11434', process.env.TROLLY_PANDA_URL || 'http://127.0.0.1:48710');
const comfy = new ComfyClient('http://127.0.0.1:8188');
const afterDark = new AfterDarkClient(
  'http://127.0.0.1:8188',
  resolveAfterDarkOutputDir(process.env, APP_ROOT),
  new AfterDarkSafetyInspector('http://127.0.0.1:11434', process.env.TROLLY_SAFETY_VISION_MODEL || 'qwen2.5vl:7b'),
);
const speech = new SpeechClient(DATA_DIR, (status) => {
  mainWindow?.webContents.send('trolly:speech:status', status);
});
const mind = new MindStore(DATA_DIR);
const contentMode = new SessionMode();
contentMode.restore(mind.readPreferences());
const studio = new StudioStore(process.env.TROLLY_STUDIO_DIR || 'D:/Trolly/data/studio');
const hermes = new HermesReviewer(process.env.TROLLY_HERMES_URL || 'http://127.0.0.1:8645');

function publishMode(state: SessionModeSnapshot = contentMode.snapshot()): void {
  mainWindow?.webContents.send('trolly:mode:changed', state);
}

/** Opaque native cover: up before any renderer work, down only after the
 * renderer acknowledges the safe presentation is on screen. */
let cleanShield: BrowserView | null = null;
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
  cleanShield.setBackgroundColor('#142027');
  const html = `<!doctype html><html><body style="margin:0;background:#142027;color:#c5f3ec;font:600 16px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;user-select:none"><div style="text-align:center"><div style="font-size:22px;margin-bottom:8px">Clean protection</div><div style="font-weight:400;font-size:13px;color:#8fbab8">Visuals are secured. The workspace returns in a moment.</div></div></body></html>`;
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

function cleanNow(): SessionModeSnapshot {
  vault.lock();
  // Dedupe the renderer keydown and Electron globalShortcut firing together.
  const now = Date.now();
  if (now - lastCleanAt < 400 && cleanShield) return contentMode.snapshot();
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

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Redirect Electron's own userData (cache, localStorage) onto D: as well.
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
    backgroundColor: '#0d0f14',
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
  ipcMain.handle('trolly:ollama:chat', async (_e, payload) => ollama.chat(payload));
  ipcMain.handle('trolly:router:classify', async (_e, prompt: string) => router.classify(prompt));
  ipcMain.handle('trolly:comfy:status', async () => comfy.status());
  ipcMain.handle('trolly:comfy:generate', async (_e, payload) => comfy.generate(payload));
  ipcMain.handle('trolly:comfy:inventory', async () => comfy.inventory());
  ipcMain.handle('trolly:comfy:outputs', async (_e, limit) => comfy.outputs(limit));
  ipcMain.handle('trolly:comfy:after-dark', async (_e, payload) => {
    const ticket = contentMode.beginAdultWork(mind.readPreferences());
    const rendered = await afterDark.generate(payload);
    return contentMode.finishAdultWork(ticket, rendered);
  });

  ipcMain.handle('trolly:mcp:list', async () => supervisor?.listServers() ?? []);
  ipcMain.handle('trolly:mcp:connect', async (_e, id: string) => supervisor?.connect(id));
  ipcMain.handle('trolly:mcp:disconnect', async (_e, id: string) => supervisor?.disconnect(id));
  ipcMain.handle('trolly:mcp:tools', async (_e, id: string) => supervisor?.listTools(id) ?? []);
  ipcMain.handle('trolly:mcp:call', async (_e, payload) => supervisor?.callTool(payload.id, payload.name, payload.args));
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
  ipcMain.handle('trolly:mind:prefs:verify', async (_e, birthYear: number) => mind.verifyAge(birthYear));
  ipcMain.handle('trolly:mind:prefs:adult', async (_e, enabled: boolean) => {
    setSessionAdult(enabled);
    return mind.readPreferences();
  });
  ipcMain.handle('trolly:mind:prefs:reset', async () => {
    const prefs = mind.resetVerification();
    publishMode(contentMode.clean(prefs));
    return prefs;
  });
  ipcMain.handle('trolly:mode:state', async () => contentMode.snapshot());
  ipcMain.handle('trolly:mode:adult', async (_e, enabled: boolean) => setSessionAdult(enabled));
  ipcMain.handle('trolly:mode:clean', async () => cleanNow());
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
  ipcMain.handle('trolly:vault:set', async (_e, password: string) => vault.setPassword(password));
  ipcMain.handle('trolly:vault:unlock', async (_e, password: string) => vault.unlock(password));
  ipcMain.handle('trolly:vault:change', async (_e, current: string, next: string) => vault.changePassword(current, next));
  ipcMain.handle('trolly:vault:reset', async (_e, password: string) => vault.reset(password));
  ipcMain.handle('trolly:vault:list', async () => (contentMode.snapshot().adult ? vault.list() : []));
  ipcMain.handle('trolly:vault:add', async (_e, payload: { name: string; dataBase64: string }) => {
    if (!contentMode.snapshot().adult) throw new Error('Vault images stay hidden while SFW is on.');
    return vault.add(payload.name, payload.dataBase64);
  });
  ipcMain.handle('trolly:vault:read', async (_e, name: string) => (contentMode.snapshot().adult ? vault.read(name) : null));
  ipcMain.handle('trolly:vault:remove', async (_e, name: string) => vault.remove(name));
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
  registerIpc();

  supervisor = new McpSupervisor(path.join(DATA_DIR, 'mcp-servers.json'));
  await supervisor.load();
  supervisor.on('servers-changed', () => {
    mainWindow?.webContents.send('trolly:mcp:changed', supervisor!.listServers());
  });

  // Bring up the tool servers the user enabled, so the character has hands
  // from the moment the window opens.
  for (const cfg of supervisor.listServers()) {
    if (cfg.enabled && cfg.command) {
      supervisor.connect(cfg.id).catch(() => {});
    }
  }

  createWindow();
  createTray();
  if (!globalShortcut.register('Control+Alt+C', cleanNow)) {
    console.warn('Clean hotkey Ctrl+Alt+C could not be registered; the top-bar and tray controls remain available.');
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
