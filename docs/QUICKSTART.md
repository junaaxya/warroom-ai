# Quick Start

**English** | [Bahasa Indonesia](id/QUICKSTART.md)

**English** | [Bahasa Indonesia](id/QUICKSTART.md)

## First-time project

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

Then ask the ChatGPT War Room Supervisor to inspect `myapp`, propose ownership/shared/protected policy, and wait for explicit approval before creating onboarding.

After onboarding:

```bash
warroom up myapp
warroom doctor myapp
warroom cockpit myapp
```

## Daily startup

From inside an onboarded project:

```bash
warroom up .
warroom doctor .
warroom cockpit .
```

Detach Cockpit:

```text
Ctrl+b, then d
```

Stop runtime:

```bash
warroom down .
```
