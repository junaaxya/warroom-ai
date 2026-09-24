# War Room Handbook

**English** | [Bahasa Indonesia](id/HANDBOOK.md)

This is the main operator manual for operating War Room after installation.

Current documented release: **0.1.0-alpha.1**

For first-time setup, read [Installation](INSTALLATION.md), [Quick Start](QUICKSTART.md), and [Project Onboarding](PROJECT-ONBOARDING.md).

Initial setup flow: `bash scripts/install.sh` → `warroom setup` → `warroom doctor-install`.

## 1. The mental model

War Room has three human-facing layers:

```text
ChatGPT Supervisor = plans, delegates, reviews, verifies
Frontend division   = independent OpenCode session for frontend-owned work
Backend division    = independent OpenCode session for backend-owned work
```

The human normally talks to the Supervisor, not separately to both divisions.

The Supervisor sends work through the Bridge. The divisions return results. The Supervisor reviews the results, asks for corrections when necessary, verifies the final state, and updates a persistent handoff.

### Why two divisions?

Each division has its own:

- OpenCode process
- local port
- pinned session ID
- conversation context
- `WARROOM_DIVISION` identity
- write ownership

This keeps Frontend and Backend logically separate while allowing them to work concurrently.

### What cockpit changes

Nothing in the architecture. Cockpit is only a convenient terminal view:

```text
┌────────────────────────────┬────────────────────────────┐
│ FRONTEND OpenCode          │ BACKEND OpenCode           │
│ independent session        │ independent session        │
└────────────────────────────┴────────────────────────────┘
```

## 2. Daily workflow

After boot:

```bash
cd /path/to/project
warroom up .
warroom doctor .
warroom cockpit .
```

`warroom up` marks the project active and starts any missing runtime components.

`warroom doctor` verifies state, ports, reachability, pinned sessions, policy, bridge, MCP, guard, tunnel, Supervisor process, and OpenCode MCP registration.

`warroom cockpit` attaches two OpenCode clients to the already-running Frontend and Backend servers.

### Tmux controls

Move panes:

```text
Ctrl+b, then Left/Right arrow
```

Detach:

```text
Ctrl+b, then d
```

Detaching does not stop Frontend, Backend, Bridge, or Supervisor.

## 3. ChatGPT workflow

In ChatGPT, select or mention the War Room Supervisor app for a message that needs a tool call.

Confirm the active project:

```text
Call warroom_active_project and report the result only.
```

Resume a project:

```text
Call warroom_resume and summarize the current goal, completed work,
open issues, verification, decisions, and next action.
```

Assign a real task:

```text
Implement <GOAL> in the active project using Supervisor Operating Protocol v1.

Inspect project context and handoff first.
Create the smallest complete implementation plan.
Delegate by ownership.
Coordinate shared paths before semantic changes.
Read and review both division responses.
Run appropriate verification.
Send focused correction rounds if necessary.
Do not claim checks that were not run.
Update the persistent handoff at the end.
Return a factual final report.
```

## 4. Supervisor Operating Protocol v1

The required lifecycle is:

```text
inspect
→ plan
→ delegate
→ wait/read
→ review
→ verify
→ correction loop if needed
→ final report
→ handoff update
```

### Inspect

Read the active project, context, handoff, status, and relevant prior messages.

Useful tools:

```text
warroom_active_project
warroom_project_context
warroom_handoff
warroom_status
warroom_resume
```

### Plan

Identify:

- Frontend work
- Backend work
- shared paths
- protected paths
- verification steps
- coordination points

### Delegate

Use separate instructions when responsibilities differ:

```text
warroom_send_frontend
warroom_send_backend
```

Use `warroom_broadcast_plan` only when both divisions genuinely need the same plan/context.

### Wait/read

Delivery is not completion. Read both responses:

```text
warroom_read_frontend
warroom_read_backend
```

### Review

Check that:

- the requested work was actually done
- ownership rules were respected
- no unrelated refactor occurred
- project rules were followed
- claims are supported by evidence
- shared-path changes followed coordination

### Verify

Verification depends on the project and task, for example:

```text
lint
typecheck
tests
build
HTTP checks
migration checks
manual/browser verification
```

Never claim a check that was not actually run.

### Correction loop

When something is incomplete:

