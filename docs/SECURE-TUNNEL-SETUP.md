# Secure Tunnel Setup

**English** | [Bahasa Indonesia](id/SECURE-TUNNEL-SETUP.md)

This guide explains exactly what to prepare before running `warroom setup`, where to get the Tunnel ID and runtime API key, how to store the runtime key safely, and how to connect the same tunnel from ChatGPT.

War Room uses OpenAI Secure MCP Tunnel so the local Supervisor MCP can stay private and still be reachable from supported OpenAI products. The local MCP server does not need a public inbound port.

## 1. What you need

Before running `warroom setup`, prepare these two values:

- **Tunnel ID** — identifies the OpenAI-hosted tunnel. It looks like `tunnel_YOUR_TUNNEL_ID`.
- **Runtime API key** — authenticates the long-running `tunnel-client` process.

These are different credentials. Do not invent either value, and do not use test or dummy values for a real installation.

Official references:

- Secure MCP Tunnel: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- Tunnel management: https://platform.openai.com/settings/organization/tunnels
- Runtime API keys: https://platform.openai.com/settings/organization/api-keys

## 2. Get or create a Tunnel ID

Open Platform tunnel settings:

https://platform.openai.com/settings/organization/tunnels

Create a new tunnel or open an existing tunnel that should be used by War Room.

Creating or editing a tunnel requires **Tunnels Read + Manage**. Running the tunnel later requires **Tunnels Read + Use**.

Copy the tunnel identifier shown by Platform. It should look like:

```text
tunnel_YOUR_TUNNEL_ID
```

This value is the **Tunnel ID** that `warroom setup` asks for.

If ChatGPT will use this tunnel, make sure the tunnel is associated with the correct ChatGPT workspace. A tunnel that exists only in a Platform organization may not appear in a different ChatGPT workspace.

## 3. Create a runtime API key

Open Runtime API keys:

https://platform.openai.com/settings/organization/api-keys

Create a **Restricted** runtime API key for the identity that will run `tunnel-client`.

Grant the minimum tunnel permissions:

```text
Tunnels: Read
Tunnels: Use
```

Do not use an Admin API key for the long-running War Room tunnel runtime. Admin API keys are for tunnel management operations such as create, list, update, and delete.

Copy the runtime API key once when Platform shows it. Treat it as a secret.

## 4. Store the runtime key in a local secret file

War Room expects a **file path** to the runtime key. It does not ask you to paste the key directly into `warroom setup`.

Create a private secret directory:

```bash
install -d -m 700 "$HOME/.config/tunnel-client/secrets"
```

Then enter the key without echoing it to the terminal:

```bash
umask 077
read -rsp "Paste your OpenAI tunnel Runtime API key: " WARROOM_RUNTIME_KEY
printf '\n'

printf '%s\n' "$WARROOM_RUNTIME_KEY"   > "$HOME/.config/tunnel-client/secrets/warroom-runtime-key"

unset WARROOM_RUNTIME_KEY

chmod 600   "$HOME/.config/tunnel-client/secrets/warroom-runtime-key"
```

Verify the permission without printing the secret:

```bash
stat -c '%a %n'   "$HOME/.config/tunnel-client/secrets/warroom-runtime-key"
```

Expected:

```text
600 /home/YOUR_USER/.config/tunnel-client/secrets/warroom-runtime-key
```

Never commit this file, paste its contents into documentation, or share it in support logs.

## 5. Run `warroom setup`

Run:

```bash
warroom setup
```

For the normal War Room defaults:

```text
Supervisor alias [warroom-supervisor]:
```

Press **Enter**.

```text
Tunnel profile [warroom-supervisor-managed]:
```

Press **Enter**.

At:

```text
Tunnel ID:
```

paste the real Tunnel ID from Platform, for example:

```text
tunnel_YOUR_TUNNEL_ID
```

At:

```text
Runtime key file path:
```

paste the **path to the secret file**, not the API key itself:

```text
/home/YOUR_USER/.config/tunnel-client/secrets/warroom-runtime-key
```

War Room stores only this path in `~/.config/warroom/config.json`. It does not copy the runtime API key contents into the War Room config.

## 6. Verify the installation configuration

Run:

```bash
warroom doctor-install
```

A fully configured local installation currently targets:

```text
PASS : 31
WARN : 0
FAIL : 0
```

This verifies the local installation, configuration, file permissions, `tunnel-client`, guard plugin, and OpenCode MCP registration.

A successful `doctor-install` does **not** by itself prove that the Secure MCP Tunnel is connected to OpenAI. Tunnel connectivity is verified when the War Room runtime is started and the Supervisor becomes ready.

## 7. Start a project and verify the live tunnel

After a project has been registered and onboarded, start it:

```bash
warroom up <project>
warroom status <project>
warroom doctor <project>
```

For a healthy live system, the Supervisor should become ready and project health checks should pass.

The host running `tunnel-client` needs outbound HTTPS access to OpenAI and local access to the War Room Supervisor MCP. It does not require an inbound public port for the local MCP server.

## 8. Connect the same tunnel from ChatGPT

ChatGPT developer-mode access and Platform tunnel permissions are separate.

The operator creating the ChatGPT app needs access to developer mode for the target ChatGPT workspace and **Tunnels Read + Use** for the tunnel.

In ChatGPT, create a developer-mode app and choose **Tunnel** as the connection. Select the tunnel if it appears, or paste the same `tunnel_id` used in `warroom setup`.

If the tunnel does not appear, verify:

- the tunnel is associated with the target ChatGPT workspace;
- the operator has Tunnels Read + Use;
- `tunnel-client` is running and ready.

Current ChatGPT developer-mode instructions:

https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## 9. Common mistakes

Do not paste the runtime API key into the `Tunnel ID` prompt.

Do not paste the runtime API key itself into `Runtime key file path`; enter the file path instead.

Do not use an Admin API key as the long-running runtime key.

Do not reuse Tunnel IDs or runtime keys from examples, tutorials, or acceptance tests in a real installation.

Do not publish the runtime key file or `~/.config/warroom/config.json`.

If Platform shows the tunnel but ChatGPT cannot select it, check the ChatGPT workspace association and Tunnels Read + Use permission first.
