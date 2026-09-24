# Troubleshooting

[Bahasa Inggris](../TROUBLESHOOTING.md) | **Bahasa Indonesia**

## Mulai dari doctor yang tepat

Masalah instalasi:

```bash
warroom doctor-install
```

Masalah runtime project:

```bash
warroom doctor .
```

## Cockpit tidak dapat attach

Pastikan runtime sudah aktif:

```bash
warroom up .
warroom status .
```

Cockpit melakukan attach ke OpenCode server yang sudah berjalan; Cockpit tidak menjalankan duplicate division servers.

## ChatGPT app menampilkan tools lama

Validasi Supervisor MCP lokal terlebih dahulu. Supervisor v2 saat ini mengekspos 14 tools.

Jika MCP lokal sudah benar tetapi ChatGPT masih menampilkan action set lama, refresh/recreate custom app sesuai perilaku ChatGPT saat ini lalu uji dari chat baru yang eligible.

## `FORBIDDEN: This conversation does not support developer MCPs`

Perlakukan ini terlebih dahulu sebagai masalah capability pada conversation/surface ChatGPT. Pastikan install/runtime lokal sehat sebelum mengubah War Room.

## Onboarding terlalu lama

`warroom_onboard_create` bersifat asynchronous/idempotent. Pemanggilan pertama dapat mengembalikan `running`; ulangi request yang sama dan sudah disetujui untuk membaca final status, bukan memulai duplicate onboarding.

## Response Backend tiba-tiba kosong

Kirim diagnostic read-only minimal melalui Supervisor, lalu baca response Backend. Jika diagnostic token yang sama dikembalikan, channel sehat dan hasil kosong sebelumnya kemungkinan terkait session/timing behavior.

## Guard memblokir mutasi shell

Ini disengaja. Gunakan policy-aware edit/write/apply-patch tooling, bukan mutasi shell, agar ownership dan shared coordination dapat ditegakkan.
