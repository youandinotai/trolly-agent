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

## Known environment gotchas
- MSYS `git` is permission-denied → use `/c/Program Files/Git/cmd/git.exe`
- Native Windows tools need `C:/...` forward-slash paths; MSYS conversion is off
- SoW's VRM HTTP server is **single-threaded** (`socketserver.TCPServer`) — one
  request at a time; a client that reads only a header and hangs up stalls it.
- SoW venv python is `app/data/envs/sow/python.exe` (no `Scripts/` subdir)
