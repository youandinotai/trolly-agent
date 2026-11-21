# Claude Code — Trolly lane

Follow `AGENTS.md`. This file exists so Claude loads the same rules.

- Repo: `youandinotai/trolly-agent` only. Never Trollz1004.
- No healthcare specialist. No minors. No gore. Blood and gore stay in the negative.
- The floating avatar is the Hermes hatch pet on the right. A click runs Clean. No corner chip.
- Stage holds every send in the Director panel until Run. Stop makes no model call.
- Provider/model selection is on the initial Stage; agent profiles load but never auto-run.
- Workspace tasks and agent profiles stay in local app data under Electron's runtime-resolved `userData` location (or `TROLLY_DATA_DIR`); Vault and Studio paths must remain outside the source tree. Do not hardcode machine-specific local paths. Resume only fills Stage.
- Fresh MCP setup has no commands or auto-connections. New templates are stdio-only and stay disconnected; previously enabled entries may reconnect at startup. Filesystem access requires an explicit root.
- Ollama model pull/delete are explicit, with confirmation before delete. Provider keys stay in the provider service.
- App palette: vivid yellow/red with black/gray neutrals and accessible contrast.
- Wardrobe defaults to All and a Clean top. Ghost garment IDs are pruned on studio read.
- If you change behavior, update `AGENTS.md`, this file, and `GEMINI.md` before the commit.
- Do not commit password probes, `.env`, or `graphify-out/`.
