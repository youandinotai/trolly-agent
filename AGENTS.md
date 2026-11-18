# Agent rules — Trolly lane

Read this before editing `youandinotai/trolly-agent`. The same rules are in `CLAUDE.md` and `GEMINI.md`. If you change product behavior, update all three in the same commit.

## Identity

- This repo is the only GitHub repo for this node. Push only as `youandinotai`.
- Never fetch, clone, or push a Trollz1004 repo from this lane.
- Healthcare is not a router option. Do not add it to agency cards or specialist lists.
- Legal adults only. No minors. No blood, gore, or extreme violence. Those terms stay in the negative prompt and in the After Dark hard gate.

## Director hold

Chat and media jobs do not start when the user sends a message. The router classifies first. Stage shows a Director panel with the chosen specialist, task, backend, model, and steps. **Run** spends the call. **Stop** spends nothing and does not open Artistry.

`planRouteSteps()` in `src/lib/task-router.ts` is the step list. Do not bypass it with a direct `ollama.chat` or Comfy submit from the Stage send path.

## Wardrobe

- Closet category defaults to All.
- New-piece form defaults to a Clean top (White oxford), not a bikini.
- Studio `read()` drops garment IDs that no longer exist and writes that prune back.
- Clean hides bikini and underwear. Wear with no actor selected must show an error, not fail silently.

## Files agents must keep current

Any behavior change updates, in the same commit:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `docs/ARCHITECTURE.md` if the route or gate changed
- `STATUS.md` with what actually ran, not what was intended

Do not commit probe scripts that read passwords, `.env` files, or `graphify-out/`.

## Not built yet

The aim includes Apps, Multi-Project, Design, Automations, Atlas, and Hot-Swap AI Plans. Those menus are not implemented. Do not claim they are.
