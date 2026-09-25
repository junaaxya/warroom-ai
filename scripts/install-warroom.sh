#!/usr/bin/env bash
set -euo pipefail

MODE="install"

usage() {
  cat <<'EOF'
War Room AI standalone installer

Usage:
  bash install-warroom.sh
  bash install-warroom.sh --verify-only
  bash install-warroom.sh --help

Environment:
  WARROOM_RELEASE_URL       Release .tar.gz URL (required until public release hosting is configured)
  WARROOM_CHECKSUM_URL      SHA256 file URL (default: ${WARROOM_RELEASE_URL}.sha256)
  WARROOM_ALLOW_HTTP=1      Allow plain http:// URLs (not recommended)

Supported release URL schemes:
  https://
  file://   (for local acceptance tests)
EOF
}

log() {
  printf '%s\n' "$*"
}

fail() {
  printf '[FAIL] %s\n' "$*" >&2
  exit 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

case "${1:-}" in
  "")
    ;;
  --verify-only)
    MODE="verify"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    fail "unknown option: $1"
    ;;
esac

RELEASE_URL="${WARROOM_RELEASE_URL:-}"
[[ -n "$RELEASE_URL" ]] || fail "WARROOM_RELEASE_URL is required until public release hosting is configured"

CHECKSUM_URL="${WARROOM_CHECKSUM_URL:-${RELEASE_URL}.sha256}"

validate_url() {
  local label="$1"
  local url="$2"

  case "$url" in
    https://*|file://*)
      ;;
    http://*)
      [[ "${WARROOM_ALLOW_HTTP:-0}" == "1" ]] \
        || fail "$label uses insecure http://; use https:// or set WARROOM_ALLOW_HTTP=1 explicitly"
      ;;
    *)
      fail "$label must use https://, file://, or explicitly allowed http://"
      ;;
  esac
}

validate_url "WARROOM_RELEASE_URL" "$RELEASE_URL"
validate_url "WARROOM_CHECKSUM_URL" "$CHECKSUM_URL"

for cmd in curl sha256sum tar mktemp awk find; do
  have_cmd "$cmd" || fail "required bootstrap downloader command is missing: $cmd"
done

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/warroom-standalone.XXXXXX")"
cleanup() {
  rm -rf -- "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

ARCHIVE="$TMP_ROOT/warroom-release.tar.gz"
CHECKSUM_FILE="$TMP_ROOT/warroom-release.tar.gz.sha256"
EXTRACT_DIR="$TMP_ROOT/extract"

mkdir -p "$EXTRACT_DIR"

log "=== WAR ROOM STANDALONE INSTALLER ==="
log
log "[DOWNLOAD] release"
curl -fsSL --retry 3 --retry-delay 1 "$RELEASE_URL" -o "$ARCHIVE"

log "[DOWNLOAD] checksum"
curl -fsSL --retry 3 --retry-delay 1 "$CHECKSUM_URL" -o "$CHECKSUM_FILE"

EXPECTED_SHA="$(
  awk '
    {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^[0-9A-Fa-f]{64}$/) {
          print tolower($i)
          exit
        }
      }
    }
  ' "$CHECKSUM_FILE"
)"

[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]] \
  || fail "checksum file does not contain a valid SHA256 digest"

ACTUAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print tolower($1)}')"

if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  fail "release checksum mismatch"
fi

log "[PASS] SHA256 verified"

if tar -tzf "$ARCHIVE" | awk '
  /^\// { bad = 1 }
  /(^|\/)\.\.(\/|$)/ { bad = 1 }
  END { exit bad ? 0 : 1 }
'; then
  fail "release archive contains an unsafe path"
fi

tar -xzf "$ARCHIVE" -C "$EXTRACT_DIR"

BOOTSTRAP=""
if [[ -f "$EXTRACT_DIR/scripts/bootstrap-ubuntu.sh" ]]; then
  BOOTSTRAP="$EXTRACT_DIR/scripts/bootstrap-ubuntu.sh"
else
  mapfile -t CANDIDATES < <(
    find "$EXTRACT_DIR" \
      -mindepth 2 \
      -maxdepth 4 \
      -type f \
      -path '*/scripts/bootstrap-ubuntu.sh' \
      -print
  )

  if (( ${#CANDIDATES[@]} == 1 )); then
    BOOTSTRAP="${CANDIDATES[0]}"
  elif (( ${#CANDIDATES[@]} == 0 )); then
    fail "release archive does not contain scripts/bootstrap-ubuntu.sh"
  else
    fail "release archive contains multiple bootstrap entrypoints"
  fi
fi

RELEASE_ROOT="$(cd -- "$(dirname -- "$BOOTSTRAP")/.." && pwd)"

[[ -f "$RELEASE_ROOT/scripts/install.sh" ]] \
  || fail "release archive is missing scripts/install.sh"

if [[ -f "$RELEASE_ROOT/VERSION" ]]; then
  RELEASE_VERSION="$(tr -d '[:space:]' < "$RELEASE_ROOT/VERSION")"
else
  RELEASE_VERSION="unknown"
fi

log "[PASS] release layout verified"
log "       version: $RELEASE_VERSION"

if [[ "$MODE" == "verify" ]]; then
  log
  log "[PASS] standalone release verification complete"
  exit 0
fi

log
log "[INSTALL] bootstrap War Room AI"
(
  cd "$RELEASE_ROOT"
  bash "$BOOTSTRAP"
)

log
log "[PASS] standalone installation complete"
log
log "Next:"
log "  warroom setup"
log "  warroom doctor-install"
