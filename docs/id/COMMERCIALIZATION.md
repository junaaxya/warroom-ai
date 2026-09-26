# Catatan Komersialisasi

[Bahasa Inggris](../COMMERCIALIZATION.md) | **Bahasa Indonesia**

Bagian ini membahas strategi produk, bukan nasihat hukum.

## Model distribusi yang paling sesuai saat ini

Arsitektur saat ini paling cocok dengan produk self-hosted/private:

```text
War Room software
+ installer
+ documentation
+ customer-owned OpenAI/ChatGPT workspace
+ customer-owned Secure MCP Tunnel
```

OpenAI mendokumentasikan Secure MCP Tunnel sebagai konektivitas MCP private dan secara eksplisit membedakannya dari distribusi plugin publik.

## Ketersediaan custom MCP di ChatGPT

Menurut dokumentasi sumber yang digunakan untuk release ini pada 2026-09-24, full custom MCP support termasuk write/modify actions tersedia untuk ChatGPT Business dan Enterprise/Edu di web, sementara akses custom MCP pada Pro dibatasi pada read/fetch permissions dalam developer mode. Hal ini dapat berubah; periksa kembali sebelum setiap release.

Referensi:

https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## Sebelum menjual

Selesaikan setidaknya:

- clean Ubuntu VM install test — selesai pada Ubuntu 24.04.5 x86_64 untuk bootstrap, installation, setup, dan `warroom doctor-install` (31 PASS / 0 WARN / 0 FAIL); konektivitas Secure MCP Tunnel belum divalidasi karena acceptance test menggunakan credential tunnel dummy
- public HTTPS installer acceptance — selesai pada container Ubuntu 24.04 x86_64 yang fresh untuk `0.1.0-alpha.1`; first install dan repeat-install/idempotency lulus melalui `curl -fsSL https://install.lab-ilkom.my.id | bash`; konektivitas Secure MCP Tunnel bukan bagian dari test ini
- compatibility matrix
- automated smoke tests
- license selection dan legal review
- third-party notices
- support/update policy
- release packaging — selesai dengan versioned `.tar.gz` yang reproducible, checksum SHA256, `latest.json`, standalone verification, dan distribusi HTTPS publik
- backup/restore guidance
- security limitations
- sanitized screenshots dan examples

Jangan mengirim developer-specific paths, session IDs, tunnel IDs, runtime keys, atau customer/project-specific policies.
