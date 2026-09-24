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
- [ ] `bash -n scripts/install.sh`
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

## Commercial release

- [ ] Final license selected
- [ ] Third-party license review
- [ ] Security limitations reviewed
- [ ] Support policy written
- [ ] Upgrade policy written
- [ ] Minimum supported versions published
- [ ] Pricing/edition terms defined
