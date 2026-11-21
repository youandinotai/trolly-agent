# Product

<!-- impeccable:product-schema 1 -->

## Platform
Electron desktop application with a Vue 3 renderer

## Users
People who want an AI companion and agent workspace they can run from a desktop, configure with their own model providers, and connect to their own tools.

## Product Purpose
Trolly Agent provides a persistent companion, configurable model and tool connections, local media generation, and a place to organize ongoing work. Success means users can understand what will run, choose the provider and agent, and explicitly approve execution.

## Positioning
Trolly is a local-first agent workspace: the user chooses the model route and available tools, and the Director preview holds work until Run is selected.

## Operating Context
The product is an Electron desktop app with a Vue renderer. Users configure provider endpoints and MCP servers, work with local Ollama models, review routed work in Stage, and manage persona, memories, and media in the app.

## Capabilities and Constraints
- Runtime data stays local unless the user configures a provider endpoint or server.
- Stage classifies a request and presents the specialist, backend, model, and planned steps before any model or media call. Run executes; Stop makes no call.
- MCP tools are explicit and configurable; do not silently run tools or agents.
- Legal adults only. No minors, gore, or extreme violence; the safety gate remains fail-closed.
- Healthcare is not a router option.
- Apps, Multi-Project, Design, Automations, Atlas, and Hot-Swap AI Plans are not built.

## Brand Commitments
The product name is Trolly Agent; its public-facing project identity is Trolly Project Online. The requested palette is vivid yellow and red with black and gray neutrals. Do not retain another product's brand identity, copy, or imagery as Trolly's.

## Evidence on Hand
Repository README.md, docs/ARCHITECTURE.md, STATUS.md, and the existing app views document the current product. Do not claim features or completed media that STATUS.md does not verify.

## Product Principles
- Make provider, agent, and tool choices visible before work runs.
- Preserve the explicit Director Run/Stop hold.
- Keep user data local unless the user configures a remote endpoint.
- Make connection and execution state legible, with actionable errors.
- Keep safety constraints fixed and fail closed.

## Accessibility & Inclusion
Use keyboard-operable controls, visible focus, semantic status text, and contrast that meets WCAG AA for body text and controls. Do not communicate state through color alone.
