# Project Onboarding

Onboarding converts a registered repository into a War Room project with explicit Frontend/Backend ownership, shared paths, protected paths, dynamic ports, and pinned OpenCode sessions.

## 1. Register alias

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

## 2. Read-only inspection

Ask the Supervisor:

```text
Inspect alias `myapp` for War Room onboarding.
Do not modify anything.
Read project structure and relevant repository rules.
Propose strict path-based ownership, shared paths, and protected paths.
Wait for my approval.
```

Supervisor tool:

```text
warroom_onboard_inspect
```

## 3. Policy model

Each division has ownership rules such as:

```json
{
  "write": [],
  "read": [],
  "deny_write": []
}
```

Shared policy includes shared paths, coordination policy, and reservation TTL. Protected paths are hard write-deny paths.

Current guard priority:

```text
protected
→ deny_write
→ shared coordination
→ owned write
→ default deny
```

## 4. Human approval

Review the proposed policy carefully, especially:

- Frontend-exclusive paths
- Backend-exclusive paths
- mixed/shared paths
- generated files
- secrets
- governance docs
- migration history
- test ownership

## 5. Create onboarding

After explicit approval, the Supervisor calls:

```text
warroom_onboard_create
```

This tool is asynchronous and idempotent. It may first report `running`; repeat the same approved call to check completion.

The low-level CLI equivalent is:

```bash
warroom onboard <alias> <policy-json-file>
```

## 6. Start and validate

```bash
warroom up myapp
warroom doctor myapp
```

Then verify from ChatGPT:

```text
Call warroom_active_project and report the result only.
```
