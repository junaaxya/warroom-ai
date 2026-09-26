# Compatibility

**English** | [Bahasa Indonesia](id/COMPATIBILITY.md)

War Room AI is currently validated on Ubuntu 24.04.x x86_64. The automatic bootstrap contains explicit Ubuntu/Debian-family and x86_64/arm64 paths, but an implemented code path is not the same as an acceptance-tested platform.

## Status definitions

- **Validated** — exercised by an acceptance test covering the stated flow.
- **Implemented, not acceptance-tested** — the bootstrap contains an explicit supported code path, but that platform has not completed the same acceptance test.
- **Not claimed** — War Room does not currently claim compatibility for this platform.

## Platform matrix

| Platform | Architecture | Status | Evidence |
| --- | --- | --- | --- |
| Ubuntu 24.04.5 | x86_64 / amd64 | **Validated** | Clean VM bootstrap, installation, setup, and `warroom doctor-install` passed; public HTTPS installer fresh-install and repeat-install/idempotency also passed on Ubuntu 24.04 x86_64.
| Ubuntu / Debian family | arm64 / aarch64 | **Implemented, not acceptance-tested** | Bootstrap accepts `arm64`/`aarch64` and resolves the arm64 tunnel-client build, but no full acceptance test has been completed.
| Debian family | x86_64 / amd64 | **Implemented, not acceptance-tested** | Bootstrap accepts Debian and Debian-like systems, but no full Debian acceptance test has been completed.
| Other Linux distributions | any | **Not claimed** | Automatic bootstrap rejects systems that are not Ubuntu, Debian, or Debian-like.
| macOS | any | **Not claimed** | No supported bootstrap or acceptance test.
| Windows | any | **Not claimed** | No supported bootstrap or acceptance test.

## Runtime requirements

- Node.js `>=20` is required.
- When Node.js is missing or incompatible, the bootstrap defaults to installing Node.js major `24`; `WARROOM_NODE_MAJOR` can override that install major.
- npm is required.
- The automatic bootstrap requires an Ubuntu/Debian-family Linux environment.
- CPU architectures accepted by the bootstrap are `x86_64`/`amd64` and `aarch64`/`arm64`.

## Current validation scope

The clean Ubuntu 24.04.5 x86_64 VM acceptance test covered bootstrap, installation, setup, and `warroom doctor-install` with 31 PASS / 0 WARN / 0 FAIL. Secure MCP Tunnel connectivity was not validated in that VM test because dummy tunnel credentials were used.

The public installer acceptance test covered the real HTTPS installer endpoint on a fresh Ubuntu 24.04 x86_64 container, including first install and repeat-install/idempotency. Secure MCP Tunnel connectivity was not part of that public installer test.

Minimum supported distribution versions beyond the validated Ubuntu 24.04.x environment have not been finalized.
