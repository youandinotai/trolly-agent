# Status — local development and verification

This records results observed in the current worktree. No deployment or
publication was performed.

## Verified

- `node --test tests/soul-preset.test.mjs` — **4 passed, 0 failed** after the save-boundary and sealed-reload change. Saves cannot leave the data directory. Adult memory reloads only with the Vault key. Loading or saving does not run a model or apply a LoRA.
- `node --test tests/telegram-message.test.mjs tests/node-roster.test.mjs` — **3 passed, 0 failed**. Telegram text is filtered locally. The node roster lists names and projects only, with no address, token, or remote connection.
- `npm run typecheck` — passed for Electron and Vue.
- `npm run build` — passed. Electron, renderer, and yellow/red app and tray icons built. Vite reports a 987.26 kB minified JavaScript chunk, above its 500 kB advisory threshold.
- `node --test tests/data-paths.test.mjs tests/studio.test.mjs` — **5 passed, 0 failed**.
- `git diff --check` — passed.
- `npm run verify:leak` — passed; **0 source-brand tokens** found in the shipped surface.
- A TCP check confirmed `127.0.0.1:2222` is listening; the preview process was not stopped or modified.
- Browser visual verification was not completed: browser approval for the local preview was denied. No browser page was opened.
- `remake report` (from `airi-remake/`) — **exit 2** because the overall gate is incomplete. Capture passed (1 page, 886 files); desktop and phone matches were 100.00%, motion match was 99.69%; the swap checklist passed at **43/43 (100%)**. “Live and private” is NOT YET because deployment was intentionally not requested.
- `remake images` (from `airi-remake/`) — **exit 0**; 0 original images remain to replace.
- The Impeccable detector reports only an advisory on the transparency checkerboard in `src/styles.css`; it is retained because it communicates the transparent viewport.
- `npm ci` completed. Its install summary reported 8 dependency advisories (3 moderate, 5 high); they were not investigated or changed in this task.

## Implemented

- Provider selection at startup for Ollama, OmniRoute, OpenCode-through-OmniRoute, Hermes local proxy, and custom OpenAI-compatible endpoints. Provider/model choices flow through the main-process adapter; endpoint and model choices persist locally.
- Agent profiles load from `agent-profiles.json`, can be selected in Stage, and show visible run state. The Director Run/Stop hold remains the only path into task execution; profiles do not auto-run.
- MCP templates support filesystem, custom agent tools, browser, and Playwright stdio servers. Fresh setup has no commands or auto-connections; filesystem access requires an explicit root.
- Local Ollama model inventory, pull, and confirmed delete actions.
- Local task workspace with status updates and resume-to-Stage behavior; resume does not submit or run the task.
- Runtime data defaults under Electron's `userData` location, with `TROLLY_*` directory overrides; Vault and Studio reject source-tree paths.
- Yellow/red with black/gray app palette and generated icons.
- 21+ verification now uses the full birth date without persisting it. Adult mode, MCP connect/tool calls, and Vault access have main-process gates; clearing verification locks the Vault and disconnects MCP servers.
- Vault media bytes and filenames are AES-256-GCM encrypted, with an explicit legacy migration confirmation and 12-character minimum for new passwords.
- Clean-mode text checks are limited heuristics. Standard media prompts reject adult, under-21, and gore terms; image/video outputs and MCP side effects are not automatically classified.
- MCP output is filtered in both modes; Adult sexual text requires explicit 21+ ages and non-text output is withheld. The tool may already have caused a server-side effect before output filtering.
- Chat image attachments are disabled. Bounded local WebM dictation remains available, and its transcript passes the active text-content policy.
- `.soul` preset load and save both stay inside the runtime data directory. NSFW presets stay blocked until the current 21+ check. Clean saves replace sexual memory with `[redacted]`. Adult saves store memory as AES-256-GCM `sealedMemory` and reload it only with the Vault key. Neither applies LoRA weights nor changes the avatar.
- Telegram intake accepts text and a chat id only. It does not connect to Telegram, store a bot token, or bypass the Director hold.
- The node roster is a local list of names and projects. It does not connect nodes and does not launch Pinokio.

## Known limits

- Non-Ollama providers must expose OpenAI-compatible `/models` and `/chat/completions` endpoints; credentials must be configured in that provider service. OpenCode uses OmniRoute by default rather than its native HTTP API.
- Image attachments are disabled until local age/content classification is available; standard media checks are prompt-level only.
- MCP transport is stdio only. New server connections require explicit action; existing config entries marked `enabled` may reconnect at startup.
- One selected agent profile is applied per task; this does not fan out or execute every profile.
