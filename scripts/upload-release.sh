#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${WARROOM_DIST_DIR:-$ROOT/dist}"
TARGET="${WARROOM_RELEASE_UPLOAD_TARGET:-}"
STAGING_ROOT="${WARROOM_RELEASE_STAGING_ROOT:-}"
CHECK_ONLY=0

usage() {
  echo "Usage: bash scripts/upload-release.sh [--check] [--help]"
  echo
  echo "Upload mode requires:"
  echo "  WARROOM_RELEASE_UPLOAD_TARGET=user@host"
  echo "  WARROOM_RELEASE_STAGING_ROOT=/absolute/private/staging/path"
}

case "${1:-}" in
  "") ;;
  --check) CHECK_ONLY=1 ;;
  --help|-h) usage; exit 0 ;;
  *) echo "[FAIL] unknown option: $1" >&2; usage >&2; exit 2 ;;
esac

fail() {
  printf "[FAIL] %s\n" "$*" >&2
  exit 1
}

pass() {
  printf "[PASS] %s\n" "$*"
}

json_get() {
  python3 -c "import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$1" "$2"
}

for cmd in git python3 sha256sum bash; do
  command -v "$cmd" >/dev/null 2>&1 || fail "required command missing: $cmd"
done

MANIFEST="$DIST/latest.json"
[[ -f "$MANIFEST" ]] || fail "missing manifest: $MANIFEST"

SCHEMA_VERSION="$(json_get "$MANIFEST" schema_version)"
VERSION="$(json_get "$MANIFEST" version)"
COMMIT="$(json_get "$MANIFEST" commit)"
INSTALLER_NAME="$(json_get "$MANIFEST" installer)"
ARCHIVE_NAME="$(json_get "$MANIFEST" archive)"
CHECKSUM_NAME="$(json_get "$MANIFEST" checksum)"
MANIFEST_SHA="$(json_get "$MANIFEST" sha256)"
MANIFEST_SHA="${MANIFEST_SHA,,}"

[[ "$SCHEMA_VERSION" == "1" ]] || fail "unsupported manifest schema: $SCHEMA_VERSION"
[[ "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] || fail "invalid version"
[[ "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || fail "invalid commit"
[[ "$INSTALLER_NAME" == "install-warroom.sh" ]] || fail "unexpected installer name"
[[ "$ARCHIVE_NAME" == "warroom-ai-$VERSION.tar.gz" ]] || fail "archive/version mismatch"
[[ "$CHECKSUM_NAME" == "$ARCHIVE_NAME.sha256" ]] || fail "checksum filename mismatch"
[[ "$MANIFEST_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "invalid manifest SHA256"

INSTALLER="$DIST/$INSTALLER_NAME"
ARCHIVE="$DIST/$ARCHIVE_NAME"
CHECKSUM="$DIST/$CHECKSUM_NAME"

for file in "$INSTALLER" "$ARCHIVE" "$CHECKSUM"; do
  [[ -f "$file" ]] || fail "missing release file: $file"
done

git -C "$ROOT" cat-file -e "${COMMIT}^{commit}" 2>/dev/null || fail "manifest commit is not available in this repository"
COMMIT_VERSION="$(git -C "$ROOT" show "$COMMIT:VERSION" | tr -d "[:space:]")"
[[ "$COMMIT_VERSION" == "$VERSION" ]] || fail "manifest version does not match VERSION at manifest commit"

read -r CHECKSUM_SHA _ < "$CHECKSUM"
CHECKSUM_SHA="${CHECKSUM_SHA,,}"
ACTUAL_SHA="$(sha256sum "$ARCHIVE" | awk "{print tolower(\$1)}")"

[[ "$CHECKSUM_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "invalid checksum file"
[[ "$CHECKSUM_SHA" == "$MANIFEST_SHA" ]] || fail "manifest SHA256 differs from checksum file"
[[ "$ACTUAL_SHA" == "$MANIFEST_SHA" ]] || fail "archive SHA256 mismatch"

echo "=== WAR ROOM RELEASE UPLOAD ==="
echo "version : $VERSION"
echo "commit  : $COMMIT"
echo "sha256  : $ACTUAL_SHA"
echo "dist    : $DIST"
echo

echo "[VERIFY] standalone release artifact"
WARROOM_RELEASE_URL="file://$ARCHIVE" \
WARROOM_CHECKSUM_URL="file://$CHECKSUM" \
bash "$INSTALLER" --verify-only
pass "local_release_verification"

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo
  echo "PASS: release upload preflight"
  echo "No network upload was executed."
  exit 0
fi

[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || fail "working tree is not clean"

for cmd in ssh rsync; do
  command -v "$cmd" >/dev/null 2>&1 || fail "required upload command missing: $cmd"
done

[[ -n "$TARGET" ]] || fail "WARROOM_RELEASE_UPLOAD_TARGET is required"
[[ "$STAGING_ROOT" =~ ^/[0-9A-Za-z._/-]+$ ]] || fail "WARROOM_RELEASE_STAGING_ROOT must be a safe absolute path"

REMOTE_DIR="${STAGING_ROOT%/}/$VERSION"

[[ "$TARGET" != -* ]] || fail "unsafe upload target"
[[ "$TARGET" =~ ^[0-9A-Za-z._@:-]+$ ]] || fail "unsafe upload target"

echo "[CHECK] remote staging destination"
if ssh "$TARGET" "test -e $REMOTE_DIR"; then
  fail "remote staging version already exists: $REMOTE_DIR"
fi

echo "[CREATE] private remote staging"
ssh "$TARGET" "mkdir -p $STAGING_ROOT && chmod 700 $STAGING_ROOT && umask 077 && mkdir $REMOTE_DIR"

REMOTE_CREATED=1
cleanup_remote() {
  if [[ "${REMOTE_CREATED:-0}" -eq 1 ]]; then
    ssh "$TARGET" "rm -rf -- $REMOTE_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup_remote ERR INT TERM

echo "[UPLOAD] $TARGET:$REMOTE_DIR"
rsync -av --chmod=F600 \
  "$INSTALLER" \
  "$MANIFEST" \
  "$ARCHIVE" \
  "$CHECKSUM" \
  "$TARGET:$REMOTE_DIR/"

echo "[VERIFY] remote staged archive"
ssh "$TARGET" "cd $REMOTE_DIR && sha256sum -c $CHECKSUM_NAME"

REMOTE_CREATED=0
trap - ERR INT TERM

echo
echo "PASS: release staged for server-side verification"
echo "remote : $TARGET:$REMOTE_DIR"
echo "No public web root was modified."
