# Agent rules — Trolly lane

Read this before editing `youandinotai/trolly-agent`. The same rules are in `CLAUDE.md` and `GEMINI.md`. If you change product behavior, update all three in the same commit.

## Identity

- This repo is the only GitHub repo for this node. Push only as `youandinotai`.
- Never fetch, clone, or push a Trollz1004 repo from this lane.
- Healthcare is not a router option. Do not add it to agency cards or specialist lists.
- Adult mode, After Dark, MCP connections/tool calls, and Vault access require the current 21+ age check. Never depict minors; no blood, gore, or extreme violence. Those terms stay in the negative prompt and in the After Dark hard gate.
- Clean blocks common sexual wording in text inputs and screens obvious matching text outputs. Standard image/video prompts also reject adult, under-21, and gore terms. These are text checks, not image/video classifiers; do not claim that every generated result or tool side effect is safe.

## Director hold

Chat and media jobs do not start when the user sends a message. The router classifies first. Stage shows a Director panel with the chosen specialist, task, backend, model, and steps. **Run** is the explicit approval gate. **Stop** spends nothing and does not open Artistry.

`planRouteSteps()` in `src/lib/task-router.ts` is the step list. Chat runs through the selected provider adapter only after Run. Do not bypass the hold with direct model or Comfy calls from the Stage send path.

## Providers, agents, and workspace

- Provider and model choices are available on the initial Stage screen. Ollama is local; other options use an OpenAI-compatible endpoint configured in its provider service. Never store provider keys in Trolly.
- OpenCode is exposed through OmniRoute by default; the Hermes choice targets the local Hermes proxy. These require the corresponding service and compatible endpoint to be running.
- The provider adapter can send images only through Ollama, but Stage blocks chat image attachments until they can be age/content classified. Local dictation is limited to a bounded WebM transcription request and its text result is filtered. Explain limitations; do not silently drop attachments.
- The agent profile registry loads at startup and profiles are selectable. Loading is not execution; no agent runs until the user approves the Director plan.
- Runtime data defaults under Electron's `userData` location; `TROLLY_DATA_DIR` may override the root. Vault and Studio directories must remain outside the source tree. Do not hardcode machine-specific local paths. Resume fills Stage; it never submits or runs a task.
- Ollama pull and delete actions are explicit. Confirm before deleting a model.

## MCP

- Fresh installs start with no MCP server commands. Templates are offered for filesystem, custom agent tools, browser, and Playwright.
- New MCP templates are disconnected and stdio-only. Existing `enabled` entries may reconnect at startup only after 21+ verification; never auto-connect an unreviewed server or add machine-specific executable paths.
- Connecting or calling an MCP tool requires 21+ verification and an explicit user action. MCP output is text-filtered in both modes; Adult sexual text needs explicit 21+ ages, and non-text output is blocked. Tool side effects can occur before output filtering. A filesystem template passes the selected root to the server; it does not sandbox arbitrary commands.

## Safety and Vault

- Check a full, self-reported date of birth against 21+ in memory; never persist the date or imply identity verification. Older year-only verification is invalid.
- Vault IPC requires 21+ verification and Adult mode. Media bytes and file names are AES-256-GCM encrypted at rest; legacy plaintext Vault files require an explicit migration confirmation. Locking clears the in-memory key.
- Validate After Dark prompts before uploading the reference image. Require a clearly stated numeric age of 21+ for every depicted person and keep the local visual check fail-closed.
- `.soul` presets load only from inside the runtime data directory. An NSFW preset is rejected until the current 21+ check passes. Loading a preset does not run a model, apply a LoRA, or expand the avatar.

## Visual system

- Use vivid yellow and red with black and gray neutrals across app surfaces and states. Keep semantic status visible in text and preserve accessible contrast.

## Wardrobe

- Closet category defaults to All.
- New-piece form defaults to a Clean top (White oxford), not a bikini.
- Studio `read()` drops garment IDs that no longer exist and writes that prune back.
- Clean hides bikini and underwear. Wear with no actor selected must show an error, not fail silently.

## Floating avatar

The SFW floating avatar is the Hermes hatch pet, `src/assets/pets/hermes-pet.png`: full body, white shirt, black skirt, pinned to the right. A click runs Clean. Do not replace it with a corner chip or a CSS blob. `/hatch` in Hermes is how that pet is made. Trolly displays the installed sprite. It does not generate a new one.

## Files agents must keep current

Any behavior change updates, in the same commit:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `docs/ARCHITECTURE.md` if the route or gate changed
- `STATUS.md` with what actually ran, not what was intended
- `README.md` when its feature or setup descriptions change

Do not commit probe scripts that read passwords, `.env` files, or `graphify-out/`.

## Not built yet

The aim includes Apps, Multi-Project, Design, Automations, Atlas, and Hot-Swap AI Plans. Those menus are not implemented. Do not claim they are.
