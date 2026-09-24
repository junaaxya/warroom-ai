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
- [ ] `bash -n scripts/install.sh`
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

## Commercial release

- [ ] Final license dipilih
- [ ] Third-party license review
- [ ] Security limitations direview
- [ ] Support policy ditulis
- [ ] Upgrade policy ditulis
- [ ] Minimum supported versions dipublikasikan
- [ ] Pricing/edition terms ditentukan
