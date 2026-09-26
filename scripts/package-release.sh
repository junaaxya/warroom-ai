#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${WARROOM_DIST_DIR:-$ROOT/dist}"
ALLOW_DIRTY=0

usage() {
  echo "Usage: bash scripts/package-release.sh [--allow-dirty] [--help]"
}

case "${1:-}" in
  "") ;;
  --allow-dirty) ALLOW_DIRTY=1 ;;
  --help|-h) usage; exit 0 ;;
  *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
esac

cd "$ROOT"

for cmd in git tar gzip sha256sum mktemp cp chmod; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[FAIL] required command missing: $cmd" >&2
    exit 1
  fi
done

if [[ ! -f VERSION ]]; then
  echo "[FAIL] VERSION file missing" >&2
  exit 1
fi

VERSION="$(git show HEAD:VERSION | tr -d "[:space:]")"

if [[ -z "$VERSION" || ! "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]]; then
  echo "[FAIL] invalid VERSION: $VERSION" >&2
  exit 1
fi

if [[ "$ALLOW_DIRTY" -ne 1 && -n "$(git status --porcelain)" ]]; then
  echo "[FAIL] working tree is not clean" >&2
  echo "       Commit/stash changes before creating a release." >&2
  exit 1
fi

ARCHIVE_NAME="warroom-ai-$VERSION.tar.gz"
CHECKSUM_NAME="$ARCHIVE_NAME.sha256"
INSTALLER_NAME="install-warroom.sh"
MANIFEST_NAME="latest.json"
COMMIT="$(git rev-parse HEAD)"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/warroom-package.XXXXXX")"
EXPORT="$TMP/export"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

mkdir -p "$EXPORT/warroom-ai"

echo "=== WAR ROOM RELEASE PACKAGER ==="
echo "version : $VERSION"
echo "commit  : $COMMIT"
echo "output  : $DIST"
echo

git archive HEAD | tar -xf - -C "$EXPORT/warroom-ai"

rm -rf "$DIST"
mkdir -p "$DIST"

COMMIT_TIME="$(git show -s --format=%ct HEAD)"

tar --sort=name \
  --mtime="@$COMMIT_TIME" \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --mode="go-w" \
  -czf "$DIST/$ARCHIVE_NAME" \
  -C "$EXPORT" \
  warroom-ai

(cd "$DIST" && sha256sum "$ARCHIVE_NAME" > "$CHECKSUM_NAME")

read -r ARCHIVE_SHA256 _ < "$DIST/$CHECKSUM_NAME"

git show HEAD:scripts/install-warroom.sh > "$DIST/$INSTALLER_NAME"
chmod 755 "$DIST/$INSTALLER_NAME"

{
  printf "{\n"
  printf "  \"schema_version\": 1,\n"
  printf "  \"version\": \"%s\",\n" "$VERSION"
  printf "  \"commit\": \"%s\",\n" "$COMMIT"
  printf "  \"installer\": \"%s\",\n" "$INSTALLER_NAME"
  printf "  \"archive\": \"%s\",\n" "$ARCHIVE_NAME"
  printf "  \"checksum\": \"%s\",\n" "$CHECKSUM_NAME"
  printf "  \"sha256\": \"%s\"\n" "$ARCHIVE_SHA256"
  printf "}\n"
} > "$DIST/$MANIFEST_NAME"

echo "[VERIFY] standalone release artifact"

WARROOM_RELEASE_URL="file://$DIST/$ARCHIVE_NAME" \
WARROOM_CHECKSUM_URL="file://$DIST/$CHECKSUM_NAME" \
bash "$DIST/$INSTALLER_NAME" --verify-only

echo
echo "[PASS] release package ready"
echo "       $DIST/$INSTALLER_NAME"
echo "       $DIST/$ARCHIVE_NAME"
echo "       $DIST/$CHECKSUM_NAME"
echo "       $DIST/$MANIFEST_NAME"

chmod 755 "$DIST/$INSTALLER_NAME"
chmod 644 "$DIST/$ARCHIVE_NAME" "$DIST/$CHECKSUM_NAME" "$DIST/$MANIFEST_NAME"

