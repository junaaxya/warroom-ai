# Installation

**English** | [Bahasa Indonesia](id/INSTALLATION.md)

## 1. Current target platform

War Room is currently developed and validated on Linux/Ubuntu-style environments.

Required commands:

```text
bash
python3
node
npm
tmux
curl
ss
opencode
```

War Room also uses OpenAI `tunnel-client` for the ChatGPT-facing Supervisor MCP.

Minimum supported versions are not finalized yet. A clean Ubuntu 24.04.5 x86_64 VM compatibility pass for bootstrap, installation, setup, and `warroom doctor-install` has passed. The public HTTPS installer has also passed fresh-install and repeat-install/idempotency acceptance on an Ubuntu 24.04 x86_64 container.

## 2. Install War Room

### Recommended: standalone release installer

End users do not need to clone the War Room source repository.

A War Room release consists of:

- `install-warroom.sh` — the standalone installer;
- a versioned `.tar.gz` release artifact;
- the matching `.sha256` checksum file.

The standalone installer downloads the release, verifies its SHA256 checksum, validates the archive layout, bootstraps missing dependencies, and installs War Room.

The public release endpoint is available over HTTPS. Install War Room with:

```bash
curl -fsSL https://install.lab-ilkom.my.id | bash
```

The installer automatically resolves the latest release metadata, downloads the versioned artifact and checksum, verifies SHA256, and installs War Room.

For custom or private distribution endpoints, advanced URL overrides remain available through `WARROOM_RELEASE_BASE_URL`, `WARROOM_MANIFEST_URL`, `WARROOM_RELEASE_URL`, and `WARROOM_CHECKSUM_URL`.

After installation, continue with [Secure Tunnel Setup](SECURE-TUNNEL-SETUP.md).

### Source/developer installation

Repository maintainers and developers can install from a source checkout:

```bash
bash scripts/bootstrap-ubuntu.sh
```

The bootstrap skips compatible dependencies and installs missing or incompatible prerequisites before installing War Room.

To audit dependencies without changing the machine:

```bash
bash scripts/bootstrap-ubuntu.sh --check
```

If all prerequisites are already available:

```bash
bash scripts/install.sh
```


## 3. Configure War Room

Before running setup, follow the detailed [Secure Tunnel Setup](SECURE-TUNNEL-SETUP.md) guide to create or select your Tunnel ID, create a Runtime API key, and store the key in a local secret file.

Run:

```bash
warroom setup
```

Default config path:

```text
~/.config/warroom/config.json
```

Example:

```json
{
  "supervisor": {
    "alias": "warroom-supervisor",
    "tunnel_profile": "warroom-supervisor-managed",
    "tunnel_id": "tunnel_YOUR_TUNNEL_ID",
    "runtime_key_file": "/home/user/.config/tunnel-client/secrets/warroom-runtime-key"
  }
}
```

War Room stores the **path** to the runtime key file, not the runtime key contents.

Recommended permissions:

```bash
chmod 600 ~/.config/warroom/config.json
chmod 600 /path/to/runtime-key
```

## 4. Secure MCP Tunnel

For the complete tunnel setup flow, including:

- where to get the Tunnel ID;
- how to create the Runtime API key;
- required tunnel permissions;
- how to store the runtime key with permission `600`;
- exactly what to enter into each `warroom setup` prompt;
- how to verify the live tunnel;
- how to connect the same tunnel from ChatGPT;

follow:

[Secure Tunnel Setup](SECURE-TUNNEL-SETUP.md)

Official OpenAI reference:

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

## 5. Create the ChatGPT app

Use current ChatGPT Developer Mode / custom MCP app documentation:

https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

The current Supervisor MCP exposes 14 tools:

```text
warroom_active_project
warroom_broadcast_plan
warroom_coordination_list
warroom_handoff
warroom_handoff_update
warroom_onboard_create
warroom_onboard_inspect
warroom_project_context
warroom_read_backend
warroom_read_frontend
warroom_resume
warroom_send_backend
warroom_send_frontend
warroom_status
```

## 6. Validate the installation

```bash
warroom doctor-install
```

Current healthy target:

```text
PASS : 31
WARN : 0
FAIL : 0
```

This checks command dependencies, product files, syntax, Node dependencies, War Room config, secret-file permissions, tunnel client, installed guard, and OpenCode MCP registration.
