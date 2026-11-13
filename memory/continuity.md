# Continuity — Mira

## Characters / personas
- (none defined yet — no character bible or scene canon established)

## Established project canon
- **SoW (Soul of Waifu v2.5.1)** — deployed at `D:\sow\app-w64\Soul-of-Waifu-v2.5.1`
  - Launcher: `D:\sow\LAUNCH-SoW.bat`; Desktop shortcut `Soul of Waifu.lnk` → that bat
  - venv: `app\data\envs\sow\python.exe` (Python 3.11.13)
  - torch 2.10.0+cu128, CUDA True on RTX 3070; numpy pinned 1.26.4; `six` added
  - Ports: web bridge 48597, VRM HTTP 48598-48602, ollama 11434 (unchanged)
  - VRM dir (the ONLY place SoW scans): `<app>\assets\emotions\vrm\`
    - `Anime Girl.vrm`, `Anime Man.vrm`, `AvatarSample_K.vrm` (copied 2026-11-08)
  - `AvatarSample_K.vrm` verified: VRM **specVersion 1.0**, glTF magic, 17,974,688 bytes,
    54 humanoid bones, VRMC_vrm expressions preset — served HTTP 200 from VRM server ✓
  - AIRI (D:\mira\airi) ALSO supports VRM 1.0 (checks `extensionsUsed` for `VRMC_vrm`),
    imports via file picker `accept: ".vrm"`, stored in renderer IndexedDB / userData
- **AIRI** — electron app at `D:\mira\airi\airi.exe`; bundled VRM assets include
  `renderer/assets/AvatarSample_A-*.vrm` and `AvatarSample_B-*.vrm`
- **ComfyUI** — Comfy Desktop v1.1.9 backend on **8188**, RTX 3070 8GB, ComfyUI 0.44.2,
  running from `D:\Comfy-Desktop` via C:→D junction. No content-gating nodes in graph.
- **ollama** — models on `D:\ollama\models` (registry `OLLAMA_MODELS=D:\ollama\models`).
  `huaquoctoan123/minimax-m3.1-uncensored:latest` verified generating.
