# Status — local development and verification

This records results observed in the current worktree. No deployment or
publication was performed.

## Verified

- `npm run build` — passed. Electron, renderer, and yellow/red app and tray icons built. Vite reports a 982.67 kB minified JavaScript chunk, above its 500 kB advisory threshold.
- `npm run typecheck` — passed for Electron and Vue.
- `npm test` — **95 passed, 0 failed**.
- `node --test tests/data-paths.test.mjs tests/studio.test.mjs` — **5 passed, 0 failed**.
- `git diff --check` — passed.
- `npm run verify:leak` — passed; **0 source-brand tokens** found in the shipped surface.
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

## Known limits

- Non-Ollama providers must expose OpenAI-compatible `/models` and `/chat/completions` endpoints; credentials must be configured in that provider service. OpenCode uses OmniRoute by default rather than its native HTTP API.
- Image attachments are currently supported only through Ollama.
- MCP transport is stdio only. New server connections require explicit action; existing config entries marked `enabled` may reconnect at startup.
- One selected agent profile is applied per task; this does not fan out or execute every profile.
