# Kompatibilitas

[Bahasa Inggris](../COMPATIBILITY.md) | **Bahasa Indonesia**

War Room AI saat ini divalidasi pada Ubuntu 24.04.x x86_64. Automatic bootstrap memiliki jalur eksplisit untuk keluarga Ubuntu/Debian dan arsitektur x86_64/arm64, tetapi code path yang sudah diimplementasikan tidak sama dengan platform yang sudah lulus acceptance test.

## Definisi status

- **Validated** — sudah diuji melalui acceptance test yang mencakup flow yang disebutkan.
- **Implemented, not acceptance-tested** — bootstrap memiliki code path eksplisit untuk platform tersebut, tetapi platform itu belum menjalani acceptance test yang sama.
- **Not claimed** — War Room saat ini tidak mengklaim kompatibilitas untuk platform tersebut.

## Matriks platform

| Platform | Arsitektur | Status | Bukti |
| --- | --- | --- | --- |
| Ubuntu 24.04.5 | x86_64 / amd64 | **Validated** | Clean VM bootstrap, installation, setup, dan `warroom doctor-install` lulus; public HTTPS installer fresh-install dan repeat-install/idempotency juga lulus pada Ubuntu 24.04 x86_64.
| Ubuntu / keluarga Debian | arm64 / aarch64 | **Implemented, not acceptance-tested** | Bootstrap menerima `arm64`/`aarch64` dan memilih build tunnel-client arm64, tetapi full acceptance test belum dilakukan.
| Keluarga Debian | x86_64 / amd64 | **Implemented, not acceptance-tested** | Bootstrap menerima Debian dan sistem Debian-like, tetapi full Debian acceptance test belum dilakukan.
| Distribusi Linux lain | semua | **Not claimed** | Automatic bootstrap menolak sistem yang bukan Ubuntu, Debian, atau Debian-like.
| macOS | semua | **Not claimed** | Belum ada bootstrap yang didukung atau acceptance test.
| Windows | semua | **Not claimed** | Belum ada bootstrap yang didukung atau acceptance test.

## Kebutuhan runtime

- Node.js `>=20` diperlukan.
- Jika Node.js tidak ada atau incompatible, bootstrap secara default menginstal Node.js major `24`; `WARROOM_NODE_MAJOR` dapat mengganti major yang akan diinstal.
- npm diperlukan.
- Automatic bootstrap membutuhkan environment Linux keluarga Ubuntu/Debian.
- Arsitektur CPU yang diterima bootstrap adalah `x86_64`/`amd64` dan `aarch64`/`arm64`.

## Cakupan validasi saat ini

Acceptance test pada Ubuntu 24.04.5 x86_64 VM yang bersih mencakup bootstrap, installation, setup, dan `warroom doctor-install` dengan hasil 31 PASS / 0 WARN / 0 FAIL. Konektivitas Secure MCP Tunnel tidak divalidasi pada test VM tersebut karena menggunakan credential tunnel dummy.

Acceptance test public installer mencakup endpoint HTTPS publik yang sebenarnya pada container Ubuntu 24.04 x86_64 yang fresh, termasuk first install dan repeat-install/idempotency. Konektivitas Secure MCP Tunnel bukan bagian dari public installer test tersebut.

Minimum supported distribution versions selain environment Ubuntu 24.04.x yang sudah divalidasi belum difinalkan.
