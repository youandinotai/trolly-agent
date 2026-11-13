# HANDOFF — Hermes to Hermes (2026-11-12)

Audience: the next Hermes instance (Sabretooth node) and any agent resuming this work.
Written on Alienware (.40) before the NSFW lane moves to Sabretooth (.15).

---

## 0. Node strategy (read first)

- **Alienware (.40, this machine): mission-only.** Fable orchestrates outreach here
  to fund the existing Trollz1004 platforms. No NSFW work, no test bots, no adult
  lane on this node. Mission > NSFW, always.
- **Sabretooth (.15): the adult/test lane.** Trolly Agent, `D:\Grindroid`, and the
  other NSFW/test bots on D: move to Sabretooth's D: (1TB SSD).
  Hardware: Intel i7-4960X (6c/12t), 64 GB RAM, **AMD Radeon RX 6800 (16 GB)**,
  1 TB SSD, Windows x64.
- **Hermes account:** the SAME Nous Research account on both nodes. The user is
  open and public about Nous agent-harness usage — no grey areas. All adult
  tooling in this lane is designed to PROTECT against accidental AI-generated
  NSFW exposure (age gate, consent-only, no minors/gore ever, fail-closed
  Clean mode). Keep that posture. If a choice would embarrass Nous Research,
  make the other choice.

---

## 1. Trolly Agent — what exists now

Repo: `D:\mira\trolly-agent` → GitHub private `youandinotai/trolly-agent`,
branch `feature/initial-build`. Identity rule: push ONLY as `youandinotai`
(repo-local credential helper `D:/git-helpers/gh-youandinotai.sh` +
`credential.https://github.com.username youandinotai` are pinned — verified).
Never touch Trollz1004 repos with this lane.

Local-first Electron + Vue 3 + TS companion:
- Stage (chat + VRM avatar + vision attach + dictation + Kokoro female TTS,
  audio-driven visemes), Tools/MCP (comfyui 136 tools, maestro 24,
  computer-use 57), Providers (Ollama), Artistry (ComfyUI image/video +
  age-gated After Dark Pony img2img with local qwen2.5vl visual safety check),
  Studio (actors/wardrobe/scenes, VRM upload, parametric garments, D-one-of-one
  admin store), Mind (persona/memories/recipes/age-gated preferences),
  JEV task router (eve-cpu with deterministic offline fallback),
  Hermes ethics-review packet sender (sanitized; no images/prompts/paths).

### Clean/Adult safety system (the part that matters most)
- **One GUI, shared runtime.** `SessionMode` in `src/lib/session-mode.ts` is the
  current-session authority: saved preferences NEVER restore adult visuals;
  Adult requires a deliberate current-session unlock after age verification.
- **Clean is fail-closed and one-way:** Electron main mutes audio and raises an
  opaque native BrowserView shield FIRST, then applies in-memory Clean even if
  `mind.json` persistence fails (disk error ≠ protection failure). The shield
  lifts only after the renderer acknowledges two painted frames of the safe view
  (`trolly:mode:clean-ack` epoch-checked). Full renderer navigation/reload also
  forces Clean.
- **Late results:** every adult generation gets an epoch ticket; if Clean happens
  mid-render, IPC returns `{ kind: "suppressed" }` — no pixels, URL, or path.
  Verified against a REAL Pony img2img render interrupted mid-flight.
- **Avatar:** adult outfit hidden, modest dress + shoes fitted; unverifiable
  bodies stay behind the opaque cover (`verifiedBody` gate). Snapshot export
  blocked while the cover is active. Frame-race between Clean→Adult handled with
  a presentation epoch.
- **Media:** `SafeMedia` never mounts unreviewed img/video in Clean (attachments,
  results, library, scene artwork, After Dark references).
- **Paths:** canonical realpath containment in StudioStore; corrupt `studio.json`
  is preserved as `.corrupt-<ts>.json` before reseeding; writes are atomic
  (tmp + rename).
- **Hotkeys:** focused-window Ctrl+Alt+C + tray "Clean now" + Electron
  `globalShortcut`. Activation is one-way to Clean; Adult re-entry is a
  deliberate separate action.

### Verified evidence (as of this handoff)
- `npm test`: **66/66 pass**. `npm run typecheck`: pass.
  `npm run verify:leak`: 0 source-brand tokens.
- `node scripts/verify-safe-mode.mjs` against the live CDP:48702 instance:
  **all 9 checks pass** (usable Clean nav/chat, dressed avatar, real WebGL
  wardrobe change, Adult→Clean restore, focused hotkey, attachment hiding,
  After Dark reference removal, reload fail-safe, main-process generation block).
- `node scripts/verify-after-dark-clean-race.mjs`: real render interrupted by
  Clean → IPC `{state:"settled", result:{kind:"suppressed"}}`, no leak.
