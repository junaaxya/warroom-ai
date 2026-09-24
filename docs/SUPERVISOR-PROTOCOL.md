# Supervisor Operating Protocol v1

Required lifecycle:

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

## Inspect

Use project context, live status, active project, persistent handoff, and relevant division messages.

Useful tools:

```text
warroom_active_project
warroom_project_context
warroom_handoff
warroom_status
warroom_resume
```

## Plan

Identify Frontend work, Backend work, shared paths, protected paths, verification steps, and coordination points.

## Delegate

Use division-specific tools:

```text
warroom_send_frontend
warroom_send_backend
```

Use `warroom_broadcast_plan` only when both divisions genuinely need the same plan/context.

## Wait/read

Delivery is not completion. Read both division responses:

```text
warroom_read_frontend
warroom_read_backend
```

## Review

Check that the requested work is complete, ownership boundaries were respected, project rules were followed, shared-path changes were coordinated, and there are no unrelated changes.

## Verify

Verification must match the task and may include lint, typecheck, tests, build, HTTP checks, migrations, or manual/browser checks.

Never report a check that was not run.

## Correction loop

When something is incomplete:

1. identify the exact gap
2. send one focused correction
3. read the updated response
4. verify again

## Final report and handoff

Report factual changes, verification, open issues, and unperformed work. Update handoff fields such as current goal, status, completed work, decisions, verification, open issues, and next action.
