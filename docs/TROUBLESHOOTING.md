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
