# Status — what is built, what is real

**Date:** 2026-11-15. Personal dev/test lane on `D:\Trolly`. Nothing here is a
shipped product and nothing is claimed past what ran.

## Verified green
- Full suite: **83 tests / 83 pass / 0 fail** (`npm test`).
- Safety gate + merge guard: `tests/safety-gate.test.mjs` (subjects are always
  explicit legal adults; the scan refuses a minor, coercion, or harm).
- Startup script: `D:\Trolly\start-lane.ps1` — starts Panda, OmniRoute, the
  browser companion, the Electron app, and the Hermes A2A gateway; starts only
  what is down; never touches the OmniRoute password.
- `docs/ARCHITECTURE.md` — the Mermaid pyramid/flow of route → judge → gate →
  single-branch merge.
- `scripts/merge-gate.mjs` — only the merge judge may merge; it re-runs the
  real test suite before allowing `feature/initial-build`.
- `scripts/gen-legal-adult-image.mjs` + `poll-comfy.mjs` + `watch-image.mjs`.
- `mcp-servers.example.yaml` — chrome-devtools MCP for all Trolly agents.

## Real, in progress (not yet done)
- ComfyUI is up on `192.168.0.8:8188` and **has successfully submitted and
  begun sampling** a legal-adult still image with the locked negative. This box
  is AMD CPU-only for Comfy, so one 24-step image is ~50 min. **No finished
  render to show yet** — the queue is 1 running + 3 pending.
- Video (~5 s) needs the LTX text-to-video workflow; not yet run.

## Honest blockers
- No safe, local, non-abliterated vision model is installed to act as judge 2.
  The only vision-capable model is `abliterant/qwen3.5-rana` (de-aligned), which
  is not a trustworthy safety judge. Recommend pulling a stock Qwen-VL before
  the vision judge runs.
- No merge has happened and no branch was created/pushed from this work. Single
  branch `feature/initial-build` is untouched by this session, per policy.

## Already done earlier this lane
- Announce/panda-to-agency routing (healthcare is not a card).
- Harness dropdown (Local / Hermes local / Hermes via OmniRoute / OpenCode via OmniRoute / custom).
- News cover (open AI news; Esc returns; does not swap SFW).
- Director hold: Stage shows the chosen specialist, model, and steps before any chat or media call. Stop spends nothing. Agent rules live in `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
- Wardrobe closet defaults to All. Studio read drops garment IDs that no longer exist.
