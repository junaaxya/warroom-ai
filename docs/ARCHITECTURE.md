# Architecture

## Components

### Launcher

The `warroom` CLI resolves project aliases, canonical paths, project identity, state, runtime processes, onboarding, health checks, and Cockpit/attach UX.

### Project state

Per-project state lives under:

```text
~/.warroom/projects/<project_id>.json
```

### Active project

The global Supervisor follows:

```text
~/.warroom/active-project.json
```

### Persistent handoff

```text
~/.warroom/handoffs/<project_id>.json
```

### Frontend / Backend

Each division has its own OpenCode process, server port, pinned session, context, and `WARROOM_DIVISION` identity.

### Guard

A global OpenCode plugin applies the project-specific ownership policy.

### Bridge

A per-project Bridge handles status, Supervisor messaging, division message retrieval, and shared-path coordination.

### Division MCP

OpenCode registers a local War Room MCP pointing at the installed `mcp.js`.

### Supervisor MCP

The ChatGPT-facing Supervisor MCP operates against the active project and exposes project/status/delegation/handoff/onboarding tools.

### Secure MCP Tunnel

`tunnel-client` provides outbound-only private connectivity between the local Supervisor MCP and supported OpenAI products.

## Shared-path coordination

Current lifecycle:

```text
pending
→ approved
→ reserved
→ consumed
```

Reservations may also expire.

## Why two OpenCode processes?

Two independent processes provide clearer ownership identity, separate session context, concurrency, and failure isolation. Cockpit is only a view/client layer.
