# War Room AI

[Bahasa Inggris](README.md) | **Bahasa Indonesia**

War Room AI adalah sistem orkestrasi engineering multi-agent lokal untuk ChatGPT + OpenCode.

War Room AI memberikan satu ChatGPT Supervisor cara yang terkontrol untuk mengoordinasikan dua divisi engineering lokal yang independen:

- **Frontend**
- **Backend**

Setiap divisi memiliki proses OpenCode, pinned session, port lokal, context, dan identitas write-policy sendiri. Cockpit opsional menampilkan kedua divisi secara berdampingan tanpa menggabungkan runtime mereka.

**Versi saat ini:** `0.1.0-alpha.1`

> Status Alpha: installation, setup, uninstall, upgrade, rollback, state preservation, dan installation health checks sudah divalidasi di sandbox lokal yang terisolasi. Acceptance test pada Ubuntu VM yang benar-benar bersih masih diperlukan sebelum production release.

## Arsitektur

```text
Anda
 │
 ▼
ChatGPT + aplikasi War Room Supervisor
 │
 ▼
OpenAI Secure MCP Tunnel
 │
 ▼
Local Supervisor MCP
 │
 ▼
Project Bridge
 ├──────────────────────┬──────────────────────┐
 ▼                      ▼                      │
Frontend OpenCode       Backend OpenCode       │
session terpisah        session terpisah       │
guard identity terpisah guard identity terpisah│
 └──────────── local agent / OMO tooling ──────┘
```

## Instalasi cepat

```bash
bash scripts/install.sh
warroom setup
warroom doctor-install
```

Layout instalasi default:

```text
~/.local/share/warroom/
├── bin/warroom
├── plugins/warroom-guard.js
├── warroom-bridge/
│   ├── bridge.cjs
│   ├── mcp.js
│   ├── supervisor-mcp.js
│   ├── package.json
│   └── package-lock.json
└── VERSION
```

Launcher:

```text
~/.local/bin/warroom
```

Instalasi yang sehat saat ini melaporkan:

```text
PASS : 31
WARN : 0
FAIL : 0
```

## Penggunaan harian

Setelah boot:

```bash
cd /path/to/project
warroom up .
warroom doctor .
warroom cockpit .
```

Runtime project yang sehat saat ini melaporkan:

```text
PASS : 22
WARN : 0
FAIL : 0
```

Keluar dari Cockpit tanpa menghentikan runtime:

```text
Ctrl+b, lalu d
```

Hentikan project aktif:

```bash
warroom down .
```

## Project pertama

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

Lalu gunakan ChatGPT Supervisor untuk melakukan inspeksi read-only, mengusulkan ownership policy yang ketat, menunggu persetujuan manusia, membuat onboarding, menjalankan project, lalu menjalankan project doctor.

Command onboarding tingkat rendah:

```bash
warroom onboard <alias> <policy-json-file>
```

Untuk penggunaan normal, sebaiknya gunakan onboarding yang dibantu Supervisor.

## Cakupan keamanan

War Room saat ini memberikan **workflow-level enforcement**, bukan operating-system sandbox.

Guard mengontrol workflow editing War Room yang normal dan memblokir pola mutasi shell yang umum, tetapi tidak dirancang untuk menahan program native berbahaya, hostile local users, compromised plugins, atau proses dengan akses filesystem tanpa pembatasan.

Read access dan write access adalah dua hal yang berbeda. Path yang dilindungi dari write masih dapat dibaca jika project policy memberikan read access yang luas.

Lihat [Keamanan](docs/id/SECURITY.md).

## Kompatibilitas OpenAI

War Room menggunakan OpenAI Secure MCP Tunnel untuk menghubungkan Supervisor MCP private/local tanpa mengeksposnya langsung ke internet publik. OpenAI mendokumentasikan Secure MCP Tunnel sebagai konektivitas MCP private dan bukan sebagai mekanisme distribusi plugin publik.

Untuk custom MCP apps di ChatGPT, ketersediaan plan dan workspace dapat berubah. Periksa dokumentasi OpenAI terbaru sebelum merilis atau menjual sebuah release.

Referensi resmi:

- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## Dokumentasi

- [Instalasi](docs/id/INSTALLATION.md)
- [Quick Start](docs/id/QUICKSTART.md)
- [Penggunaan Harian](docs/id/DAILY-USAGE.md)
- [Project Onboarding](docs/id/PROJECT-ONBOARDING.md)
- [Supervisor Protocol](docs/id/SUPERVISOR-PROTOCOL.md)
- [Command Reference](docs/id/COMMAND-REFERENCE.md)
- [Arsitektur](docs/id/ARCHITECTURE.md)
- [Keamanan](docs/id/SECURITY.md)
- [Troubleshooting](docs/id/TROUBLESHOOTING.md)
- [Komersialisasi](docs/id/COMMERCIALIZATION.md)
- [Release Checklist](docs/id/RELEASE-CHECKLIST.md)

## Upgrade

```bash
bash scripts/upgrade.sh
```

Upgrade membangun candidate di staging, menjalankan `npm ci`, memvalidasi syntax/dependencies, mengaktifkan candidate, memperbarui integration files, lalu menjalankan final validation. Kegagalan setelah activation akan memicu rollback ke program files, konfigurasi OpenCode, dan guard sebelumnya.

Konfigurasi user dan state `~/.warroom` tetap dipertahankan.

## Uninstall

```bash
bash scripts/uninstall.sh
```

Secara default, uninstall menghapus program files, launcher symlink, installed guard, dan registrasi War Room MCP, sambil tetap mempertahankan:

```text
~/.config/warroom/
~/.warroom/
```

## Lisensi

Belum ada public software license final yang dipilih. Jangan membuat repository menjadi public atau memasarkan hak redistribusi sebelum model lisensi komersial difinalkan.
