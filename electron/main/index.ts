import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { McpSupervisor } from './mcp-supervisor.js';
import { OllamaClient } from './ollama.js';
import { ComfyClient } from './comfy.js';
import { AfterDarkClient } from './after-dark.js';
import { AfterDarkSafetyInspector } from './after-dark-safety.js';
import { JevTaskRouter } from './task-router.js';
import { SpeechClient } from './speech.js';
import { MindStore } from './mind.js';
import { assertAfterDarkAllowed, resolveAfterDarkOutputDir } from '../../src/lib/after-dark.js';

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname_, '..', '..', '..');

/** All mutable state lives on D: — never on the system drive. */
const DATA_DIR = process.env.TROLLY_DATA_DIR || path.join(APP_ROOT, 'data');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let supervisor: McpSupervisor | null = null;

const ollama = new OllamaClient('http://127.0.0.1:11434');
const router = new JevTaskRouter('http://127.0.0.1:11434', process.env.TROLLY_ROUTER_MODEL || 'eve-cpu:latest');
const comfy = new ComfyClient('http://127.0.0.1:8188');
const afterDark = new AfterDarkClient(
  'http://127.0.0.1:8188',
  resolveAfterDarkOutputDir(process.env, APP_ROOT),
  new AfterDarkSafetyInspector('http://127.0.0.1:11434', process.env.TROLLY_SAFETY_VISION_MODEL || 'qwen2.5vl:7b'),
);
const speech = new SpeechClient(DATA_DIR);
const mind = new MindStore(DATA_DIR);

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
    assertAfterDarkAllowed(mind.readPreferences());
    return afterDark.generate(payload);
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
  ipcMain.handle('trolly:mind:prefs:adult', async (_e, enabled: boolean) => mind.setAdultContent(enabled));
  ipcMain.handle('trolly:mind:prefs:reset', async () => mind.resetVerification());
  ipcMain.handle('trolly:paths', async () => ({ dataDir: DATA_DIR, appRoot: APP_ROOT }));
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await supervisor?.shutdown();
});
