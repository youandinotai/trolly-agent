# Claude Code — Trolly lane

Follow `AGENTS.md`. This file exists so Claude loads the same rules.

- Repo: `youandinotai/trolly-agent` only. Never Trollz1004.
- No healthcare specialist. Adult mode, After Dark, MCP connections/tool calls, and Vault access require a self-reported 21+ age check; it is not identity verification. No minors or gore; blood and gore stay in the negative.
- The floating avatar is the Hermes hatch pet on the right. A click runs Clean. No corner chip.
- Stage holds every send in the Director panel until Run. Stop makes no model call. Image, video, and edit jobs stay in chat on `artokun/gemma4-comfyui-mcp:e2b` only. Comfy is the disconnected `comfyui-mcp` template. After Connect and Run, one tool round may call it.
- Provider/model selection is on the initial Stage; agent profiles load but never auto-run. Standard media prompts reject adult, under-21, and gore terms; text checks are not an image/video classifier. Local dictation uses a bounded WebM transcription request with filtered text output.
- Workspace tasks and agent profiles stay in local app data under Electron's runtime-resolved `userData` location (or `TROLLY_DATA_DIR`); Vault and Studio paths must remain outside the source tree. Do not hardcode machine-specific local paths. Resume only fills Stage.
- Fresh MCP setup has no commands or auto-connections. New templates are stdio-only and stay disconnected; previously enabled entries may reconnect at startup only after 21+ verification. Connect and tool calls require 21+ verification. MCP output is text-filtered in both modes; non-text output is blocked, but server side effects can occur before filtering. The filesystem template passes a chosen root but does not sandbox the server process.
- Vault media and names are AES-256-GCM encrypted at rest; migrating legacy files requires explicit confirmation. Lock clears the in-memory key.
- Chat image attachments are blocked until they can be age/content classified. After Dark prompts require numeric 21+ ages and are validated before image upload.
- `.soul` presets load and save only inside the runtime data directory, including saves. NSFW presets stay rejected until the current 21+ check passes. Clean saves redact sexual memory. Adult saves seal it with AES-256-GCM and reload it only with the Vault key. Neither runs a model or applies a LoRA.
- Incoming Telegram text is filtered locally. No bot token is stored or sent, and no Telegram network call is made.
- The node roster lists names, projects, and an optional local origin. A link keeps only the origin, drops any path or token, and opens no connection.
- Panda is an agent router. It names one agency skill. If Panda Code is down, local skill cards name that skill. Ordinary chat is not forced to engineering. The named agent keeps chat. Gemma is its local Ollama MCP and Comfy is a tool it may use. Neither opens Artistry by itself. Director Run remains the hold.
- Ollama model pull/delete are explicit, with confirmation before delete. Provider keys stay in the provider service.
- App palette: vivid yellow/red with black/gray neutrals and accessible contrast.
- Wardrobe defaults to All and a Clean top. Ghost garment IDs are pruned on studio read.
- If you change behavior, update `AGENTS.md`, this file, and `GEMINI.md` before the commit.
- Do not commit password probes, `.env`, or `graphify-out/`.
