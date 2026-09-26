# Checklist Release

[Bahasa Inggris](../RELEASE-CHECKLIST.md) | **Bahasa Indonesia**

## Source hygiene

- [ ] Tidak ada personal home-directory paths
- [ ] Tidak ada project-specific paths atau names
- [ ] Tidak ada OpenCode session IDs
- [ ] Tidak ada tunnel IDs asli
- [ ] Tidak ada runtime API keys
- [ ] Tidak ada customer credentials
- [ ] Tidak ada `node_modules`
- [ ] VERSION benar
- [ ] CHANGELOG sudah diperbarui

## Validation

- [ ] `bash -n bin/warroom`
- [ ] `bash -n scripts/bootstrap-ubuntu.sh`
- [ ] `bash -n scripts/install.sh`
- [ ] `bash -n scripts/install-warroom.sh`
- [ ] `bash -n scripts/package-release.sh`
- [ ] `bash -n scripts/upload-release.sh`
- [ ] `bash tests/test-bootstrap-ubuntu-check.sh`
- [ ] `bash tests/test-standalone-installer.sh`
- [ ] `bash tests/test-public-distribution-installer.sh`
- [ ] `bash -n scripts/uninstall.sh`
- [ ] `bash -n scripts/upgrade.sh`
- [ ] Node syntax checks lulus
- [ ] Fresh install lulus
- [ ] `warroom setup` lulus
- [ ] `warroom doctor-install` tidak memiliki failure
- [ ] Uninstall mempertahankan config/state
- [ ] Upgrade berhasil
- [ ] Forced post-activation failure melakukan rollback
- [ ] Project runtime doctor lulus

## Fresh machine

- [ ] Fresh Ubuntu VM
- [ ] Dependency installation terdokumentasi
- [ ] OpenCode installation terdokumentasi
- [ ] tunnel-client setup terdokumentasi
- [ ] ChatGPT Supervisor setup terdokumentasi
- [ ] Project onboarding diuji
- [ ] Cockpit diuji
- [ ] Reboot/resume diuji

## Alur release

Release versioned yang sudah dipublikasikan bersifat immutable. Jangan overwrite versi yang sudah dipublikasikan; bump `VERSION` dan buat release baru.

1. Update `VERSION` dan `CHANGELOG`, lalu commit semua perubahan yang memang akan masuk release.
2. Jalankan checklist validasi di atas dan pastikan working tree bersih.
3. Build release dari Git `HEAD` yang tepat:

   ```bash
   bash scripts/package-release.sh
   ```

4. Periksa `dist/latest.json` dan verifikasi archive/checksum yang dihasilkan.
5. Jalankan preflight upload staging lokal:

   ```bash
   bash scripts/upload-release.sh --check
   ```

6. Upload hanya ke private staging directory:

   ```bash
   WARROOM_RELEASE_UPLOAD_TARGET='user@host' \
   WARROOM_RELEASE_STAGING_ROOT='/private/staging/path' \
   bash scripts/upload-release.sh
   ```

   Upload script tidak boleh menulis ke public web root dan akan menolak overwrite staging directory untuk versi yang sudah ada.

7. Di release server, verifikasi ulang manifest, version, commit metadata, filenames, dan SHA256 sebelum promotion.
8. Publish versioned archive/checksum terlebih dahulu. Update public installer bila diperlukan, dan publish `latest.json` paling akhir agar manifest tidak pernah menunjuk ke artifact yang belum tersedia.
9. Jalankan public release smoke test:

   ```bash
   bash tests/test-public-release.sh
   ```

10. Jalankan fresh-machine/public-installer acceptance test jika compatibility atau perilaku installation berubah.

## Commercial release

- [ ] Final license dipilih
- [ ] Third-party license review
- [ ] Security limitations direview
- [ ] Support policy ditulis
- [ ] Upgrade policy ditulis
- [ ] Minimum supported versions dipublikasikan
- [ ] Pricing/edition terms ditentukan
