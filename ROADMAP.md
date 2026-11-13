# Trolly Agent — Roadmap

The full picture, phased so each step ships working software rather than a
half-built shelf.

---

## Phase 0 — Foundation ✅ done

The skeleton everything else sits on.

- Electron + Vue 3 + TypeScript shell; every byte of state on `D:`.
- Chat against the local Ollama daemon, with image attach (vision via
  `qwen2.5vl`) and offline SAPI speech output.
- MCP client (JSON-RPC over stdio). Three servers wired: ComfyUI (136 tools),
  Maestro (24), Computer Use (57).
- ComfyUI generation: LTX-2.3 video, Z-Image Turbo image, Pony V6 (SDXL).
- **Mind**: consciousness (persona), long-term memories, prompt recipes, and
  age-gated content preferences.
- Clean-room leak scanner, 25 tests, private repo under `youandinotai`.

---

## Phase 1 — Media Studio

*Turn the Artistry tab into a real editor instead of a one-shot form.*

| Piece | What it does |
|---|---|
| **Model picker** | Every local model the machine actually has, grouped by kind: SDXL checkpoints (Pony V6, Illustrious), Z-Image Turbo, LTX video, Wan video. Reads ComfyUI's live model list, not a hardcoded list. |
| **Parameter panel** | Per-model params that actually apply — Pony wants euler/normal/cfg 7/steps 30 and a specific prompt tag order; Z-Image wants res_multistep/simple/cfg 1/steps 8. The panel switches with the model. |
| **Live preview** | The result renders in the app the moment it lands, with the seed, sampler and timing visible. Regenerate from the same seed without retyping the prompt. |
| **Media library** | Everything generated, on disk, browsable: thumbnail, model, seed, prompt. Reuse a past image's settings, or send it to image-to-video. |
| **Image-to-video** | Feed any library image into Wan or LTX for a clip. |
| **Upscale / convert** | Re-run a render at higher resolution, or convert to video/audio. |

---

## Phase 2 — The avatar — in progress

*The character needs a body.* The VRM renderer, expressions, lip sync, idle
motion, Studio persistence, and wardrobe primitives are implemented. Visual
fit, clothing quality, and natural posing remain an active verification lane.

- **3D VTuber** — VRM models via `three-vrm`, running in the renderer.
  Open format, no licence lock-in, and the engine renders an exported VRM
  faithfully rather than approximating it.
- **Characters come from VRoid Studio**, designed there and exported as VRM.
  We do not embed VRoid Studio in the app and do not reverse-engineer it;
  we consume the exported file. That keeps the character pipeline clean.
- **Live2D** — Cubism runtime, for models that exist only as Live2D. Second
  priority; VRM is the primary path.
- **Lip sync** — the TTS audio drives mouth shapes and head motion; the
  speech engine already produces WAV, so this is analysis of what exists.
- **Expression triggers** — emotion in the reply maps to a face shape.
- **Idle behaviour** — blink, breathing, sway, gaze that follows the cursor.
- **Performance guard** — the avatar throttles when the GPU is busy with a
  render, and the app stays responsive either way.

---

## Phase 3 — Modes

*The agent behaves differently depending on what you are doing.*

### Clean / Adult toggle ✅ built as shared presentation states

The global control now protects every visual surface without disabling the
agent. Clean installs a safe avatar outfit, removes unreviewed media elements,
stops adult speech playback, and suppresses late adult results through an
Electron-main session epoch. Clean is restored on launch and renderer reload.
The next visual-safety step is an approved-asset library, so known-safe media
can be shown without opening the entire Adult presentation.

Fixed limits that no toggle can switch off: legal adults only, consensual
adults only, no gore, everything stays local.

### Brainstorming — always on

Not a mode you enter. A standing capability.

- The agent offers alternatives instead of one answer, by default.
- Structured frames: divergent (generate options) → convergent (rank,
  recommend) → concrete (first step).
- It challenges the brief, not just the plan.
- Named sessions, so a thread of thinking can be resumed.
- Feeds the other modes: a brainstorm can become a novel outline, a media
  brief, or a persona.

### Novel writer

- **Projects**: chapters, an outline, a style bible, continuity notes.
- **Editor** with live preview, scene reordering, and a version history.
- **Continuity pass** — the agent checks names, timeline and world rules
  across chapters.
- **Exotic genre library** — a prompt/style kit for the genres that need one
  (erotica included, under the same adult-only rules).
- **Export** to Markdown, plain text, EPUB.

---

## Phase 4 — Extensibility

- **Plugin registry** — beyond MCP. A plugin can add a view, a panel, a
  tool, or a media backend. Manifest plus a capability model: what the
  plugin may read, what it may reach on the network.
- Brainstorming, the media studio and the novel writer are all built as
  plugins, so the extension point is real rather than aspirational.
- MCP servers stay the tool integration point; plugins are the UI extension
  point.

---

## Phase 5 — Polish

- Packaged installer and desktop entry.
- Tray, global hotkeys, autostart.
- Theme system, including the avatar-aware stage.
- Import/export of everything: personas, memories, recipes, media, plugins.

---

## Working practice

Every visual change ends the same way: a render, a screenshot, a side-by-side
against a reference, and a vision judge that scores named qualities with
written reasons. Below the bar, it goes back.

## Ground rules

1. **Clean-room.** No upstream brand tokens in the shipped surface. The
   scanner fails the build if one appears.
2. **Local first.** Every backend is a local server. The only outbound
   requests are to the providers you configure.
3. **D: only.** Source, state, models, and media live on `D:`.
4. **Adults only, always.** The mode toggle is a preference; the limits are
   not.
