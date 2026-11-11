# Local environment notes

Facts about this machine that are easy to forget and expensive to rediscover.
Paths, ports, and which backend actually serves what.

---

## Ports

**Never use a common port.** This machine hosts the game stack; the reserved
list comes from the DREAM-Engine README and `api.workflow.json`.

| Reserved | What |
|---|---|
| 3130 | Mission Control (T5500) |
| 8082 | Free Claude Code admin |
| 8188 | ComfyUI |
| 8390 | OPSis Cut & Reach Studio |
| 8391 | YouTube Shorts worker (Sabretooth) |
| 8392 | Hermes Leadgen |
| 9119 | Hermes (Sabretooth) |
| 9127 | Live NPC Lab |
| 9133 | DreamOps Bridge |
| 9150 | — |
| 9180 | DREAM Engine / 3D Studio viewport |
| 11434 | Ollama |
| 20128 | OmniRoute (T5500) |
| 27123 | — |
| 42000 | Pinokio API |
| 42013 | Uncensored Local Studio |
| 49374 | Shared ai-memory (T5500) |

**The 48xxx band belongs to Trolly Agent.**

| Port | What |
|---|---|
| 48701 | Trolly vite dev server |
| 48702 | Electron remote-debugging (CDP) |
| 48703 | Remake local serve |
| 48777 | Chrome remote-debugging (throwaway profile) |

---

## Services

| Service | Where | Notes |
|---|---|---|
| ComfyUI | `http://127.0.0.1:8188` | Comfy Desktop. Started with `--enable-cors-header "*"` so browser apps can call it. |
| ComfyUI FL-MCP | stdio | 136 tools. Spawned per-client; no fixed port needed. |
| Ollama | `http://127.0.0.1:11434` | Model store on `D:\ollama\models`. |
| Maestro | `http://127.0.0.1:7860` | 24 MCP tools. |
| Uncensored Local Studio | `http://127.0.0.1:42013` | Image API on `:8080`, text API on `:10086`. |
| Pinokio API | `http://127.0.0.1:42000` | See the install recipe below. |

---

## Uncensored Local Studio

- Installed at `D:\pinokio\api\uncensored-local-studio` (Pinokio package
  `cocktailpeanut/uncensored-local-studio.pinokio`).
- Models live in `D:\pinokio\api\uncensored-local-studio\app\app\models`.
  Drop a `.safetensors` or `.gguf` in and it appears on the next `/api/models`.
- Image backend is **stable-diffusion.cpp** (`sd-cuda.exe`). Supported
  architectures: `sd1 sd2 sdxl sd3 flux aura hyvid ltxv wan lumina2 hidream
  cosmos chroma qwen_image`.
- **It has no MiniMax support.** The MiniMax-H3 GGUFs declare an unknown
  architecture, so the Studio will not classify them as image models.
- Useful endpoints:
  - `GET /api/health` — runtime health and resolved paths
  - `GET /api/models` — what it has detected
  - `POST /api/restart-backend` — load a model: `{model, steps, cfgScale,
    sampler, width, height, use_gpu, backend_type}`
  - `POST /v1/images/generations` — OpenAI-shaped generation
  - `GET /api/outputs` — generated files

### Installing a Pinokio package from a git URL

`intent` is the part that bites — `install` is rejected.

```bash
# 1. prepare
POST /launcher/download/prepare  {"intent":"create_app","ref":"<git url>","name":"<folder>"}
#    -> returns {clone:{message,path,env}, finalize:{intent,name}}

# 2. run the clone command it returned

# 3. finalize
POST /launcher/download/finalize  {"intent":"create_app","name":"<folder>"}
#    -> {"ok":true,"url":"/initialize/<folder>"}
```

`intent: "ask"` is for *task packages* (tool plugins), not apps.
`POST /task/install` with `{"id":"t1"}` renders the install page; the page's
own form drives the actual run.

---

## Models

| Model | Where | Notes |
|---|---|---|
| `ponyDiffusionV6XL_v6StartWithThisOne.safetensors` | `D:\Comfy-Desktop\ComfyUI-Shared\models\checkpoints` (hardlinked into the Studio's models dir) | SDXL. Pony V6, 6616 MB. euler / normal / cfg 7 / 30 steps. |
| `z_image_turbo_bf16.safetensors` | `…\models\diffusion_models` | Standalone diffusion model, not a checkpoint. res_multistep / simple / cfg 1 / 8 steps. |
| `ltx-2.3-22b-distilled-fp8.safetensors` | `…\models\checkpoints` | LTX 2.3 video. Text encoder loads via `LTXAVTextEncoderLoader` against the checkpoint, not `CLIPLoader`. |
| `qwen_3_4b.safetensors` | `…\models\text_encoders` | Z-Image's encoder, `type: lumina2`. |
| `gemma_3_12B_it_fp4_mixed.safetensors` | `…\models\text_encoders` | LTX 2.3's encoder. |
| `ae.safetensors` | `…\models\vae` | Shared VAE. |

ComfyUI watches the model folders live — a new checkpoint shows up without a
restart.

### Civitai

Downloads work anonymously through `https://civitai.com/api/download/models/<versionId>?fileId=<fileId>`,
but **some** files redirect to `auth.civitai.com` and return a login page
instead of the model. `Illustrious-XL v2.0` is one of those; `Pony Diffusion V6
XL` is not. Check the final URL before pulling 6 GB.

`scripts/fetch-model.py` downloads with resume, follows the CDN redirect, and
refuses to accept a short payload as success.

---

## Ollama models

| Model | Notes |
|---|---|
| `huaquoctoan123/minimax-m3.1-uncensored:latest` | Thin wrapper around Ollama's **cloud** `minimax-m3.1-flash`. Uses no VRAM. |
| `qwen2.5vl:7b` | Local vision. |
| `eve-cpu:latest`, `kimi-k3:cloud`, and others | Local + cloud mix. |

There is **no small local MiniMax chat model**. Every MiniMax text model
(M1, M2, M3.1) is a large MoE — the smallest GGUF of M3.1 Flash is ~44 GB.
The cloud `minimax-m3.1-flash` is the fast option and leaves the 8 GB card
free for renders.

---

## Hardware

- GPU: NVIDIA RTX 3070, 8 GB VRAM.
- RAM: 39.7 GB.
- Model weights to fit 8 GB: `MiniMax-H3-Image-Pruned-Q2_K.gguf` (6.40 GB),
  `minimax_h3_ref2va_pruned-Q2_K_M.gguf` (6.26 GB).
- A 12 GB diffusion model (Z-Image Turbo bf16) runs, but offloads and takes
  ~6 minutes per 1024×1024 image. fp8/quantised weights are much faster.
