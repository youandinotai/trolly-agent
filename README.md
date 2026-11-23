# Trolly Agent

A local-first desktop companion and agent workspace. Choose a provider and profile,
review each routed task before it runs, manage local Ollama models, and connect only
the MCP tools you configure.

Clean-room reimplementation of the AIRI desktop agent's *feature set* (Moeru AI,
v0.14.1). Feature-matched and visually distinct — no original code, artwork, copy,
fonts, or brand tokens are reused.

---

## What it does

| Surface | What you get |
|---|---|
| **Stage** | Select a provider, model, and loaded agent profile. Every request waits in the Director preview; Stop makes no call. |
| **Workspace** | Save tasks and notes locally, update their status, and resume them into Stage without auto-running. |
| **Tools (MCP)** | Configure stdio filesystem, agent, browser, or Playwright servers. Connecting and calling tools requires the 21+ check and an explicit action. |
| **Providers** | Use local Ollama, OmniRoute-compatible endpoints, OpenCode through OmniRoute, or a Hermes proxy. Pull and delete local Ollama models. |
| **Artistry** | Generate video or images on local ComfyUI. Clean checks common sexual wording but does not classify every generated image/video. |
| **Mind** | Consciousness (the persona), long-term memories, prompt recipes, and content preferences. |

Runtime data remains on this device unless a provider endpoint or MCP server is
explicitly configured. Provider credentials stay in the provider service, not Trolly.

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
| Ollama | `http://127.0.0.1:11434` | Local + cloud LLMs; manage installed local models. |
| OmniRoute | `http://127.0.0.1:20128/v1` | OpenAI-compatible provider gateway; credentials are configured in OmniRoute. |
| OpenCode | OmniRoute by default | Uses the selected OpenCode-backed model exposed by the configured gateway. |
| Hermes | `http://127.0.0.1:8645/v1` | Local OpenAI-compatible proxy, when available. |
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

### MCP servers

Fresh installs have no preconfigured or auto-started MCP processes. The Tools
view provides templates for filesystem, custom agent tools, browser, and
Playwright servers. The filesystem template requires an explicit allowed folder.
New servers stay disconnected until the user chooses **Connect**; an existing
server explicitly marked `enabled` in local configuration may reconnect at
startup. MCP transport is currently stdio only. Configuration is saved in
`data/mcp-servers.json`. Connecting or calling a tool requires the 21+ check.
The filesystem template passes the chosen folder to its server but does not
sandbox the server process or its OS account.
There is no separate plugin runtime; integrations are configured MCP servers.

Agent profiles load from `data/agent-profiles.json` and are selectable in Stage.
Loading profiles does not execute them. The selected profile is applied only
after the user approves the Director plan with **Run**.

---

## The Mind

`Mind` is the agent's persistent identity, stored as one readable JSON file at
`data/mind.json`:

| Tab | What it holds |
|---|---|
| **Consciousness** | The persona prepended to every conversation. Edit it and the next message uses it. |
| **Memories** | Long-term facts that persist between sessions, with tags. |
| **Recipes** | Reusable prompts you can drop into the chat. |
| **Preferences** | Adult mode and other sensitive operations require a 21+ age check. |

### Content preferences and the age check

`Preferences → Adult content` unlocks direct adult responses only after a full
date-of-birth check screens for 21+ eligibility. It is self-reported, not identity
verification; Trolly checks the date in memory and does not store it. Older
year-only checks are invalidated. Adult text
must clearly state 21+ ages; After Dark validates every prompt before uploading
its reference and requires the local vision check to pass.

These limits are fixed and cannot be toggled off:

- 21+ verification for Adult mode, MCP connection/tool calls, and Vault access
- never depict minors
- consensual adults only
- no gore or extreme violence

Adult mode enables direct responses and the separate After Dark surface; it
never widens those content limits. Clean mode blocks
common sexual wording in chat and text/tool outputs. Standard image/video
prompts also reject adult, under-21, and gore terms; these are text checks, not
an image/video classifier. Standard ComfyUI output and MCP side effects still
require user review. MCP text is filtered in both modes; non-text results are
withheld, and Adult sexual text requires 21+ ages. Filtering occurs after a
tool call and cannot undo server side effects. Chat image attachments are
blocked until a local age/content classifier is available.

