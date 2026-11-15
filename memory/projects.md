# Projects — state

| Project | State | Next step |
|---|---|---|
| Trolly Agent (`D:\Trolly\app`) | **Lane consolidated 2026-11-13.** Alienware .40 is mission-only (Fable outreach for Trollz1004). The whole adult/test lane now lives in one folder `D:\Trolly` (app/, data/, studio-nsfw/, tools/, airi/, workflows/, memory/, handoff/ + junctions for sow/comfy/pinokio/ollama/remake-engine/remakes/hermes-skills/git-helpers/npm-global). Sabretooth (i7-4960X/64GB/RX 6800 16GB AMD) is the target node. Same Nous account both nodes; open/public posture. | See `HANDOFF.md` in repo; verify on Sabretooth after migration |
| Trolly repo | `youandinotai/trolly-agent` is the ONLY lane repo (branch `feature/initial-build`, head `46b2f87`). `remake-airi` merged in as `airi-remake/` (history preserved) then archived. `Hermes` repo (mission config, D:\Grin Droid) + date app repo stay separate — nothing adult touches them. | none |
| Trolly Studio + VRM avatar + Kokoro voices + Clean gate | ✅ 68 tests, typecheck, leak scan, 9/9 live safe-mode checks, real After Dark suppression race, valid Kokoro WAV. 2026-11-13: cups/cap/dress fit fixed, Clean closet hides intimate pieces, hair white-bluish `#dff4ff`, Clean torso shader restore. | Authored SkinnedMesh garments (parametric fit still approximate in Adult); approved-asset Clean library; OS-global hotkey verify on Sabretooth; fresh AMD installs of ComfyUI/SoW |
| Trolly live voice calls | ❌ NOT BUILT | Add mic → chat → animated TTS conversation with mute, interrupt, and end-call after avatar/audio verification |
| Grins no Sins Studio | ✅ DONE + local QA pass | Lives at `D:\Trolly\studio-nsfw\grins-no-sins-studio` (separate React app, commit 0d9f293 on feature/grins-studio). Decision: port unique features into Trolly or keep as lane sibling — do not delete |
| SoW v2.5.1 deploy | ✅ DONE + verified | none |
| SoW VRM (AvatarSample_K) | ✅ installed in assets/emotions/vrm, HTTP 200 verified | none |
| ComfyUI on D: (8188) | ✅ running, FL-MCP 136 tools connected | none |
| ollama D: relocation | ✅ 30G store on D:, registry set | C: `.ollama` re-creates empty dirs (145K/6 files) on app restart — harmless, monitor |
| AIRI on D: | ⏸ installed at `D:\Trolly\airi`, never launched | launch once, import VRM, confirm VRM 1.0 renders |
| Hermes nodes .08 / .15 | ❌ unreachable from this machine | `.15` alive but all ports dropped; needs `hermes serve --host 0.0.0.0 --port 9119` + firewall rule on .15 |
| Agent memory | ✅ in repo `memory/` (continuity.md, prefs.md, projects.md, handoff/) — moved from D:\Trolly\memory 2026-11-13 | keep updated; read at session start |

## Alienware .40 after the move
- Mission-only, **isolated**: never pulls Trollz1004 repos.
- D: drive moves to Sabretooth; lane data that stays behind may live on
  Alienware's C: (user-authorized exception to the D:-only rule, 2026-11-13).

## Sabretooth (this node, verified 2026-11-13)
- Hostname SABRETOOTH, RX 6800 16GB, 64 GB RAM. D: is the drive moved from Alienware.
- `youandinotai/trolly-agent` at `D:\Trolly\app`, branch `feature/initial-build`, head `a0da076`, remote only that repo. Git needs `safe.directory` because the Alienware SID owns the files. GitHub CLI is installed but not logged in, so the youandinotai helper cannot fetch yet.
- App rebuilt and launched (Electron pid with window title "Trolly Agent", CDP 127.0.0.1:48702). `npm test` 67/67. `node scripts/verify-safe-mode.mjs` 9/9 pass.
- Ollama user env `OLLAMA_MODELS=D:\ollama\models`. 127.0.0.1:11434 serves the moved store, including `eve-cpu:latest` and `qwen2.5vl:7b`. AMD driver warning: GPU seen via Vulkan, driver reported too old for the native AMD path.
- Not carried over from Alienware C:: Comfy Desktop app, Pinokio launcher. GitHub CLI is installed but not logged in, so fetch still cannot use the youandinotai helper.
- Comfy: moved torch is `2.12.1+cu130` and was not started. DirectML import works (`torch-directml` on torch 2.4.1) but ComfyUI 0.43.2 `comfy-kitchen` cannot start on that pin. Smoke server is a separate CPU env at `D:\Comfy-Desktop\cpu-env` (`torch 2.15.0+cpu`), launched with `--cpu` on `127.0.0.1:8188`. GPU generation is not available until an AMD-capable stack exists for this Windows 10 box.

## Known environment gotchas
- MSYS `git` is permission-denied → use `/c/Program Files/Git/cmd/git.exe`
- Native Windows tools need `C:/...` forward-slash paths; MSYS conversion is off
- SoW's VRM HTTP server is **single-threaded** (`socketserver.TCPServer`) — one
  request at a time; a client that reads only a header and hangs up stalls it.
- SoW venv python is `app/data/envs/sow/python.exe` (no `Scripts/` subdir)
