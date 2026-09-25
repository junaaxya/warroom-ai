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

Minimum supported versions are not finalized yet; a clean Ubuntu VM compatibility pass is required before production release.

## 2. Bootstrap or install from source

### Recommended: fresh Ubuntu/Debian machine

From the repository root:

```bash
bash scripts/bootstrap-ubuntu.sh
```

The bootstrap checks the host first. Compatible dependencies are skipped; missing or incompatible dependencies are installed before War Room itself is installed.

The current bootstrap checks system tools such as `bash`, `curl`, `git`, `python3`, `tmux`, `ss`/`iproute2`, `unzip`, and `sha256sum`, plus Node.js >=20, npm, OpenCode, and `tunnel-client`.

To perform a read-only dependency audit:

```bash
bash scripts/bootstrap-ubuntu.sh --check
```

### Advanced: dependencies already prepared

If all prerequisites are already installed and compatible, install only War Room:

```bash
bash scripts/install.sh
```

Default installation root:

```text
~/.local/share/warroom
```

Default launcher symlink:

```text
~/.local/bin/warroom
```

The installer:

- validates required source files
- backs up an existing War Room installation before replacing it
- copies launcher, Bridge, MCP servers, guard, dependency manifests, and VERSION
- runs `npm ci --omit=dev`
- installs the global OpenCode guard
- merges the War Room MCP registration into OpenCode config
- creates the launcher symlink

## 3. Configure War Room

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
    "tunnel_id": "YOUR_TUNNEL_ID",
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

Use the current OpenAI Secure MCP Tunnel documentation to create/configure the customer's own tunnel and runtime credentials:

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

The local MCP command for the Supervisor is the installed `supervisor-mcp.js` under the War Room installation root.

Secure MCP Tunnel is intended for private MCP connectivity and does not itself provide public plugin distribution.

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
