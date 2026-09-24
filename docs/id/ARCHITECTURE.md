# Arsitektur

[Bahasa Inggris](../ARCHITECTURE.md) | **Bahasa Indonesia**

## Komponen

### Launcher

CLI `warroom` menangani alias project, canonical path, identitas project, state, proses runtime, onboarding, health checks, serta UX Cockpit/attach.

### Project state

State per-project disimpan di:

```text
~/.warroom/projects/<project_id>.json
```

### Active project

Supervisor global mengikuti:

```text
~/.warroom/active-project.json
```

### Persistent handoff

```text
~/.warroom/handoffs/<project_id>.json
```

### Frontend / Backend

Setiap division memiliki proses OpenCode, server port, pinned session, context, dan identitas `WARROOM_DIVISION` sendiri.

### Guard

Plugin OpenCode global menerapkan ownership policy yang spesifik untuk project.

### Bridge

Bridge per-project menangani status, messaging Supervisor, pengambilan pesan division, dan koordinasi shared path.

### Division MCP

OpenCode mendaftarkan MCP lokal War Room yang menunjuk ke `mcp.js` yang terpasang.

### Supervisor MCP

Supervisor MCP yang menghadap ke ChatGPT bekerja terhadap active project dan mengekspos tools untuk project/status/delegation/handoff/onboarding.

### Secure MCP Tunnel

`tunnel-client` menyediakan konektivitas private outbound-only antara Supervisor MCP lokal dan produk OpenAI yang didukung.

## Koordinasi shared path

Lifecycle saat ini:

```text
pending
→ approved
→ reserved
→ consumed
```

Reservation juga dapat expired.

## Mengapa dua proses OpenCode?

Dua proses independen memberikan identitas ownership yang lebih jelas, context session terpisah, concurrency, dan failure isolation. Cockpit hanya merupakan layer view/client.
