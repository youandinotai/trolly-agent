# Trolly Agent architecture

```mermaid
graph TD
  subgraph Stage["Stage — explicit Director hold"]
    U[User prompt] --> R[Classify and planRouteSteps]
    R --> D[Director preview: profile, task, backend, model, steps]
    D -->|Stop| X[No model or tool call]
    D -->|Run| C{Task type}
  end
  C -->|chat| P[Selected provider adapter]
  P --> O[Ollama local]
  P --> G[Configured OpenAI-compatible endpoint]
  C -->|media| A[Existing media route and Artistry flow]
  A --> S[Adult-content and Clean gates]
  subgraph Local["Local application data"]
    AG[Agent profile registry — loaded, not executed]
    W[Workspace tasks — resume fills Stage]
    MC[MCP registry — configured stdio connections]
  end
  AG --> D
  W --> U
  MC --> T[Explicit MCP tools page and user calls]
```

The provider dropdown is available at startup. Ollama uses its local API; OmniRoute,
OpenCode-through-OmniRoute, Hermes, and custom providers use an OpenAI-compatible
`/models` and `/chat/completions` endpoint. Provider credentials remain in that
service. Image attachments are currently supported only by Ollama.

Agent profiles are loaded from `agent-profiles.json` and can be selected in Stage.
No profile runs at startup. Task titles, notes, and statuses are stored locally in
`tasks.json`; resuming a task only populates the Stage composer.

Fresh MCP configuration is empty. The UI offers filesystem, custom agent, browser,
and Playwright stdio templates. New servers are not auto-connected; previously
enabled config entries may reconnect at startup. Filesystem access requires an
explicit root folder. HTTP MCP transports are not implemented.

App data defaults to `path.join(app.getPath('userData'), 'data')`. The
`TROLLY_DATA_DIR` override relocates that root; Vault and Studio can be
overridden separately with `TROLLY_VAULT_DIR` and `TROLLY_STUDIO_DIR`, and
their stores reject paths inside the application source tree. Generated
Artistry media uses the same data root. A local Studio sample model can be
provided through `TROLLY_STUDIO_SAMPLE_MODEL`.

