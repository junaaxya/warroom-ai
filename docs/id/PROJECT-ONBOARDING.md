# Onboarding Project

[Bahasa Inggris](../PROJECT-ONBOARDING.md) | **Bahasa Indonesia**

Onboarding mengubah repository yang sudah terdaftar menjadi project War Room dengan ownership Frontend/Backend yang eksplisit, shared paths, protected paths, port dinamis, dan pinned OpenCode sessions.

## 1. Daftarkan alias

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

## 2. Inspeksi read-only

Minta Supervisor:

```text
Inspeksi alias `myapp` untuk onboarding War Room.
Jangan mengubah apa pun.
Baca struktur project dan aturan repository yang relevan.
Usulkan ownership berbasis path yang ketat, shared paths, dan protected paths.
Tunggu persetujuan saya.
```

Tool Supervisor:

```text
warroom_onboard_inspect
```

## 3. Model policy

Setiap division memiliki ownership rules seperti:

```json
{
  "write": [],
  "read": [],
  "deny_write": []
}
```

Shared policy mencakup shared paths, coordination policy, dan reservation TTL. Protected paths adalah path yang selalu menolak write.

Prioritas guard saat ini:

```text
protected
→ deny_write
→ shared coordination
→ owned write
→ default deny
```

## 4. Persetujuan manusia

Review policy yang diusulkan dengan teliti, terutama:

- path khusus Frontend
- path khusus Backend
- path campuran/shared
- generated files
- secrets
- governance docs
- migration history
- test ownership

## 5. Buat onboarding

Setelah persetujuan eksplisit, Supervisor memanggil:

```text
warroom_onboard_create
```

Tool ini asynchronous dan idempotent. Pemanggilan pertama dapat melaporkan `running`; ulangi pemanggilan yang sama dengan policy yang sudah disetujui untuk memeriksa completion.

Padanan CLI tingkat rendah:

```bash
warroom onboard <alias> <policy-json-file>
```

## 6. Jalankan dan validasi

```bash
warroom up myapp
warroom doctor myapp
```

Lalu verifikasi dari ChatGPT:

```text
Panggil warroom_active_project dan laporkan hasilnya saja.
```
