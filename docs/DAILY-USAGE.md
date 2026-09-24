# Daily Usage

## Morning / after reboot

```bash
cd /path/to/project
warroom up .
warroom doctor .
warroom cockpit .
```

`warroom up` starts missing Bridge, Frontend, Backend, and Supervisor tunnel components and marks the project active.

`warroom doctor` checks the project runtime, state, ownership policy, sessions, coordination store, MCP/guard syntax, OpenCode MCP registration, Supervisor status, and related health checks.

A healthy project currently reports:

```text
PASS : 22
WARN : 0
FAIL : 0
```

## Cockpit

```bash
warroom cockpit .
```

Cockpit shows Frontend and Backend side-by-side, but each pane is an OpenCode attach client connected to a separate already-running server and pinned session.

Move between panes:

```text
Ctrl+b, then Left/Right
```

Detach without stopping runtime:

```text
Ctrl+b, then d
```

## ChatGPT workflow

The normal human workflow is to talk to the Supervisor, not manually duplicate tasks into both OpenCode panes.

Recommended task prompt:

```text
Implement <GOAL> in the active project using Supervisor Operating Protocol v1.
Inspect project context and handoff first.
Plan the smallest complete change.
Delegate by ownership.
Coordinate shared paths before semantic changes.
Read and review both division responses.
Run appropriate verification.
Perform focused correction rounds if needed.
Update the persistent handoff at the end.
Return a factual final report.
```

## Switching projects

```bash
warroom projects
warroom up another-alias
warroom active
```

You can explicitly set active project with:

```bash
warroom use another-alias
```
