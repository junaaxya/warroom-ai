# War Room AI

**English** | [Bahasa Indonesia](README.id.md)

War Room AI is a local multi-agent engineering orchestration system for ChatGPT + OpenCode.

It gives one ChatGPT Supervisor a controlled way to coordinate two independent local engineering divisions:

- **Frontend**
- **Backend**

Each division keeps its own OpenCode process, pinned session, local port, context, and write-policy identity. The optional Cockpit shows both divisions side-by-side without merging their runtimes.

**Current version:** `0.1.0-alpha.1`

> Alpha status: installation, setup, uninstall, upgrade, rollback, state preservation, and installation health checks have been validated. A clean Ubuntu 24.04.5 x86_64 VM acceptance test for bootstrap, installation, setup, and installation health checks has passed.

## Architecture

```text
You
 │
 ▼
ChatGPT + War Room Supervisor app
 │
 ▼
OpenAI Secure MCP Tunnel
 │
 ▼
Local Supervisor MCP
 │
 ▼
Project Bridge
 ├──────────────────────┬──────────────────────┐
 ▼                      ▼                      │
Frontend OpenCode       Backend OpenCode       │
separate session        separate session       │
separate guard identity separate guard identity│
 └──────────── local agent / OMO tooling ──────┘
```

## Quick install

### Recommended: standalone release installer

End users do not need to clone the source repository.

Download `install-warroom.sh` from the authorized War Room distribution channel, then run it with the release URLs supplied by the distributor:

```bash
WARROOM_RELEASE_URL="<RELEASE_TAR_GZ_URL>" \
WARROOM_CHECKSUM_URL="<RELEASE_SHA256_URL>" \
bash install-warroom.sh
```

The installer verifies the SHA256 checksum, bootstraps missing dependencies, and installs War Room.

Public release hosting is not configured yet. Production distribution should use HTTPS.

Before running `warroom setup`, follow [Secure Tunnel Setup](docs/SECURE-TUNNEL-SETUP.md).

Then run:

```bash
warroom setup
warroom doctor-install
```

### Source/developer installation

Repository maintainers and developers can install from a source checkout:

```bash
bash scripts/bootstrap-ubuntu.sh
```

To check prerequisites without changing the machine:

```bash
bash scripts/bootstrap-ubuntu.sh --check
```

If all prerequisites are already compatible:

```bash
bash scripts/install.sh
```

After source installation, use the same [Secure Tunnel Setup](docs/SECURE-TUNNEL-SETUP.md), then run `warroom setup` and `warroom doctor-install`.

Default installed layout:

```text
~/.local/share/warroom/
├── bin/warroom
├── plugins/warroom-guard.js
├── warroom-bridge/
│   ├── bridge.cjs
│   ├── mcp.js
│   ├── supervisor-mcp.js
│   ├── package.json
│   └── package-lock.json
└── VERSION
```

Launcher:

```text
~/.local/bin/warroom
```

A healthy installation currently reports:

```text
PASS : 31
WARN : 0
FAIL : 0
```

## Daily use

After boot:

```bash
cd /path/to/project
warroom up .
warroom doctor .
warroom cockpit .
```

A healthy project runtime currently reports:

```text
PASS : 22
WARN : 0
FAIL : 0
```

Detach Cockpit without stopping runtimes:

```text
Ctrl+b, then d
```

Stop the current project:

```bash
warroom down .
```

## First project

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

Then use the ChatGPT Supervisor to perform read-only inspection, propose a strict ownership policy, wait for human approval, create onboarding, start the project, and run project doctor.

Low-level onboarding command:

```bash
warroom onboard <alias> <policy-json-file>
```

Normal users should prefer Supervisor-assisted onboarding.

## Security scope

War Room currently provides **workflow-level enforcement**, not an operating-system sandbox.

The guard controls normal War Room editing workflows and blocks common shell mutation paths, but it is not designed to contain malicious native programs, hostile local users, compromised plugins, or processes with unrestricted filesystem access.

Read access and write access are separate concerns. A path that is protected from writes may still be readable if project policy grants broad read access.

See [Security](docs/SECURITY.md).

## OpenAI compatibility

War Room uses OpenAI Secure MCP Tunnel to connect a private/local Supervisor MCP without exposing it directly to the public internet. OpenAI documents Secure MCP Tunnel as private MCP connectivity and not as public plugin distribution.

For ChatGPT custom MCP apps, plan and workspace availability can change. Check current OpenAI documentation before shipping or selling a release.

Official references:

- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## Documentation

- [Installation](docs/INSTALLATION.md)
- [Quick Start](docs/QUICKSTART.md)
- [Daily Usage](docs/DAILY-USAGE.md)
- [Project Onboarding](docs/PROJECT-ONBOARDING.md)
- [Supervisor Protocol](docs/SUPERVISOR-PROTOCOL.md)
- [Command Reference](docs/COMMAND-REFERENCE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Commercialization](docs/COMMERCIALIZATION.md)
- [Release Checklist](docs/RELEASE-CHECKLIST.md)

## Upgrade

```bash
bash scripts/upgrade.sh
```

Upgrade builds a candidate in staging, runs `npm ci`, validates syntax/dependencies, activates the candidate, updates integration files, and performs final validation. A post-activation failure triggers rollback to the previous program files, OpenCode configuration, and guard.

User configuration and `~/.warroom` state are preserved.

## Uninstall

```bash
bash scripts/uninstall.sh
```

Default uninstall removes program files, launcher symlink, installed guard, and the War Room MCP registration while preserving:

```text
~/.config/warroom/
~/.warroom/
```

## License

No final public software license has been selected yet. Do not publish the repository publicly or market redistribution rights until the commercial licensing model is finalized.
