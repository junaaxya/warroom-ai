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
- compatibility matrix
- automated smoke tests
- license selection dan legal review
- third-party notices
- support/update policy
- release packaging
- backup/restore guidance
- security limitations
- sanitized screenshots dan examples

Jangan mengirim developer-specific paths, session IDs, tunnel IDs, runtime keys, atau customer/project-specific policies.
