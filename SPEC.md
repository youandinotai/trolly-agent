# Trolly Agent — Build Spec

**Clean-room reimplementation of the AIRI desktop agent (Moeru AI, v0.14.1), our own version.**
Target host: Alienware node `.40` (Windows 11, RTX 3070 8GB, 40GB RAM). All payloads on **D:**.

## 0. Provenance & rules (from REA + Remake)

### Source artifact studied
- `D:\Trolly\airi\` — AIRI v0.14.1, Electron + Vue 3 + Vite/Rolldown, `app.asar` 526 MB
- `moeru-ai/airi` on GitHub, MIT licensed. Original author: Moeru AI.
- REA analysis: `D:\Trolly\app\rea\airi-evidence.json` (evidence bundle), extracted tree
  `D:\Trolly\app\rea\airi-src\`

### What we take (facts / ideas, MIT-permissible, re-implemented)
- Feature *concepts*: a local-first desktop AI-companion shell with a 3D/2D stage, provider
  settings, MCP server management, tool cards, voice I/O, memory, and ComfyUI image generation.

### What we do NOT take (Remake `100% Yours` gate)
- Zero `AIRI` / `Moeru AI` / `airi` brand tokens in code, assets, package metadata, window title,
  tray text, or UI copy. Verified by an automated leak scan (see `scripts/verify-no-leak.mjs`).
- No original artwork, icons, fonts, VRM samples, or locale strings copied. Our own assets.
- Our own code, our own layout, our own names. Feature-matched, visually distinct.

## 1. Product

**Trolly Agent** — a desktop AI-companion agent you can talk to, watch, and point at your
machine. Runs a local LLM (Ollama) plus optional cloud providers, gives the character
hands via MCP tools, and can generate imagery through ComfyUI.

Core screens
1. **Stage** — the character stage (Live2D/VRM-capable 2D canvas fallback), chat panel,
   mic button, status bar (provider / model / VRAM / MCP state).
2. **Chat** — message list, streaming replies, per-character personas, saved sessions.
3. **Tools (MCP)** — register MCP servers (stdio + HTTP), test the connection, list tools,
   toggle tool cards the character may call, live tool-call transcript.
4. **Providers** — Ollama (local, auto-detect models), plus OpenAI-compatible / cloud keys.
5. **Artistry (ComfyUI)** — connect to a ComfyUI backend, pick a workflow, generate images
   that appear in chat as the character's picture.
6. **Browser & Computer** — drive the local browser and the desktop (via the same MCP
   servers the box already runs) as on-demand tools.

## 2. Architecture

Electron (main + preload + renderer), Vue 3 + Pinia renderer, TypeScript, Vite.

```
D:\Trolly\app\
  package.json          # name: "trolly-agent", our own metadata
  electron/
    main/index.ts       # window, tray, IPC, MCP supervisor, ComfyUI client
    preload/index.ts    # contextBridge -> window.trolly
  src/
    stores/             # pinia: session, characters, providers, mcp, tools, settings
    views/              # StageView, ChatView, McpView, ProvidersView, ArtistryView
    components/
    lib/
      mcp.ts            # stdio + HTTP MCP client (JSON-RPC 2.0)
      comfyui.ts        # ComfyUI /prompt + /history + /view client
      ollama.ts         # Ollama /api/tags + /api/chat
      computer.ts       # computer-use + browser tool adapters
  assets/               # our own icons, tray, fonts
  scripts/verify-no-leak.mjs
```

### MCP layer (the point of the build)
- Supervisor owns each MCP server as a child process (stdio) or an HTTP session.
- Implements MCP `initialize` / `tools/list` / `tools/call` / `notifications/initialized`.
- Tool registry: name, description, JSON-Schema input, enabled flag, per-character allowlist.
- Tool calls stream into the chat transcript as system-authored cards.
- Ships **pre-wired to this box's real servers**:
  - `comfyui-fl-mcp` → `D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\standalone-env\python.exe`
  - `maestro` → `D:\pinokio\api\maestro\app\env-agent\Scripts\python.exe`
  - plus computer-use and browser MCP servers as they become available.

### Computer use & browser
- The character can be given a "hands" toolset that runs through MCP servers, not by
  shelling out itself — the same isolation Hermes uses.
- Browser control is an MCP server, so Trolly stays a client of the tool bus.

### ComfyUI (Artistry)
- Backend URL defaults to `http://127.0.0.1:8188`.
- Workflow template = a JSON graph with node titles Trolly can fill (positive prompt, seed,
  width/height, checkpoint, sampler).
- `POST /prompt` → poll `/history/{id}` → `GET /view` → render into chat.

## 3. Hard requirements

- Everything runs from **D:**. Config/state under `D:\Trolly\app\data\`
  (electron `userData` redirected there in `main/index.ts`).
- No outbound network at runtime except to the user-configured providers.
- No secrets in the repo. `.env`-style keys live in the data dir, gitignored.
- Owns its own ports, uncommon to avoid the game engine: **48700** (main), **48701** (devtools),
  and it talks to 8188 (ComfyUI), 11434 (Ollama), 48596/42003 (SoW/Maestro) as clients only.

## 4. Verification gates

1. `npm run build` clean.
2. `npm test` green (unit: MCP handshake against a fake stdio server, ComfyUI payload
   builder, leak scanner).
3. `node scripts/verify-no-leak.mjs` → 0 hits for airi/moeru tokens in source + assets.
4. **Rule One**: app launches on the desktop (not headless), window visible, screenshot
   proves the Stage renders and MCP servers list as connected with their real tool counts.
5. A real end-to-end chat turn against Ollama returns text in the UI.
6. A real ComfyUI generation is triggered and the image appears.

## 5. Explicit non-goals

- Not a pixel-for-pixel AIRI clone — a clean-room, feature-matched, visually distinct app.
- Not shipping the original's Live2D model, VRM samples, fonts, or copy.
- No store/installer packaging beyond a local dev run + `electron-builder` config stub.
