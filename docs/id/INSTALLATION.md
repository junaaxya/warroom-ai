# Instalasi

[Bahasa Inggris](../INSTALLATION.md) | **Bahasa Indonesia**

## 1. Platform target saat ini

War Room saat ini dikembangkan dan divalidasi pada environment bergaya Linux/Ubuntu.

Command yang diperlukan:

```text
bash
python3
node
npm
tmux
curl
ss
opencode
```

War Room juga menggunakan OpenAI `tunnel-client` untuk Supervisor MCP yang terhubung ke ChatGPT.

Versi minimum yang didukung belum difinalkan; compatibility pass pada Ubuntu VM yang bersih masih diperlukan sebelum production release.

## 2. Instalasi dari source

Dari root repository:

```bash
bash scripts/install.sh
```

Root instalasi default:

```text
~/.local/share/warroom
```

Symlink launcher default:

```text
~/.local/bin/warroom
```

Installer akan:

- memvalidasi source files yang diperlukan
- membuat backup instalasi War Room yang sudah ada sebelum menggantinya
- menyalin launcher, Bridge, MCP servers, guard, dependency manifests, dan VERSION
- menjalankan `npm ci --omit=dev`
- memasang global OpenCode guard
- menggabungkan registrasi War Room MCP ke konfigurasi OpenCode
- membuat launcher symlink

## 3. Konfigurasi War Room

Jalankan:

```bash
warroom setup
```

Path konfigurasi default:

```text
~/.config/warroom/config.json
```

Contoh:

```json
{
  "supervisor": {
    "alias": "warroom-supervisor",
    "tunnel_profile": "warroom-supervisor-managed",
    "tunnel_id": "YOUR_TUNNEL_ID",
    "runtime_key_file": "/home/user/.config/tunnel-client/secrets/warroom-runtime-key"
  }
}
```

War Room menyimpan **path** menuju runtime key file, bukan isi runtime key.

Permission yang direkomendasikan:

```bash
chmod 600 ~/.config/warroom/config.json
chmod 600 /path/to/runtime-key
```

## 4. Secure MCP Tunnel

Gunakan dokumentasi OpenAI Secure MCP Tunnel terbaru untuk membuat/mengonfigurasi tunnel dan runtime credentials milik customer sendiri:

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

Command MCP lokal untuk Supervisor adalah `supervisor-mcp.js` yang sudah terpasang di bawah root instalasi War Room.

Secure MCP Tunnel ditujukan untuk konektivitas MCP private dan tidak menyediakan distribusi plugin publik dengan sendirinya.

## 5. Membuat aplikasi ChatGPT

Gunakan dokumentasi ChatGPT Developer Mode / custom MCP app terbaru:

https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

Supervisor MCP saat ini mengekspos 14 tools:

```text
warroom_active_project
warroom_broadcast_plan
warroom_coordination_list
warroom_handoff
warroom_handoff_update
warroom_onboard_create
warroom_onboard_inspect
warroom_project_context
warroom_read_backend
warroom_read_frontend
warroom_resume
warroom_send_backend
warroom_send_frontend
warroom_status
```

## 6. Validasi instalasi

```bash
warroom doctor-install
```

Target sehat saat ini:

```text
PASS : 31
WARN : 0
FAIL : 0
```

Pemeriksaan ini mencakup command dependencies, product files, syntax, Node dependencies, konfigurasi War Room, permission secret-file, tunnel client, installed guard, dan registrasi OpenCode MCP.
