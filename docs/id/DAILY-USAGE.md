# Penggunaan Harian

[Bahasa Inggris](../DAILY-USAGE.md) | **Bahasa Indonesia**

## Pagi hari / setelah reboot

```bash
cd /path/to/project
warroom up .
warroom doctor .
warroom cockpit .
```

`warroom up` menjalankan komponen Bridge, Frontend, Backend, dan Supervisor tunnel yang belum aktif, lalu menandai project tersebut sebagai project aktif.

`warroom doctor` memeriksa runtime project, state, ownership policy, sessions, coordination store, syntax MCP/guard, registrasi OpenCode MCP, status Supervisor, dan health checks terkait.

Project yang sehat saat ini melaporkan:

```text
PASS : 22
WARN : 0
FAIL : 0
```

## Cockpit

```bash
warroom cockpit .
```

Cockpit menampilkan Frontend dan Backend secara berdampingan, tetapi setiap pane adalah OpenCode attach client yang terhubung ke server yang sudah berjalan dan pinned session yang terpisah.

Berpindah antar-pane:

```text
Ctrl+b, lalu Left/Right
```

Keluar dari Cockpit tanpa menghentikan runtime:

```text
Ctrl+b, lalu d
```

## Workflow ChatGPT

Workflow manusia yang normal adalah berbicara dengan Supervisor, bukan menduplikasi task secara manual ke kedua pane OpenCode.

Prompt task yang direkomendasikan:

```text
Implement <GOAL> in the active project using Supervisor Operating Protocol v1.
Inspect project context and handoff first.
Plan the smallest complete change.
Delegate by ownership.
Coordinate shared paths before semantic changes.
Read and review both division responses.
Run appropriate verification.
Perform focused correction rounds if needed.
Update the persistent handoff at the end.
Return a factual final report.
```

## Berpindah project

```bash
warroom projects
warroom up another-alias
warroom active
```

Anda dapat mengatur project aktif secara eksplisit dengan:

```bash
warroom use another-alias
```
