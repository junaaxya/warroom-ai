# Changelog

## 0.1.0-alpha.1 — 2026-09-24

### Added

- Generic multi-project War Room launcher
- Canonical-path project identity
- Frontend and Backend OpenCode divisions
- Per-project Bridge
- Supervisor MCP
- Secure MCP Tunnel integration
- Strict path-based write guard
- Shared-path coordination lifecycle
- Persistent handoff
- Generic project onboarding
- `warroom setup`
- `warroom doctor-install`
- `warroom version`
- `warroom cockpit`
- Portable install layout
- Installer and safe uninstaller
- Transactional upgrade with rollback

### Validated

- Fresh isolated installation
- Config permissions and secret-path handling
- Installation doctor: 31 pass / 0 warn / 0 fail
- Safe uninstall preserving user config/state
- Upgrade from alpha.1 to alpha.2 in sandbox
- Forced post-activation alpha.3 failure
- Rollback to alpha.2
- Config and state integrity after rollback
- MCP restoration
- Live development runtime isolation

### Known limitations

- Clean Ubuntu VM test still required
- Current guard is workflow enforcement, not an OS sandbox
- Read isolation is not equivalent to write isolation
- Minimum supported dependency versions are not finalized
- Public/commercial license is not finalized
