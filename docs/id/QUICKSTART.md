# Quick Start

[Bahasa Inggris](../QUICKSTART.md) | **Bahasa Indonesia**

## Project pertama

```bash
warroom add myapp /absolute/path/to/myapp
warroom projects
```

Lalu minta ChatGPT War Room Supervisor untuk menginspeksi `myapp`, mengusulkan policy untuk ownership/shared/protected path, dan menunggu persetujuan eksplisit sebelum membuat onboarding.

Setelah onboarding:

```bash
warroom up myapp
warroom doctor myapp
warroom cockpit myapp
```

## Startup harian

Dari dalam project yang sudah di-onboard:

```bash
warroom up .
warroom doctor .
warroom cockpit .
```

Keluar dari Cockpit tanpa menghentikan runtime:

```text
Ctrl+b, lalu d
```

Hentikan runtime:

```bash
warroom down .
```
