#!/usr/bin/env bash
set -euo pipefail

# War Room AI bootstrap for Ubuntu/Debian.
# --check: read-only dependency audit
# default: install only missing/incompatible prerequisites, then install War Room

MODE="install"
NODE_INSTALL_MAJOR="${WARROOM_NODE_MAJOR:-24}"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/bootstrap-ubuntu.sh
  bash scripts/bootstrap-ubuntu.sh --check

Environment:
  WARROOM_NODE_MAJOR=24   Node major to install when Node.js is missing/incompatible.

Behavior:
  --check   Read-only. Reports missing/incompatible dependencies and changes nothing.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

log()  { printf '%s\n' "$*"; }
pass() { printf '[PASS] %s\n' "$*"; }
skip() { printf '[SKIP] %s\n' "$*"; }
miss() { printf '[MISSING] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
fail() { printf '[FAIL] %s\n' "$*" >&2; }

export PATH="$HOME/.local/bin:$HOME/bin:$HOME/.opencode/bin:$PATH"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
INSTALL_SCRIPT="$SCRIPT_DIR/install.sh"

if [[ ! -r /etc/os-release ]]; then
  fail "cannot read /etc/os-release"
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
OS_ID="${ID:-unknown}"
OS_LIKE="${ID_LIKE:-}"

if [[ "$OS_ID" != "ubuntu" && "$OS_ID" != "debian" && "$OS_LIKE" != *debian* ]]; then
  fail "automatic bootstrap currently supports Ubuntu/Debian only (detected: $OS_ID)"
  exit 1
fi

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) TUNNEL_ARCH="amd64" ;;
  aarch64|arm64) TUNNEL_ARCH="arm64" ;;
  *)
    fail "unsupported CPU architecture: $ARCH_RAW"
    exit 1
    ;;
esac

node_major() {
  command -v node >/dev/null 2>&1 || return 1
  node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null
}

node_ok() {
  local major
  major="$(node_major 2>/dev/null || true)"
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 20 ))
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

report_cmd() {
  local cmd="$1" label="$2"
  if have_cmd "$cmd"; then
    pass "$label ($(command -v "$cmd"))"
    return 0
  fi
  miss "$label"
  return 1
}

CHECK_FAILURES=0

log "War Room AI Bootstrap"
log "OS: ${PRETTY_NAME:-$OS_ID}"
log "Architecture: $ARCH_RAW"
log

for item in \
  "bash:Bash" \
  "curl:curl" \
  "git:git" \
  "python3:Python 3" \
  "tmux:tmux" \
  "ss:iproute2/ss" \
  "unzip:unzip" \
  "sha256sum:sha256sum"
do
  cmd="${item%%:*}"
  label="${item#*:}"
  report_cmd "$cmd" "$label" || CHECK_FAILURES=$((CHECK_FAILURES + 1))
done

if have_cmd node; then
  NODE_VERSION="$(node --version 2>/dev/null || true)"
  if node_ok; then
    pass "Node.js $NODE_VERSION (>=20)"
  else
    warn "Node.js $NODE_VERSION is incompatible; War Room requires Node.js >=20"
    CHECK_FAILURES=$((CHECK_FAILURES + 1))
  fi
else
  miss "Node.js >=20"
  CHECK_FAILURES=$((CHECK_FAILURES + 1))
fi

if have_cmd npm; then
  pass "npm $(npm --version 2>/dev/null || true)"
else
  miss "npm"
  CHECK_FAILURES=$((CHECK_FAILURES + 1))
fi

if have_cmd opencode; then
  pass "OpenCode ($(command -v opencode))"
else
  miss "OpenCode"
  CHECK_FAILURES=$((CHECK_FAILURES + 1))
fi

if have_cmd tunnel-client; then
  pass "tunnel-client ($(command -v tunnel-client))"
else
  miss "tunnel-client"
  CHECK_FAILURES=$((CHECK_FAILURES + 1))
fi

if [[ "$MODE" == "check" ]]; then
  log
  if (( CHECK_FAILURES == 0 )); then
    pass "all bootstrap dependencies are ready"
    exit 0
  fi
  fail "$CHECK_FAILURES dependency check(s) need attention"
  exit 1
