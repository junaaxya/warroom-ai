# Handbook War Room

[Bahasa Inggris](../HANDBOOK.md) | **Bahasa Indonesia**

Ini adalah manual utama operator untuk menjalankan War Room setelah instalasi.

**Release yang didokumentasikan saat ini:** `0.1.0-alpha.1`

Untuk setup pertama kali, baca [Instalasi](INSTALLATION.md), [Quick Start](QUICKSTART.md), dan [Project Onboarding](PROJECT-ONBOARDING.md).

Alur setup awal:

```bash
bash scripts/install.sh
warroom setup
warroom doctor-install
```

Setelah sebuah project selesai di-onboard, handbook ini menjelaskan operasi War Room sehari-hari.

## 1. Mental model

War Room memiliki tiga layer utama yang berinteraksi dengan manusia:

```text
ChatGPT Supervisor = merencanakan, mendelegasikan, mereview, memverifikasi
Frontend division   = session OpenCode independen untuk pekerjaan milik Frontend
Backend division    = session OpenCode independen untuk pekerjaan milik Backend
```

Dalam penggunaan normal, manusia berkomunikasi dengan Supervisor, bukan berbicara ke kedua divisi secara terpisah.

Supervisor mengirim pekerjaan melalui Bridge. Kedua divisi mengembalikan hasil. Supervisor mereview hasil tersebut, meminta koreksi jika diperlukan, memverifikasi kondisi akhir, lalu memperbarui persistent handoff.

### Mengapa ada dua divisi?

Setiap divisi memiliki:

- proses OpenCode sendiri
- local port sendiri
- pinned session ID sendiri
- conversation context sendiri
- identity `WARROOM_DIVISION` sendiri
- write ownership sendiri

Pemisahan ini menjaga Frontend dan Backend tetap terisolasi secara logis sambil memungkinkan keduanya bekerja secara paralel.

### Apa yang berubah ketika menggunakan Cockpit?

Tidak ada perubahan pada arsitektur. Cockpit hanya menyediakan tampilan terminal yang lebih nyaman:

```text
┌────────────────────────────┬────────────────────────────┐
│ FRONTEND OpenCode          │ BACKEND OpenCode           │
│ session independen         │ session independen         │
└────────────────────────────┴────────────────────────────┘
```

## 2. Workflow harian

Setelah boot:

```bash
cd /path/to/project
warroom up .
warroom doctor .
warroom cockpit .
```

`warroom up` menandai project sebagai aktif dan menjalankan runtime component yang belum aktif.

`warroom doctor` memverifikasi state, ports, reachability, pinned sessions, policy, bridge, MCP, guard, tunnel, Supervisor process, dan registrasi OpenCode MCP.

`warroom cockpit` memasang dua OpenCode client ke server Frontend dan Backend yang sudah berjalan.

### Kontrol tmux

Berpindah pane:

```text
Ctrl+b, lalu tombol panah Left/Right
```

Detach:

```text
Ctrl+b, lalu d
```

Detach tidak menghentikan Frontend, Backend, Bridge, atau Supervisor.

## 3. Workflow ChatGPT

Di ChatGPT, pilih atau mention aplikasi War Room Supervisor untuk message yang membutuhkan tool call.

Konfirmasi project aktif:

```text
Call warroom_active_project and report the result only.
```

Resume sebuah project:

```text
Call warroom_resume and summarize the current goal, completed work,
open issues, verification, decisions, and next action.
```

Memberikan task nyata:

```text
Implement <GOAL> in the active project using Supervisor Operating Protocol v1.

Inspect project context and handoff first.
Create the smallest complete implementation plan.
Delegate by ownership.
Coordinate shared paths before semantic changes.
Read and review both division responses.
Run appropriate verification.
Send focused correction rounds if necessary.
Do not claim checks that were not run.
Update the persistent handoff at the end.
Return a factual final report.
```

Prompt di atas sengaja dipertahankan dalam Bahasa Inggris agar selaras dengan nama tool dan terminology runtime yang digunakan Supervisor.

## 4. Supervisor Operating Protocol v1

Lifecycle yang wajib diikuti:

```text
inspect
→ plan
→ delegate
→ wait/read
→ review
→ verify
→ correction loop jika diperlukan
→ final report
→ handoff update
```

### Inspect

Baca active project, context, handoff, status, dan prior message yang relevan.

Tool yang berguna:

```text
warroom_active_project
warroom_project_context
warroom_handoff
warroom_status
warroom_resume
```

### Plan

Identifikasi:

- pekerjaan Frontend
- pekerjaan Backend
- shared paths
- protected paths
- verification steps
- coordination points

### Delegate

Gunakan instruction terpisah jika tanggung jawab berbeda:

```text
warroom_send_frontend
warroom_send_backend
```

Gunakan `warroom_broadcast_plan` hanya ketika kedua divisi benar-benar membutuhkan plan/context yang sama.

### Wait/read

Task yang sudah terkirim belum berarti selesai. Baca response dari kedua divisi:

```text
warroom_read_frontend
warroom_read_backend
```

### Review

Periksa bahwa:

- pekerjaan yang diminta benar-benar selesai
- ownership rules dipatuhi
- tidak terjadi refactor yang tidak berkaitan
- project rules dipatuhi
- claim didukung evidence
- perubahan shared path mengikuti coordination policy

### Verify

Jenis verifikasi bergantung pada project dan task, misalnya:

```text
lint
typecheck
tests
build
HTTP checks
migration checks
manual/browser verification
```

