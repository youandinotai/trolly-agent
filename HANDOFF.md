# HANDOFF — Hermes to Hermes (2026-11-12)

Audience: the next Hermes instance (Sabretooth node) and any agent resuming this work.
Written on Alienware (.40) before the NSFW lane moves to Sabretooth (.15).

---

## 0. Node strategy (read first)

- **Alienware (.40, this machine): mission-only.** Fable orchestrates outreach here
  to fund the existing Trollz1004 platforms. No NSFW work, no test bots, no adult
  lane on this node. Mission > NSFW, always.
- **Sabretooth (.15): the adult/test lane.** Everything in `D:\Trolly` moves to
  Sabretooth's D: (1TB SSD). Hardware: Intel i7-4960X (6c/12t), 64 GB RAM,
  **AMD Radeon RX 6800 (16 GB)**, 1 TB SSD, Windows x64.
- **Hermes account:** the SAME Nous Research account on both nodes. The user is
  open and public about Nous agent-harness usage — no grey areas. All adult
  tooling in this lane is designed to PROTECT against accidental AI-generated
  NSFW exposure (age gate, consent-only, no minors/gore ever, fail-closed
  Clean mode). Keep that posture. If a choice would embarrass Nous Research,
  make the other choice.

---

## 1. Trolly Agent — what exists now

Repo: `D:\Trolly\app` → GitHub private `youandinotai/trolly-agent`,
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

**"Agent Forge NSFW" note:** the user's NSFW studio app is
`D:\Trolly\studio-nsfw\grins-no-sins-studio` — a separate React/Vite app
(branch `feature/grins-studio`, commit 0d9f293) that was never merged into
Trolly. Trolly's Studio tab is the successor. Either port unique Grins
features into Trolly or keep it as a lane sibling; do not delete it without
asking.

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
- Screenshots: `D:\Trolly\data\verification\`.
- Research report with citations: `reports/Trolly safe mode.md` (in repo).

### Process gate status
An independent reviewer FAILed the first batch with 6 findings; all 6 were
fixed (shield, snapshot guard, persistence fail-safe, canonical paths, corrupt
store, frame race; deduped double-hotkey). **A re-review of the fixed batch has
NOT yet run** — run it before treating the branch as fully reviewed:
`git diff HEAD~N` with the requesting-code-review skill.

## 2A. Required installs on Sabretooth (before Trolly runs there)

1. **Comfy Desktop (ComfyUI)** — install fresh; on the RX 6800 use the DirectML
   build (CPU fallback acceptable for smoke tests). Set
   `--enable-cors-header "*"` in `%APPDATA%\Comfy Desktop\installations.json`
   `launchArgs` for every instance (Trolly itself is immune — its Electron main
   process calls Comfy — but browser-origin apps need it). Port stays 8188.
2. **Pinokio** — install, then **Maestro** at `<pinokio>\api\maestro`
   (`app\env-agent` for the MCP entry; 24 tools). Pinokio API 42000.
3. **Free Claude Code** — admin on 8082 (executor lane; judged by the Claude
   judge lane per the monorepo rules).
4. **MCP servers (repo checkouts Trolly spawns):**
   `comfyui-fl-mcp` (136 tools, stdio), Maestro MCP (24), `cua-driver mcp`
   (computer-use, 57). Default registry seeds at first launch into
   `data/mcp-servers.json` — edit paths there for the new node.
5. **Ollama** with `OLLAMA_MODELS` on D:. Pull: `eve-cpu:latest` (JEV router),
   `qwen2.5vl:7b` (After Dark visual safety), plus the chat model of choice.
6. **Node LTS + native git.** MSYS git is permission-denied on these boxes —
   use `C:\Program Files\Git\cmd\git.exe`.
7. **Hermes** (same Nous account), `hermes serve --host 0.0.0.0 --port 9119` +
   firewall rule, then OmniRoute 20128 public + firewall (currently drops all
   ports from .40).

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
4. **Wardrobe quality — user-confirmed visual bugs (2026-11-12 screenshot).**
   In Studio Adult mode the fit is visibly wrong and must NOT ship as-is:
   bikini cups render beside/armpit-adjacent to the torso instead of centered
   on the chest; the "Midnight cap" reads as a tall top hat (crown height
   wrong); the base body stays partially exposed around the primitives; and the
   flat-shaded parametric pieces clash with the model's toon shading (no
   material/lighting match). First-pass fixes landed 2026-11-13 (cups recentered
   ±0.045h at −0.07h, cap crown cut to 0.045h, hair default now white-bluish
   `#dff4ff`) — **still needs a visual pass on Sabretooth**; the real fix is
   authored SkinnedMesh garments + versioned mesh manifests per VRM version
   (see report §Wardrobe). Reference target image for the formal-gown style:
   `assets/references/formal-gown-example.jpg` (user-supplied, in repo).
4b. **Dangling garment references.** Live `studio.json` showed actor
   `garmentIds` pointing at deleted garment records (stale UUIDs from earlier
   upload cycles). Add pruning on `read()`/`loadActor` (drop ids with no
   matching garment) so the Dressing Room count and `applyLook` never chase
   ghosts.
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

## 2B. One repo for the lane

`youandinotai/trolly-agent` is the single repo for the whole Trolly lane.
`remake-airi` was merged in as `airi-remake/` (history preserved, commit
`50a7e2a`) and then **archived** (read-only, 2026-11-13). The other
youandinotai repos stay separate by design:

- `youandinotai/Hermes` — mission-lane config (D:\Grin Droid pushes here).
  Nothing adult ever touches this repo.
- `youandinotai/youandinotai` — the DATE APP. Untouched.

## 3. Moving the lane to Sabretooth

**One folder now:** `D:\Trolly` is the entire lane on Alienware (created
2026-11-13). Layout:

```
D:\Trolly\
  app\                    ← the repo (git clone target on Sabretooth)
  data\                   ← studio\, after-dark\, verification\, test-tmp\, misc\
  studio-nsfw\            ← grins-no-sins-studio (the separate NSFW studio app)
  workflows\              ← trolly-nsfw workflow artifacts
  memory\ handoff\        ← Mira memory + cross-node notes
  tools\ airi\ uncensored-local-studio\
  sow\ comfy\ pinokio\ ollama\ remake-engine\ remakes\
  hermes-skills\ git-helpers\ npm-global\   ← junctions to the shared engines
```

Paths to migrate (stop every service using them first): the whole `D:\Trolly`
tree. Clone the repo from GitHub on the new node (do NOT copy the old repo
folder); robocopy `data\`, `studio-nsfw\`, `workflows\`, `memory\`, `handoff\`
if you want the generated media and notes. Recreate the junctions on
Sabretooth (script: `data\misc\make-junctions.ps1`).

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
