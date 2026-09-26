# Third-Party Notices

This document records third-party software used by or installed alongside War Room AI.

It does not grant a license to War Room AI itself and does not replace the license terms supplied by each upstream project.

## Distribution model

The current War Room release archive does not bundle `node_modules`, the OpenCode binary, or the OpenAI `tunnel-client` binary.

Runtime dependencies and external tools are obtained from their upstream distribution sources during installation.

## Locked runtime npm dependencies

These packages are locked by `warroom-bridge/package-lock.json` and installed with `npm ci --omit=dev`:

| Package | Locked version | License metadata |
| --- | ---: | --- |
| `@modelcontextprotocol/server` | `2.0.0` | MIT |
| `@modelcontextprotocol/core` | `2.0.0` | MIT |
| `zod` | `4.6.5` | MIT |

The package license values above are taken from the lockfile metadata used by this release.

These npm packages are downloaded during installation and are not included in the War Room release archive.

## Software installed from upstream

### OpenCode

- Version: resolved by the upstream installer at installation time; not pinned by the War Room release.
- Upstream project license metadata: MIT.
- War Room invokes the upstream OpenCode installer when OpenCode is missing.
- The OpenCode binary is not bundled in the War Room release archive.

### OpenAI tunnel-client

- Version: latest compatible upstream release resolved at installation time; not pinned by the War Room release.
- Upstream project license: Apache License 2.0.
- War Room downloads the upstream release artifact and verifies its published SHA256 before installation.
- The tunnel-client binary is not bundled in the War Room release archive.

## System and runtime prerequisites

War Room bootstrap may install operating-system packages and Node.js/npm when compatible versions are unavailable.

Those components are supplied by their respective upstream or Ubuntu/Debian package sources and remain subject to their own license terms. They are not bundled in the War Room release archive.

## War Room license status

War Room AI does not currently ship with a finalized project license. The runtime package metadata currently declares `UNLICENSED` and `private: true`.

The third-party license information in this document does not license War Room AI itself.

## Release maintenance

Before each commercial release:

- Re-audit license metadata when `warroom-bridge/package-lock.json` changes.
- Re-check upstream licensing when the OpenCode or tunnel-client installation source changes.
- If a future War Room artifact bundles third-party source or binaries, include all license, notice, attribution, and source obligations required by those components.

This inventory is informational and should be included in the project legal review before commercial distribution.
