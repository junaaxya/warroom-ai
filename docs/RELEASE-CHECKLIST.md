# Release Checklist

**English** | [Bahasa Indonesia](id/RELEASE-CHECKLIST.md)

## Source hygiene

- [ ] No personal home-directory paths
- [ ] No project-specific paths or names
- [ ] No OpenCode session IDs
- [ ] No real tunnel IDs
- [ ] No runtime API keys
- [ ] No customer credentials
- [ ] No `node_modules`
- [ ] VERSION correct
- [ ] CHANGELOG updated

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
- [ ] Node syntax checks pass
- [ ] Fresh install passes
- [ ] `warroom setup` passes
- [ ] `warroom doctor-install` has zero failures
- [ ] Uninstall preserves config/state
- [ ] Upgrade succeeds
- [ ] Forced post-activation failure rolls back
- [ ] Project runtime doctor passes

## Fresh machine

- [ ] Fresh Ubuntu VM
- [ ] Dependency installation documented
- [ ] OpenCode installation documented
- [ ] tunnel-client setup documented
- [ ] ChatGPT Supervisor setup documented
- [ ] Project onboarding tested
- [ ] Cockpit tested
- [ ] Reboot/resume tested

## Release workflow

Published versioned releases are immutable. Never overwrite an existing published version; bump `VERSION` and create a new release instead.

1. Update `VERSION` and `CHANGELOG`, then commit all intended release changes.
2. Run the validation checklist above and ensure the working tree is clean.
3. Build the release from the exact Git `HEAD`:

   ```bash
   bash scripts/package-release.sh
   ```

4. Inspect `dist/latest.json` and verify the generated archive/checksum.
5. Run the local staging-upload preflight:

   ```bash
   bash scripts/upload-release.sh --check
   ```

6. Upload only to a private staging directory:

   ```bash
   WARROOM_RELEASE_UPLOAD_TARGET='user@host' \
   WARROOM_RELEASE_STAGING_ROOT='/private/staging/path' \
   bash scripts/upload-release.sh
   ```

   The upload script must not write to the public web root and refuses to overwrite an existing version staging directory.

7. On the release server, independently verify the staged manifest, version, commit metadata, filenames, and SHA256 before promotion.
8. Publish versioned archive/checksum files first. Update the public installer as needed, and publish `latest.json` last so it never points to artifacts that are not yet available.
9. Run the public release smoke test:

   ```bash
   bash tests/test-public-release.sh
   ```

10. Run a fresh-machine/public-installer acceptance test when compatibility or installation behavior changed.


## Commercial release

- [ ] Final license selected
- [ ] Third-party license review
- [ ] Security limitations reviewed
- [ ] Support policy written
- [ ] Upgrade policy written
- [ ] Minimum supported versions published
- [ ] Pricing/edition terms defined
