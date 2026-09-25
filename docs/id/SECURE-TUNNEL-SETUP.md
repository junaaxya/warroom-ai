# Setup Secure Tunnel

[English](../SECURE-TUNNEL-SETUP.md) | **Bahasa Indonesia**

Panduan ini menjelaskan apa yang harus disiapkan sebelum menjalankan `warroom setup`, dari mana mendapatkan Tunnel ID dan Runtime API key, cara menyimpan key dengan aman, dan bagaimana menghubungkan tunnel yang sama dari ChatGPT.

War Room menggunakan OpenAI Secure MCP Tunnel agar Supervisor MCP lokal tetap private tetapi dapat diakses dari produk OpenAI yang didukung. MCP server lokal tidak perlu membuka inbound port publik.

## 1. Yang perlu disiapkan

Sebelum menjalankan `warroom setup`, siapkan dua hal:

- **Tunnel ID** — identifier tunnel milik Anda di OpenAI Platform.
- **Runtime API key** — credential yang dipakai proses `tunnel-client` saat berjalan.

Keduanya berbeda. Jangan membuat nilai sendiri dan jangan memakai nilai dummy/testing untuk instalasi nyata.

Referensi resmi:

- Secure MCP Tunnel: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- Tunnel management: https://platform.openai.com/settings/organization/tunnels
- Runtime API keys: https://platform.openai.com/settings/organization/api-keys


## 2. Mendapatkan atau membuat Tunnel ID

Buka OpenAI Platform:

https://platform.openai.com/settings/organization/tunnels

Jika tunnel belum ada, buat tunnel baru. Jika sudah ada, buka tunnel yang akan digunakan War Room.

Untuk membuat atau mengubah tunnel, akun/operator membutuhkan permission:

- Tunnels Read
- Tunnels Manage

Jika operator yang sama juga akan menjalankan tunnel atau menghubungkannya ke ChatGPT, operator tersebut juga membutuhkan Tunnels Use.

Setelah tunnel dibuat, salin Tunnel ID yang diberikan oleh Platform.

Bentuknya kira-kira:

```text
tunnel_YOUR_TUNNEL_ID
```

Jangan mengetik atau membuat Tunnel ID sendiri.

Nilai inilah yang nanti dimasukkan ketika `warroom setup` menampilkan:

```text
Tunnel ID:
```

Jika tunnel akan digunakan dari ChatGPT, pastikan tunnel diasosiasikan dengan ChatGPT workspace yang benar.

Tunnel yang berada pada organisasi atau workspace berbeda dapat tidak muncul di pemilih tunnel ChatGPT.

## 3. Membuat Runtime API key

Buka:

https://platform.openai.com/settings/organization/api-keys

Buat Runtime API key baru.

Untuk penggunaan War Room, direkomendasikan memakai key Restricted dengan permission minimum:

- Tunnels Read
- Tunnels Use

Runtime API key digunakan oleh proses `tunnel-client` saat War Room berjalan.

Runtime API key berbeda dari Tunnel ID.

Jangan menggunakan Admin API key sebagai runtime key untuk daemon War Room yang berjalan terus.

Jangan commit, membagikan, atau menaruh Runtime API key langsung di dokumentasi maupun source code.

## 4. Simpan Runtime API key ke file lokal

War Room meminta **path file** yang berisi Runtime API key.

War Room tidak meminta Anda menempelkan isi key langsung ke `warroom setup`.

Buat direktori secret terlebih dahulu:

```bash
install -d -m 700 "$HOME/.config/tunnel-client/secrets"
```

Masukkan Runtime API key tanpa menampilkannya di terminal:

```bash
umask 077

read -rsp "Paste OpenAI tunnel Runtime API key: " WARROOM_RUNTIME_KEY
printf "\n"

printf "%s\n" "$WARROOM_RUNTIME_KEY" > "$HOME/.config/tunnel-client/secrets/warroom-runtime-key"

unset WARROOM_RUNTIME_KEY
```

Pastikan file hanya dapat dibaca oleh user tersebut:

```bash
chmod 600 "$HOME/.config/tunnel-client/secrets/warroom-runtime-key"
```

Verifikasi permission:

```bash
stat -c "%a %n" "$HOME/.config/tunnel-client/secrets/warroom-runtime-key"
```

Targetnya:

```text
600 /home/YOUR_USER/.config/tunnel-client/secrets/warroom-runtime-key
```