- `scripts/verify-clean-generation.mjs`: standard image generated in Clean,
  result + library covered, work unblocked.
- `scripts/smoke-avatar.mjs`: PASS (VRM load, expressions, controls) and Kokoro
  produced a valid RIFF WAV (1,015,244 bytes) on D:.
- Screenshots: `D:\Grindroid\trolly-agent\verification\`.
- Research report with citations: `reports/Trolly safe mode.md` (in repo).

### Process gate status
An independent reviewer FAILed the first batch with 6 findings; all 6 were
fixed (shield, snapshot guard, persistence fail-safe, canonical paths, corrupt
store, frame race; deduped double-hotkey). **A re-review of the fixed batch has
NOT yet run** — run it before treating the branch as fully reviewed:
`git diff HEAD~N` with the requesting-code-review skill.

## 2. What DEFINITELY still needs fixing (DEF list)

1. **Re-review + push gate.** Rerun the independent fail-closed review on the
   fixed diff; only then merge toward main (merges go through Josh/Claude judge).
2. **OS-global hotkey verification.** `globalShortcut.register('Control+Alt+C')`
   is registered, but real OS-level delivery was never proven on Alienware
   (desktop input driver blocked foreground send). Verify on Sabretooth; if
   registration collides, fall back is in-app keydown + tray.
3. **Approved-asset Clean library.** Today Clean hides ALL unreviewed media.
   Next: per-asset `safe/unsafe/unknown` approval store so known-safe images can
   show in Clean without unlocking Adult (see research report §"labels").
4. **Wardrobe quality.** Parametric primitives work and canvas-verified, but they
   are NOT real cloth: authored SkinnedMesh garments + versioned mesh manifests
   per VRM version are the real fix (see report §Wardrobe). T-pose is fixed
   visually on AvatarSample_K (VRM 1.0); regression-test against a VRM 0.x model.
5. **Live voice calls.** Not built: mic → chat → animated TTS with mute,
   interrupt, end-call. Build only after P0/P1 above.
6. **Comfy Desktop state.** Currently OFFLINE on Alienware; start it for Artistry.
   On Sabretooth, ComfyUI must be installed fresh (see §3).
7. **OmniRoute fallback.** Alias plan (Hermes `.env`: `OMNIROUTE_API_KEY`,
   `model.aliases.omni-best` → `http://192.168.0.15:20128/v1`, `key_env`) is
   configured conceptually but the endpoint **times out from .40** — .15 drops
   all probed ports. Open OmniRoute publicly + firewall on Sabretooth, then add
   `hermes fallback add` chain: Kimi/Nous → opencode-zen (already keyed) →
   omni-best → local eve-cpu.

## 3. Moving the lane to Sabretooth

Paths to migrate (stop every service using them first):
`D:\mira\trolly-agent` (repo — better: `git clone --branch feature/initial-build`
from GitHub on the new node instead of copying), `D:\Grindroid\trolly-agent`
(studio data, after-dark output, verification), plus the rest of the adult D:
lane (SoW `D:\sow`, D:\Grindroid root, test bots) as user directs.

Sabretooth caveats (RX 6800, AMD):
- SoW's current deployment is CUDA (torch 2.10.0+cu128) — that does NOT carry to
  AMD. Redeploy SoW fresh on Sabretooth (CPU or DirectML build), do not copy the
  venv. Keep the skill `soul-of-waifu-deploy` port conventions (48597/48598+).
- ComfyUI on Windows + AMD: use the DirectML build (or CPU; ROCm on Windows is
  still fragile). RX 6800 16 GB handles SDXL/Pony fine on DirectML with patience.
- Re-verify every port: Trolly band stays 48701-48777; do not collide with
  Sabretooth's existing 8391/8392/9119/8188/11434 reservations.
- Re-run `node scripts/verify-safe-mode.mjs` on Sabretooth after first launch;
  hardware-specific GPU behavior is exactly what the visual gate exists for.

## 4. Reference repos (for the next agent)

- Remake engine: https://github.com/rubenhassid1/remake (skill: `remake`)
- REA: https://github.com/morluto/rea (skill: `reverse-engineer-anything` —
  clean-room evidence only; never output likeness)
- Trolly research/design report: `reports/Trolly safe mode.md` in this repo
  (safety UX, VRM wardrobe repair, DREAM Forge reuse inventory + legal gates).
- DREAM Forge (clean source, READ-ONLY, all-rights-reserved; written permission
  required for direct reuse): `C:\Users\joshl\antigravity\DREAM-Engine` on .40.
  Pattern candidates are inventoried in the report — build the executor
  clean-room; DREAM's own generator is simulated.

## 5. Standing rules (unchanged)

D: only for all work files. Legal adults + consent always; no minors, no gore.
No NSFW on Trollz1004 mission repos, ever. Screenshots/tests or it isn't done.
"200 OK" proves nothing.
