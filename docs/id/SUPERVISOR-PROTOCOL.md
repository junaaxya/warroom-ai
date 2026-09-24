# Supervisor Operating Protocol v1

[Bahasa Inggris](../SUPERVISOR-PROTOCOL.md) | **Bahasa Indonesia**

Lifecycle wajib:

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

## Inspect

Gunakan project context, live status, active project, persistent handoff, dan division messages yang relevan.

Tools yang berguna:

```text
warroom_active_project
warroom_project_context
warroom_handoff
warroom_status
warroom_resume
```

## Plan

Identifikasi pekerjaan Frontend, pekerjaan Backend, shared paths, protected paths, langkah verification, dan coordination points.

## Delegate

Gunakan tools yang spesifik untuk division:

```text
warroom_send_frontend
warroom_send_backend
```

Gunakan `warroom_broadcast_plan` hanya jika kedua division benar-benar membutuhkan plan/context yang sama.

## Wait/read

Delivery bukan berarti completion. Baca response kedua division:

```text
warroom_read_frontend
warroom_read_backend
```

## Review

Periksa bahwa pekerjaan yang diminta sudah lengkap, ownership boundaries dipatuhi, project rules diikuti, perubahan shared-path sudah dikoordinasikan, dan tidak ada perubahan yang tidak berkaitan.

## Verify

Verification harus sesuai dengan task dan dapat mencakup lint, typecheck, tests, build, HTTP checks, migrations, atau manual/browser checks.

Jangan pernah melaporkan sebuah check yang sebenarnya tidak dijalankan.

## Correction loop

Jika ada bagian yang belum lengkap:

1. identifikasi gap yang tepat
2. kirim satu correction yang fokus
3. baca response yang diperbarui
4. verify lagi

## Final report dan handoff

Laporkan perubahan faktual, verification, open issues, dan pekerjaan yang tidak dilakukan. Update field handoff seperti current goal, status, completed work, decisions, verification, open issues, dan next action.
