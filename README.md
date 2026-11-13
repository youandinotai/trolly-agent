# Trolly Agent

A desktop AI companion that runs entirely on your own machine. It talks to a local
LLM, gives the character real tools through the Model Context Protocol, and renders
imagery on your own GPU.

Clean-room reimplementation of the AIRI desktop agent's *feature set* (Moeru AI,
v0.14.1). Feature-matched and visually distinct — no original code, artwork, copy,
fonts, or brand tokens are reused.

---

## What it does

| Surface | What you get |
|---|---|
| **Stage** | The companion's stage, plus a live chat panel. Attach images, dictate, speak replies, and fire tool calls. |
| **Tools (MCP)** | Register MCP servers, test the handshake, list every tool, and call them. |
| **Providers** | Every model your local Ollama daemon serves, grouped by job: Chat, Vision, Speech, Transcription, Artistry. |
| **Artistry** | Generate video or images on your local ComfyUI backend. Nothing is uploaded. |
| **Mind** | Consciousness (the persona), long-term memories, prompt recipes, and content preferences. |

Everything runs on **D:** — source, dependencies, state, and generated media.

---

## Quick start

```bash
npm install
npm run build
npm start
```

`npm start` builds and launches the app on your desktop with a visible window.

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on :48701 (set `TROLLY_DEV_URL` to point Electron at it) |
| `npm run build` | Compile Electron (tsc) + renderer (vite) + assets |
| `npm test` | Unit tests (MCP client, ComfyUI graph, brand-leak scanner) |
| `npm run typecheck` | `tsc` for main/preload, `vue-tsc` for the renderer |
| `npm run verify:leak` | Brand-leak scanner over the shipped product surface |
| `python scripts/make-icons.py` | Regenerate the app/tray icons (pure stdlib) |

---

## Backends it talks to

All of these are **clients** — Trolly Agent never owns the server.

| Backend | Default | Used for |
|---|---|---|
| Ollama | `http://127.0.0.1:11434` | Local + cloud LLMs. Model store on `D:\ollama\models`. |
| ComfyUI | `http://127.0.0.1:8188` | Video / image generation on your GPU. |
| MCP servers | per-config | Tools the character can call. |

### ComfyUI and CORS

Trolly Agent calls ComfyUI from the Electron **main** process, so it never
hits a browser CORS check. Other apps that call ComfyUI from a renderer do —
for those, ComfyUI must be started with the CORS header enabled:

```
python main.py --enable-cors-header "*"
```

On this machine Comfy Desktop stores its launch arguments in
`%APPDATA%\Comfy Desktop\installations.json` under `launchArgs`; that file
already carries `--enable-cors-header "*"` for every installed instance.

### MCP servers shipped in the default config

`data/mcp-servers.json` is created on first run and pre-wired to this machine:

| id | Server | Tools |
|---|---|---|
| `comfyui` | ComfyUI FL-MCP (`D:\Comfy-Desktop\...\comfyui-fl-mcp`) | 136 |
| `maestro` | Maestro (`D:\pinokio\api\maestro\app\env-agent`) | 24 |
| `computer-use` | `cua-driver mcp` | 57 — desktop + browser control |

Enabled servers connect automatically at launch. Edit the JSON to add your own.

---

## The Mind

`Mind` is the agent's persistent identity, stored as one readable JSON file at
`data/mind.json`:

| Tab | What it holds |
|---|---|
| **Consciousness** | The persona prepended to every conversation. Edit it and the next message uses it. |
| **Memories** | Long-term facts that persist between sessions, with tags. |
| **Recipes** | Reusable prompts you can drop into the chat. |
| **Preferences** | Content preferences, gated behind an age check. |

### Content preferences and the age check

`Preferences → Adult content` unlocks direct adult responses, but the switch
refuses to open until the age check is complete: a year of birth plus an
explicit "I am a legal adult" confirmation. A birth year under 18 is rejected
outright, and clearing the check switches adult content back off.

These limits are fixed and cannot be toggled off:

- legal adults only — never minors
- consensual adults only
- no gore or extreme violence

The preference only changes how *directly* the agent answers. It never widens
those limits.

### Instant Clean visual protection

Clean and Adult share one agent, chat history, task router, and tool runtime.
They are presentation states, not separate applications.

- Clean is the default at launch and after a full renderer reload. A saved adult
  preference never restores adult visuals by itself.
- The avatar's private outfit is hidden and replaced by a modest dress and shoes.
  An opaque cover remains if that safe presentation cannot be prepared.
- Unreviewed images, videos, scene artwork, attachments, and After Dark references
  are not mounted in Clean. Generation and agent tasks can continue behind the
  cover.
- Clean stops current avatar speech and invalidates pending adult visual results.
  Electron main returns only `{ kind: "suppressed" }` for an adult render that
  finishes after Clean—no pixels, URL, or file path cross back into the view.
- `Ctrl+Alt+C` activates Clean while the app is focused; Electron also registers it
  as a global shortcut, and the tray has **Clean now**.

With the app running on CDP `:48702`, `npm run verify:safe-mode` checks the real
UI end-to-end. The other verification commands cover Clean generation, a late
adult render, and the normal Adult display path.

## Speech and Vision

Both run locally, with no cloud service:

- **Speech (TTS)** uses the Windows SAPI voice set through `System.Speech`.
  Audio is written to `data/speech/*.wav` and played back in-app.
- **Vision** sends an attached image to a local multimodal model on Ollama
  (for example `qwen2.5vl`). Images are base64 on the wire and never leave
  the machine.
- **Dictation** records a clip and transcribes it with a local Whisper model
  if one is present in Ollama.

## Architecture

```
electron/
  main/index.ts            window, tray, IPC, auto-connect, D: path redirection
  main/mcp-supervisor.ts   owns each MCP server; stdio transport; tool registry
  main/ollama.ts           Ollama client (models + chat)
  main/comfy.ts            ComfyUI client (status, checkpoints, generate)
  main/speech.ts           offline SAPI speech synthesis
  main/mind.ts             persona, memories, recipes, preferences
  preload/index.cjs        the only renderer surface (contextBridge)
src/
  lib/mcp-client.ts        JSON-RPC 2.0 over newline-delimited JSON
  lib/comfyui.ts           workflow graph builders + history parsing
  views/                   Stage, MCP, Providers, Artistry, Mind
scripts/
  verify-no-leak.mjs       Remake "100% Yours" leak scanner
  make-icons.py            icon generator (no dependencies)
tests/                     node:test suites
```

The renderer has **no Node access**: `contextIsolation: true`, `nodeIntegration: false`,
and a strict CSP. Every capability crosses the preload bridge.

---

## All state lives on D:

`electron/main/index.ts` redirects Electron's `userData`, `sessionData`, `temp`, and
`logs` into `D:\Trolly\app\data`. Override with `TROLLY_DATA_DIR`.

```
D:\Trolly\app\data\
  mcp-servers.json     MCP server registry
  mind.json            persona, memories, recipes, preferences
  artistry\            generated media
  speech\              synthesized WAV files
  userData\            Electron state
```

---

## Two rules this codebase keeps

**1. Clean-room.** The upstream project's brand tokens must not appear in the shipped
product surface (`src/`, `electron/`, `assets/`). `npm run verify:leak` fails the
build if they do. Provenance documents and the test-suite are not product surface and
are excluded by design.

**2. Nothing is uploaded.** Generation, chat, and tool calls all stay on the machine.
The only outbound requests are to the providers you configure.

---

## License

MIT. Clean-room reimplementation; no upstream code or assets are included.
