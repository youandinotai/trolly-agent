# Agent rules — Trolly lane

Read this before editing `youandinotai/trolly-agent`. The same rules are in `CLAUDE.md` and `GEMINI.md`. If you change product behavior, update all three in the same commit.

## Identity

- This repo is the only GitHub repo for this node. Push only as `youandinotai`.
- Never fetch, clone, or push a Trollz1004 repo from this lane.
- Healthcare is not a router option. Do not add it to agency cards or specialist lists.
- Legal adults only. No minors. No blood, gore, or extreme violence. Those terms stay in the negative prompt and in the After Dark hard gate.

## Director hold

Chat and media jobs do not start when the user sends a message. The router classifies first. Stage shows a Director panel with the chosen specialist, task, backend, model, and steps. **Run** is the explicit approval gate. **Stop** spends nothing and does not open Artistry.

`planRouteSteps()` in `src/lib/task-router.ts` is the step list. Chat runs through the selected provider adapter only after Run. Do not bypass the hold with direct model or Comfy calls from the Stage send path.

## Providers, agents, and workspace

- Provider and model choices are available on the initial Stage screen. Ollama is local; other options use an OpenAI-compatible endpoint configured in its provider service. Never store provider keys in Trolly.
- OpenCode is exposed through OmniRoute by default; the Hermes choice targets the local Hermes proxy. These require the corresponding service and compatible endpoint to be running.
- Images are currently sent only through Ollama. Do not silently drop unsupported attachments.
- The agent profile registry loads at startup and profiles are selectable. Loading is not execution; no agent runs until the user approves the Director plan.
- Runtime data defaults under Electron's `userData` location; `TROLLY_DATA_DIR` may override the root. Vault and Studio directories must remain outside the source tree. Do not hardcode machine-specific local paths. Resume fills Stage; it never submits or runs a task.
- Ollama pull and delete actions are explicit. Confirm before deleting a model.

## MCP

- Fresh installs start with no MCP server commands. Templates are offered for filesystem, custom agent tools, browser, and Playwright.
- New MCP templates are disconnected and stdio-only. Existing config entries marked `enabled` may reconnect at startup; never auto-connect an unreviewed server or add machine-specific executable paths.
- Filesystem MCP requires the user to choose its allowed root. Tool calls require an explicit user action.

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