fi

as_root() {
  if (( EUID == 0 )); then
    "$@"
  elif have_cmd sudo; then
    sudo "$@"
  else
    fail "sudo is required to install missing system packages"
    exit 1
  fi
}

APT_PACKAGES=()

have_cmd curl      || APT_PACKAGES+=(curl)
have_cmd git       || APT_PACKAGES+=(git)
have_cmd python3   || APT_PACKAGES+=(python3)
have_cmd tmux      || APT_PACKAGES+=(tmux)
have_cmd ss        || APT_PACKAGES+=(iproute2)
have_cmd unzip     || APT_PACKAGES+=(unzip)
have_cmd sha256sum || APT_PACKAGES+=(coreutils)

if ! dpkg-query -W -f='${Status}' ca-certificates 2>/dev/null | grep -q 'ok installed'; then
  APT_PACKAGES+=(ca-certificates)
fi

if ((${#APT_PACKAGES[@]} > 0)); then
  log
  log "[INSTALL] system packages: ${APT_PACKAGES[*]}"
  as_root apt-get update
  as_root apt-get install -y "${APT_PACKAGES[@]}"
else
  skip "system packages already available"
fi

hash -r

if ! node_ok || ! have_cmd npm; then
  log
  log "[INSTALL] Node.js ${NODE_INSTALL_MAJOR}.x via NodeSource"
  TMP_NODE="$(mktemp -d)"
  trap 'rm -rf "${TMP_NODE:-}" "${TMP_TUNNEL:-}" "${TMP_OPENCODE:-}"' EXIT
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_INSTALL_MAJOR}.x" \
    -o "$TMP_NODE/nodesource_setup.sh"
  as_root bash "$TMP_NODE/nodesource_setup.sh"
  as_root apt-get install -y nodejs
  hash -r

  if ! node_ok; then
    fail "Node.js installation finished but the active node is still incompatible: $(command -v node 2>/dev/null || echo missing)"
    exit 1
  fi
  if ! have_cmd npm; then
    fail "npm is still unavailable after Node.js installation"
    exit 1
  fi
  pass "Node.js $(node --version) / npm $(npm --version)"
else
  skip "Node.js $(node --version) and npm already compatible"
fi

if ! have_cmd opencode; then
  log
  log "[INSTALL] OpenCode using the official installer"
  TMP_OPENCODE="$(mktemp -d)"
  trap 'rm -rf "${TMP_NODE:-}" "${TMP_TUNNEL:-}" "${TMP_OPENCODE:-}"' EXIT
  curl -fsSL https://opencode.ai/install -o "$TMP_OPENCODE/install-opencode.sh"
  bash "$TMP_OPENCODE/install-opencode.sh"
  export PATH="$HOME/.opencode/bin:$HOME/.local/bin:$HOME/bin:$PATH"
  hash -r

  if ! have_cmd opencode; then
    fail "OpenCode installer completed but 'opencode' is not on PATH"
    fail "expected common locations include ~/.opencode/bin and ~/.local/bin"
    exit 1
  fi
  pass "OpenCode installed ($(command -v opencode))"
else
  skip "OpenCode already installed ($(command -v opencode))"
fi

if ! have_cmd tunnel-client; then
  log
  log "[INSTALL] latest public OpenAI tunnel-client for linux-$TUNNEL_ARCH"

  TMP_TUNNEL="$(mktemp -d)"
  trap 'rm -rf "${TMP_NODE:-}" "${TMP_TUNNEL:-}" "${TMP_OPENCODE:-}"' EXIT

  RELEASE_JSON="$TMP_TUNNEL/release.json"
  curl -fsSL \
    https://api.github.com/repos/openai/tunnel-client/releases/latest \
    -o "$RELEASE_JSON"

  mapfile -t RELEASE_INFO < <(
    python3 - "$RELEASE_JSON" "$TUNNEL_ARCH" <<'PY'
import json, re, sys
path, arch = sys.argv[1], sys.argv[2]
data = json.load(open(path, encoding="utf-8"))
assets = data.get("assets", [])
pat = re.compile(rf"^tunnel-client-v[^/]+-linux-{re.escape(arch)}\.zip$")
binary = next((a for a in assets if pat.match(a.get("name", ""))), None)
checks = next((a for a in assets if a.get("name") == "SHA256SUMS.txt"), None)
if not binary or not checks:
    raise SystemExit("required release assets not found")
print(data.get("tag_name", "unknown"))
print(binary["name"])
print(binary["browser_download_url"])
print(checks["browser_download_url"])
PY
  )

  if ((${#RELEASE_INFO[@]} != 4)); then
    fail "could not resolve latest tunnel-client release assets"
    exit 1
  fi

  TUNNEL_TAG="${RELEASE_INFO[0]}"
  TUNNEL_ASSET="${RELEASE_INFO[1]}"
  TUNNEL_URL="${RELEASE_INFO[2]}"
  TUNNEL_SUMS_URL="${RELEASE_INFO[3]}"

  curl -fsSL "$TUNNEL_URL" -o "$TMP_TUNNEL/$TUNNEL_ASSET"
  curl -fsSL "$TUNNEL_SUMS_URL" -o "$TMP_TUNNEL/SHA256SUMS.txt"

  EXPECTED_SHA="$(
    python3 - "$TMP_TUNNEL/SHA256SUMS.txt" "$TUNNEL_ASSET" <<'PY'
import sys
path, target = sys.argv[1], sys.argv[2]
for line in open(path, encoding="utf-8"):
    parts = line.strip().split()
    if len(parts) >= 2 and parts[-1].lstrip("*") == target:
        print(parts[0])
        break
else:
    raise SystemExit(1)
PY
  )"

  ACTUAL_SHA="$(sha256sum "$TMP_TUNNEL/$TUNNEL_ASSET" | awk '{print $1}')"
  if [[ -z "$EXPECTED_SHA" || "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
    fail "tunnel-client checksum verification failed"
    exit 1
  fi

  mkdir -p "$TMP_TUNNEL/extract" "$HOME/.local/bin"
  unzip -q "$TMP_TUNNEL/$TUNNEL_ASSET" -d "$TMP_TUNNEL/extract"

  TUNNEL_BIN="$(find "$TMP_TUNNEL/extract" -type f -name tunnel-client -print -quit)"
  if [[ -z "$TUNNEL_BIN" ]]; then
    fail "tunnel-client binary not found inside release archive"
    exit 1
  fi

  install -m 0755 "$TUNNEL_BIN" "$HOME/.local/bin/tunnel-client"
  export PATH="$HOME/.local/bin:$PATH"
  hash -r

  if ! have_cmd tunnel-client; then
    fail "tunnel-client installation completed but command is unavailable"
    exit 1
  fi
  pass "tunnel-client $TUNNEL_TAG installed ($(command -v tunnel-client))"
else
  skip "tunnel-client already installed ($(command -v tunnel-client))"
fi

log
log "=== FINAL DEPENDENCY CHECK ==="

FINAL_FAILURES=0
for cmd in bash curl git python3 tmux ss unzip sha256sum npm opencode tunnel-client; do
  if have_cmd "$cmd"; then
    pass "$cmd"
  else
    fail "$cmd"
    FINAL_FAILURES=$((FINAL_FAILURES + 1))
  fi
done

if node_ok; then
  pass "node $(node --version)"
else
  fail "node >=20"
  FINAL_FAILURES=$((FINAL_FAILURES + 1))
fi

if (( FINAL_FAILURES > 0 )); then
  fail "$FINAL_FAILURES final dependency check(s) failed"
  exit 1
fi

if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  fail "War Room installer not found: $INSTALL_SCRIPT"
  exit 1
fi

log
log "[INSTALL] War Room AI"
(
  cd "$REPO_ROOT"
  bash "$INSTALL_SCRIPT"
)

log
pass "bootstrap complete"
log
log "Next:"
log "  warroom setup"
log "  warroom doctor-install"