Jangan pernah mengklaim sebuah check sudah dijalankan jika check tersebut sebenarnya belum dijalankan.

### Correction loop

Jika hasil belum lengkap:

1. identifikasi gap yang tepat
2. kirim satu correction yang fokus
3. baca response terbaru
4. lakukan verifikasi lagi

### Handoff

Handoff sebaiknya menyimpan:

```text
current_goal
status
completed
open_issues
decisions
verification
next_action
```

## 5. Project registry dan switching

Daftarkan alias:

```bash
warroom add myapp /absolute/path/to/myapp
```

Lihat daftar project:

```bash
warroom projects
```

Jalankan atau pindah ke project yang sudah di-onboard:

```bash
warroom up myapp
warroom doctor myapp
```

Tampilkan active project saat ini:

```bash
warroom active
```

Secara eksplisit tandai sebuah project yang sudah di-onboard sebagai aktif:

```bash
warroom use myapp
```

Untuk workflow sederhana saat berpindah project, lebih baik gunakan `warroom up <alias>` karena command tersebut sekaligus menjalankan runtime component yang belum aktif.

## 6. Project onboarding

Sebuah project harus melalui onboarding sebelum digunakan secara normal.

### Register

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

Sebelum onboarding, project seharusnya tampil sebagai `NEEDS ONBOARDING`.

### Inspect melalui ChatGPT

```text
Inspect alias `myapp` for War Room onboarding.
Do not modify anything.
Read project structure and relevant repository rules.
Propose strict path-based ownership, shared paths, and protected paths.
Wait for my approval.
```

Supervisor menggunakan `warroom_onboard_inspect` dan tidak melakukan perubahan pada project.

### Policy model

Setiap divisi memiliki:

```json
{
  "write": [],
  "read": [],
  "deny_write": []
}
```

Project juga memiliki:

```json
{
  "shared": {
    "paths": [],
    "policy": "coordinate_before_semantic_change",
    "reservation_ttl_ms": 600000
  },
  "protected": {
    "paths": []
  }
}
```

Prioritas keputusan write:

```text
1. protected.paths  → deny
2. deny_write       → deny
3. shared.paths     → coordination required
4. division write   → allow
5. semua lainnya    → default deny
```

### Persetujuan manusia

Review policy yang diusulkan secara tepat. Beri perhatian khusus pada:

- governance documents
- secrets
- generated code
- migrations
- root configuration files
- tests
- cross-cutting feature modules

### Membuat onboarding

Setelah ada persetujuan eksplisit, Supervisor memanggil `warroom_onboard_create`.

Tool saat ini bersifat asynchronous dan idempotent.

Call pertama dapat mengembalikan:

```json
{
  "status": "running",
  "started": true,
  "alias": "myapp",
  "pid": 12345
}
```

Panggil tool yang sama lagi dengan approved policy yang sama untuk mengecek status.

Completion kurang lebih berbentuk:

```json
{
  "status": "completed",
  "created": true,
  "alias": "myapp",
  "project_id": "myapp-...",
  "state_file": "/home/user/.warroom/projects/myapp-....json",
  "frontend": {"port": 4200, "session": "ses_..."},
  "backend": {"port": 4201, "session": "ses_..."},
  "bridge": {"port": 4202},
  "stderr": null,
  "warning": null
}
```

Kemudian:

```bash
warroom up myapp
warroom doctor myapp
```

Terakhir, konfirmasi dari ChatGPT dengan `warroom_active_project`.

## 7. File yang disimpan War Room

Project state:

```text
~/.warroom/projects/<project_id>.json
```

Pointer active project:

```text
~/.warroom/active-project.json
```

Persistent handoff:

```text
~/.warroom/handoffs/<project_id>.json
```

Coordination store:

```text
~/.warroom/runtime/<project_id>-shared.json
```

Async onboarding jobs:

```text
~/.warroom/jobs/
```

## 8. Project identity dan ports

Format project ID:

```text
<sanitized-basename>-<canonical-path-hash>
```

Format ini mencegah collision antara project yang memiliki basename sama.

Project baru menerima free ports yang tidak sedang listening di host dan tidak sedang reserved di state War Room yang sudah ada.

## 9. Manual attach commands

Attach satu divisi:

```bash
warroom attach frontend .
warroom attach backend .
warroom attach bridge .
```

Command untuk menjalankan divisi secara langsung juga tersedia:

```bash
warroom frontend .
warroom backend .
warroom bridge .
```

Dalam operasi normal, prioritaskan pekerjaan yang digerakkan oleh Supervisor. Interaksi manual dengan pane paling cocok untuk debugging dan observasi.

## 10. Toolset Supervisor saat ini

Instalasi saat ini mengekspos 14 tools:

```text
warroom_status
warroom_project_context
warroom_send_frontend
warroom_send_backend
warroom_broadcast_plan
warroom_read_frontend
warroom_read_backend
warroom_coordination_list
warroom_active_project
warroom_handoff
warroom_handoff_update
warroom_resume
warroom_onboard_inspect
warroom_onboard_create
```

## 11. Shutdown

Detach Cockpit jika sedang terbuka:

```text
Ctrl+b, lalu d
```

Hentikan runtime project:

```bash
warroom down .
```

## 12. Aturan operator yang direkomendasikan

Jika `warroom doctor` tidak sehat, jangan mulai supervised task yang mengubah source sampai penyebab kegagalan dipahami.
