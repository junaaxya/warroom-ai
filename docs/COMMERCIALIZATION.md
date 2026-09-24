# Commercialization Notes

This section is product strategy, not legal advice.

## Current best-fit distribution model

The current architecture fits a self-hosted/private product:

```text
War Room software
+ installer
+ documentation
+ customer-owned OpenAI/ChatGPT workspace
+ customer-owned Secure MCP Tunnel
```

OpenAI documents Secure MCP Tunnel as private MCP connectivity and explicitly distinguishes it from public plugin distribution.

## ChatGPT custom MCP availability

As of 2026-09-24, OpenAI documentation says full custom MCP support including write/modify actions is available for ChatGPT Business and Enterprise/Edu on the web, while Pro custom MCP access is limited to read/fetch permissions in developer mode. This can change; re-check before every release.

Reference:

https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## Before selling

Complete at least:

- clean Ubuntu VM install test
- compatibility matrix
- automated smoke tests
- license selection and legal review
- third-party notices
- support/update policy
- release packaging
- backup/restore guidance
- security limitations
- sanitized screenshots and examples

Do not ship developer-specific paths, session IDs, tunnel IDs, runtime keys, or customer/project-specific policies.
