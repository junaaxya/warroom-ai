# Security Model

## Write enforcement

Current path evaluation order:

```text
protected.paths
→ division deny_write
→ shared paths requiring coordination
→ division-owned write paths
→ default deny
```

Common shell mutation patterns are also blocked for War Room divisions so source changes are routed through policy-aware editing tools.

## Not an OS sandbox

War Room is workflow enforcement, not an operating-system sandbox.

Do not claim that it can contain malicious native programs, hostile users, compromised plugins, or arbitrary processes with normal filesystem access.

## Read access

Write protection does not imply read isolation. If project policy grants broad read access, protected files can still be readable.

For stronger secret isolation, keep secrets outside agent-visible worktrees or add a dedicated read-deny model in a future release.

## Secrets

Do not commit runtime API keys, tunnel credentials, database passwords, production secrets, or private keys.

Recommended permissions:

```bash
chmod 600 ~/.config/warroom/config.json
chmod 600 /path/to/runtime-key
```

## Secure MCP Tunnel

OpenAI documents Secure MCP Tunnel as a way to connect private/local MCP servers to supported OpenAI products over outbound HTTPS without opening inbound public ports.

Reference:

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
