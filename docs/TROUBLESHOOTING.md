# Troubleshooting

**English** | [Bahasa Indonesia](id/TROUBLESHOOTING.md)

## Start with the right doctor

Installation problem:

```bash
warroom doctor-install
```

Project runtime problem:

```bash
warroom doctor .
```

## Tunnel ID or runtime key is unclear

Use [Secure Tunnel Setup](SECURE-TUNNEL-SETUP.md).

The Tunnel ID comes from OpenAI Platform tunnel settings. The Runtime API key is a separate credential used by `tunnel-client`.

When `warroom setup` asks for `Runtime key file path`, enter the path to the secret file, not the API key itself.

Recommended secret-file permission:

```bash
chmod 600 "$HOME/.config/tunnel-client/secrets/warroom-runtime-key"
```

## Cockpit cannot attach

First ensure runtime is up:

```bash
warroom up .
warroom status .
```

Cockpit attaches to existing OpenCode servers; it does not start duplicate division servers.

## ChatGPT app exposes stale tools

Validate the local Supervisor MCP first. Current Supervisor v2 exposes 14 tools.

If the local MCP is correct but ChatGPT still shows an older action set, refresh/recreate the custom app according to current ChatGPT behavior and test from a new eligible chat.

## `FORBIDDEN: This conversation does not support developer MCPs`

Treat this first as a ChatGPT conversation/surface capability problem. Confirm the local install/runtime is healthy before changing War Room.

## Onboarding takes too long

`warroom_onboard_create` is asynchronous/idempotent. A first call may return `running`; repeat the same approved request to read final status instead of starting duplicates.

## Backend response is unexpectedly empty

Send a minimal read-only diagnostic through the Supervisor, then read the Backend response. If the exact diagnostic token is returned, the channel is healthy and the earlier empty result was session/timing behavior.

## Guard blocks shell mutation

This is intentional. Use policy-aware edit/write/apply-patch tooling rather than shell mutation so ownership and shared coordination can be enforced.
## `doctor-install` passes but the tunnel is not connected

`warroom doctor-install` verifies local installation and configuration. It does not by itself prove live connectivity to OpenAI.

Start an onboarded project and check the runtime:

```bash
warroom up .
warroom status .
warroom doctor .
```

The Supervisor should become READY and healthy.

## Tunnel does not appear in ChatGPT

Check that:

- the tunnel is associated with the correct ChatGPT workspace;
- the operator has Tunnels Read + Use;
- the Tunnel ID is correct;
- `tunnel-client` is running and healthy;
- the War Room Supervisor is READY.

See [Secure Tunnel Setup](SECURE-TUNNEL-SETUP.md).