Jangan menjalankan `cat` terhadap file key hanya untuk mengecek isinya.

## 5. Jalankan `warroom setup`

Setelah Tunnel ID dan runtime key file siap, jalankan:

```bash
warroom setup
```

War Room akan menanyakan beberapa nilai berikut.

### Supervisor alias

```text
Supervisor alias [warroom-supervisor]:
```

Untuk instalasi normal, cukup tekan Enter untuk memakai default `warroom-supervisor`.

### Tunnel profile

```text
Tunnel profile [warroom-supervisor-managed]:
```

Untuk instalasi normal, cukup tekan Enter untuk memakai default `warroom-supervisor-managed`.

### Tunnel ID

```text
Tunnel ID:
```

Paste Tunnel ID asli yang sebelumnya Anda salin dari OpenAI Platform.

Contoh format:

```text
tunnel_YOUR_TUNNEL_ID
```

Jangan masukkan Runtime API key pada prompt ini.

### Runtime key file path

```text
Runtime key file path:
```

Masukkan **path menuju file secret**, BUKAN isi Runtime API key.

Contoh:

```text
/home/YOUR_USER/.config/tunnel-client/secrets/warroom-runtime-key
```

JANGAN paste API key langsung ke prompt `Runtime key file path`.

Setelah setup selesai, konfigurasi War Room disimpan di:

```text
~/.config/warroom/config.json
```

War Room hanya menyimpan **path** menuju runtime key file.

Isi Runtime API key tidak dibaca atau disalin ke `config.json` oleh proses `warroom setup`.

## 6. Verifikasi konfigurasi instalasi

Setelah `warroom setup` selesai, jalankan:

```bash
warroom doctor-install
```

Target instalasi yang siap secara lokal:

```text
PASS : 31
WARN : 0
FAIL : 0
```

`doctor-install` memeriksa dependency, file produk, syntax, konfigurasi War Room, permission secret file, tunnel-client, guard plugin, dan registrasi OpenCode MCP.

Penting: `doctor-install` yang lulus belum membuktikan Secure MCP Tunnel sudah benar-benar terkoneksi ke OpenAI.

## 7. Jalankan project dan verifikasi tunnel live

Setelah project sudah di-onboard ke War Room, jalankan:

```bash
warroom up /path/to/project
```

Kemudian periksa status:

```bash
warroom status /path/to/project
```

Dan jalankan pemeriksaan lengkap:

```bash
warroom doctor /path/to/project
```

Supervisor seharusnya mencapai kondisi READY dan healthy.

Jika Runtime API key salah, Tunnel ID salah, permission kurang, atau workspace association tidak sesuai, tunnel dapat gagal walaupun `warroom doctor-install` sudah lulus.

## 8. Hubungkan tunnel yang sama dari ChatGPT

Di ChatGPT, gunakan fitur custom MCP/developer-mode app yang tersedia untuk workspace Anda.

Saat memilih connection, gunakan **Tunnel**.

Pilih tunnel yang sama atau masukkan Tunnel ID yang sama dengan nilai yang dipakai pada `warroom setup`.

Operator yang menghubungkan tunnel dari ChatGPT membutuhkan:

- Tunnels Read
- Tunnels Use

Jika tunnel tidak muncul di ChatGPT, periksa:

- tunnel sudah diasosiasikan dengan ChatGPT workspace yang benar;
- operator ChatGPT memiliki Tunnels Read + Use;
- Tunnel ID yang digunakan benar;
- `tunnel-client` sedang berjalan dan healthy;
- Supervisor War Room sudah READY.

Dokumentasi ChatGPT developer mode:

https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## 9. Kesalahan yang sering terjadi

Jangan masukkan Runtime API key ke prompt `Tunnel ID`.

Jangan masukkan isi Runtime API key ke prompt `Runtime key file path`; masukkan path file secret.

Jangan menggunakan Admin API key sebagai credential runtime daemon.

Jangan memakai Tunnel ID atau runtime key dari contoh, testing, tutorial, atau mesin milik orang lain.

Jangan commit runtime key ke Git.

Jangan mempublikasikan file:

```text
~/.config/tunnel-client/secrets/warroom-runtime-key
```

Jika tunnel terlihat di OpenAI Platform tetapi tidak tersedia di ChatGPT, periksa workspace association dan permission Tunnels Read + Use terlebih dahulu.