### Vault storage

The Vault requires both 21+ verification and Adult mode. New media bytes and
the filename index are encrypted locally with AES-256-GCM; passwords are
required to be at least 12 characters. Existing plaintext Vault files are not
silently changed: unlock or password change requires an explicit migration
confirmation. Locking clears the decryption key from memory. The Vault data
directory remains outside the application source tree.

### Instant Clean visual protection

Clean and Adult share one agent, chat history, task router, and tool runtime.
They are presentation states, not separate applications.

- Clean is the default at launch and after a full renderer reload. A saved adult
  preference never restores adult visuals by itself.
- The avatar's private outfit is hidden and replaced by a modest dress and shoes.
  An opaque cover remains if that safe presentation cannot be prepared.
- Existing media previews are hidden in Clean. Text checks cover common sexual
  wording, but generated image/video output is not automatically classified.
  Generation and agent tasks can continue behind the cover.
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
- **Vision attachments** are currently blocked in Stage because Trolly has no
  age/content classifier for user-supplied images. The provider adapter itself
  sends images only to the selected Ollama service; removing the block requires
  a separately reviewed local classifier.
- **Dictation** records a bounded WebM clip and transcribes it with a local
  Whisper model if one is present in Ollama. The transcript passes the active
  text-content policy before it is returned.

## Architecture

```
electron/
  main/index.ts            window, tray, IPC, provider/profile/workspace startup
  main/mcp-supervisor.ts   owns explicitly configured stdio MCP servers
  main/provider.ts         Ollama and OpenAI-compatible provider adapter
  main/ollama.ts           Ollama models, chat, pull, and delete
  main/agent-registry.ts   local agent profile registry
  main/workspace.ts        persistent local task store
  main/comfy.ts            ComfyUI client (status, checkpoints, generate)
  main/speech.ts           offline SAPI speech synthesis
  main/mind.ts             persona, memories, recipes, preferences
  preload/index.cjs        the only renderer surface (contextBridge)
src/
  lib/mcp-client.ts        JSON-RPC 2.0 over newline-delimited JSON
  lib/comfyui.ts           workflow graph builders + history parsing
  views/                   Stage, Workspace, MCP, Providers, Artistry, Mind
scripts/
  verify-no-leak.mjs       Remake "100% Yours" leak scanner
  make-icons.py            icon generator (no dependencies)
tests/                     node:test suites
```

The renderer has **no Node access**: `contextIsolation: true`, `nodeIntegration: false`,
and a strict CSP. Every capability crosses the preload bridge.

---

## Local data

The app's data directory defaults to a `data` folder under Electron's
runtime-resolved `userData` location. Set `TROLLY_DATA_DIR` to override that
root. `TROLLY_VAULT_DIR` and `TROLLY_STUDIO_DIR` can override the vault and
studio folders; both must remain outside the application source tree.
`TROLLY_STUDIO_SAMPLE_MODEL` optionally points to a local model copied into the
studio assets on first setup. `TROLLY_AFTER_DARK_DIR` optionally overrides the
After Dark output folder; source-tree output is rejected.

```
data\
  agent-profiles.json  loaded local agent roster
  mcp-servers.json     MCP server registry
  tasks.json           workspace tasks and notes
  mind.json            persona, memories, recipes, preferences
  artistry\            generated media
  vault\               encrypted Vault files and filename index (unless overridden)
  speech\              synthesized WAV files
  userData\            Electron state
```

---

## Two rules this codebase keeps

**1. Clean-room.** The upstream project's brand tokens must not appear in the shipped
product surface (`src/`, `electron/`, `assets/`). `npm run verify:leak` fails the
build if they do. Provenance documents and the test-suite are not product surface and
are excluded by design.

**2. No surprise endpoints.** Trolly uses local services by default. External
network requests occur only when a user-configured provider or MCP server makes
them; provider credentials are not stored in Trolly. OpenAI-compatible providers must expose `/models` and `/chat/completions`.
Chat image attachments are currently blocked pending local safety classification.

---

## License

MIT. Clean-room reimplementation; no upstream code or assets are included.
