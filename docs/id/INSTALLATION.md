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

Versi minimum yang didukung belum difinalkan. Compatibility pass pada Ubuntu 24.04.5 x86_64 VM yang bersih untuk bootstrap, installation, setup, dan `warroom doctor-install` sudah lulus.

## 2. Instal War Room

### Direkomendasikan: standalone release installer

End user tidak perlu clone source repository War Room.

Release War Room terdiri dari:

- `install-warroom.sh` — standalone installer;
- artifact release `.tar.gz` dengan versi;
- file checksum `.sha256` yang sesuai.

Standalone installer akan mengunduh release, memverifikasi checksum SHA256, memvalidasi struktur archive, memasang dependency yang belum tersedia, lalu menginstal War Room.

Endpoint release publik sudah tersedia melalui HTTPS. Instal War Room dengan:

```bash
curl -fsSL https://install.lab-ilkom.my.id | bash
```

Installer otomatis membaca metadata release terbaru, mengunduh artifact versioned beserta checksum, memverifikasi SHA256, lalu menginstal War Room.

Untuk distribusi custom atau private, override URL lanjutan tetap tersedia melalui `WARROOM_RELEASE_BASE_URL`, `WARROOM_MANIFEST_URL`, `WARROOM_RELEASE_URL`, dan `WARROOM_CHECKSUM_URL`.

Setelah instalasi selesai, lanjutkan ke [Setup Secure Tunnel](SECURE-TUNNEL-SETUP.md).

### Instalasi source/developer

Maintainer repository dan developer dapat menginstal dari source checkout:

```bash
bash scripts/bootstrap-ubuntu.sh
```

Bootstrap melewati dependency yang sudah kompatibel dan memasang prerequisite yang belum ada atau tidak kompatibel sebelum menginstal War Room.

Untuk audit dependency tanpa mengubah mesin:

```bash
bash scripts/bootstrap-ubuntu.sh --check
```

Jika semua prerequisite sudah tersedia:

```bash
bash scripts/install.sh
```


## 3. Konfigurasi War Room

Sebelum menjalankan setup, ikuti panduan lengkap [Setup Secure Tunnel](SECURE-TUNNEL-SETUP.md) untuk membuat atau memilih Tunnel ID, membuat Runtime API key, dan menyimpan key ke file secret lokal.

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
    "tunnel_id": "tunnel_YOUR_TUNNEL_ID",
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

Untuk alur setup tunnel lengkap, termasuk:

- dari mana mendapatkan Tunnel ID;
- cara membuat Runtime API key;
- permission tunnel yang diperlukan;
- cara menyimpan runtime key dengan permission `600`;
- apa yang harus diisi pada setiap prompt `warroom setup`;
- cara memverifikasi tunnel yang benar-benar live;
- cara menghubungkan tunnel yang sama dari ChatGPT;

ikuti:

[Setup Secure Tunnel](SECURE-TUNNEL-SETUP.md)

Referensi resmi OpenAI:

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

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