1. identify the exact gap
2. send one focused correction
3. read the updated response
4. verify again

### Handoff

The handoff should record:

```text
current_goal
status
completed
open_issues
decisions
verification
next_action
```

## 5. Project registry and switching

Register an alias:

```bash
warroom add myapp /absolute/path/to/myapp
```

List projects:

```bash
warroom projects
```

Start/switch to an onboarded project:

```bash
warroom up myapp
warroom doctor myapp
```

Show current active project:

```bash
warroom active
```

Explicitly mark an onboarded project active:

```bash
warroom use myapp
```

For a simple workflow, prefer `warroom up <alias>` when switching because it also starts missing runtime components.

## 6. Project onboarding

A project must be onboarded before normal use.

### Register

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

Before onboarding it should show `NEEDS ONBOARDING`.

### Inspect in ChatGPT

```text
Inspect alias `myapp` for War Room onboarding.
Do not modify anything.
Read project structure and relevant repository rules.
Propose strict path-based ownership, shared paths, and protected paths.
Wait for my approval.
```

The Supervisor uses `warroom_onboard_inspect` and makes no project changes.

### Policy model

Each division has:

```json
{
  "write": [],
  "read": [],
  "deny_write": []
}
```

The project also has:

```json
{
  "shared": {
    "paths": [],
    "policy": "coordinate_before_semantic_change",
    "reservation_ttl_ms": 600000
  },
  "protected": {
    "paths": []
  }
}
```

Write decision priority:

```text
1. protected.paths  → deny
2. deny_write       → deny
3. shared.paths     → coordination required
4. division write   → allow
5. everything else → default deny
```

### Human approval

Review the exact policy. Pay special attention to:

- governance documents
- secrets
- generated code
- migrations
- root configuration files
- tests
- cross-cutting feature modules

### Create onboarding

After explicit approval, the Supervisor calls `warroom_onboard_create`.

The current tool is asynchronous and idempotent.

First call may return:

```json
{
  "status": "running",
  "started": true,
  "alias": "myapp",
  "pid": 12345
}
```

Call the same tool again with the same approved policy to check status.

Completion resembles:

```json
{
  "status": "completed",
  "created": true,
  "alias": "myapp",
  "project_id": "myapp-...",
  "state_file": "/home/user/.warroom/projects/myapp-....json",
  "frontend": {"port": 4200, "session": "ses_..."},
  "backend": {"port": 4201, "session": "ses_..."},
  "bridge": {"port": 4202},
  "stderr": null,
  "warning": null
}
```

Then:

```bash
warroom up myapp
warroom doctor myapp
```

Finally confirm from ChatGPT with `warroom_active_project`.

## 7. Files stored by War Room

Project state:

```text
~/.warroom/projects/<project_id>.json
```

Active project pointer:

```text
~/.warroom/active-project.json
```

Persistent handoff:

```text
~/.warroom/handoffs/<project_id>.json
```

Coordination store:

```text
~/.warroom/runtime/<project_id>-shared.json
```

Async onboarding jobs:

```text
~/.warroom/jobs/
```

## 8. Project identity and ports

Project ID format:

```text
<sanitized-basename>-<canonical-path-hash>
```

This prevents collisions between projects with the same basename.

New projects receive free ports that are neither listening on the host nor reserved in existing War Room states.

## 9. Manual attach commands

Attach one division:

```bash
warroom attach frontend .
warroom attach backend .
warroom attach bridge .
```

Direct division launch commands also exist:

```bash
warroom frontend .
warroom backend .
warroom bridge .
```

During normal operation, prefer Supervisor-driven work. Manual pane interaction is best for debugging and observation.

## 10. Current Supervisor toolset

A current installation exposes 14 tools:

```text
warroom_status
warroom_project_context
warroom_send_frontend
warroom_send_backend
warroom_broadcast_plan
warroom_read_frontend
warroom_read_backend
warroom_coordination_list
warroom_active_project
warroom_handoff
warroom_handoff_update
warroom_resume
warroom_onboard_inspect
warroom_onboard_create
```

## 11. Shutdown

Detach cockpit if open:

```text
Ctrl+b, then d
```

Stop project runtime:

```bash
warroom down .
```

## 12. Recommended operator rule

When `warroom doctor` is not healthy, do not begin a source-changing supervised task until the failure is understood.
