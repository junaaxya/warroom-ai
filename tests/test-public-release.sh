#!/usr/bin/env bash
set -euo pipefail

INSTALL_URL="${WARROOM_PUBLIC_INSTALL_URL:-https://install.lab-ilkom.my.id}"
RELEASE_BASE="${WARROOM_PUBLIC_RELEASE_BASE_URL:-https://releases.lab-ilkom.my.id}"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/warroom-public-release.XXXXXX")"
cleanup() { rm -rf -- "$TMP_ROOT"; }
trap cleanup EXIT INT TERM

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

for cmd in curl sha256sum tar awk python3 bash grep; do
  command -v "$cmd" >/dev/null 2>&1 || fail "missing command: $cmd"
done

echo "=== WAR ROOM PUBLIC RELEASE SMOKE TEST ==="
echo "installer : $INSTALL_URL"
echo "releases  : $RELEASE_BASE"
echo

echo "[CHECK] public installer"
curl -fsSL --retry 3 --retry-delay 1 "$INSTALL_URL" -o "$TMP_ROOT/install-warroom.sh"
[[ -s "$TMP_ROOT/install-warroom.sh" ]] || fail "public installer is empty"
grep -Fq "War Room AI standalone installer" "$TMP_ROOT/install-warroom.sh" || fail "unexpected installer content"

if [[ -z "${WARROOM_PUBLIC_RELEASE_BASE_URL:-}" ]]; then
  grep -Fq "DEFAULT_RELEASE_BASE_URL=\"https://releases.lab-ilkom.my.id\"" "$TMP_ROOT/install-warroom.sh" || fail "installer default release URL is incorrect"
fi
pass "installer_endpoint"

echo "[CHECK] latest.json"
curl -fsSL --retry 3 --retry-delay 1 "$RELEASE_BASE/latest.json" -o "$TMP_ROOT/latest.json"

SCHEMA_VERSION="$(json_get "$TMP_ROOT/latest.json" schema_version)"
VERSION="$(json_get "$TMP_ROOT/latest.json" version)"
COMMIT="$(json_get "$TMP_ROOT/latest.json" commit)"
ARCHIVE_NAME="$(json_get "$TMP_ROOT/latest.json" archive)"
CHECKSUM_NAME="$(json_get "$TMP_ROOT/latest.json" checksum)"
MANIFEST_SHA="$(json_get "$TMP_ROOT/latest.json" sha256)"
MANIFEST_SHA="${MANIFEST_SHA,,}"

[[ "$SCHEMA_VERSION" == "1" ]] || fail "unsupported manifest schema: $SCHEMA_VERSION"
[[ "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] || fail "invalid manifest version"
[[ "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || fail "invalid manifest commit"
[[ "$ARCHIVE_NAME" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*\.tar\.gz$ ]] || fail "invalid archive name"
[[ "$CHECKSUM_NAME" == "${ARCHIVE_NAME}.sha256" ]] || fail "checksum filename mismatch"
[[ "$MANIFEST_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "invalid manifest SHA256"
pass "latest_json"

PUBLIC_DIR="$TMP_ROOT/public"
RELEASE_DIR="$PUBLIC_DIR/releases/$VERSION"
mkdir -p "$RELEASE_DIR"
cp "$TMP_ROOT/latest.json" "$PUBLIC_DIR/latest.json"

echo "[CHECK] public release artifact"
curl -fsSL --retry 3 --retry-delay 1 "$RELEASE_BASE/releases/$VERSION/$ARCHIVE_NAME" -o "$RELEASE_DIR/$ARCHIVE_NAME"
curl -fsSL --retry 3 --retry-delay 1 "$RELEASE_BASE/releases/$VERSION/$CHECKSUM_NAME" -o "$RELEASE_DIR/$CHECKSUM_NAME"

read -r EXPECTED_SHA _ < "$RELEASE_DIR/$CHECKSUM_NAME"
EXPECTED_SHA="${EXPECTED_SHA,,}"
ACTUAL_SHA="$(sha256sum "$RELEASE_DIR/$ARCHIVE_NAME" | awk "{print tolower(\$1)}")"

[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "invalid published checksum"
[[ "$EXPECTED_SHA" == "$MANIFEST_SHA" ]] || fail "latest.json SHA256 differs from checksum file"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || fail "public archive SHA256 mismatch"
(cd "$RELEASE_DIR" && sha256sum -c "$CHECKSUM_NAME") >/dev/null || fail "sha256sum verification failed"
pass "public_archive_sha256"

echo "[CHECK] downloaded installer --verify-only"
RC=0
env -u WARROOM_RELEASE_URL -u WARROOM_CHECKSUM_URL -u WARROOM_MANIFEST_URL \
  WARROOM_RELEASE_BASE_URL="file://$PUBLIC_DIR" \
  bash "$TMP_ROOT/install-warroom.sh" --verify-only >"$TMP_ROOT/verify.log" 2>&1 || RC=$?

if [[ "$RC" -ne 0 ]]; then
  cat "$TMP_ROOT/verify.log" >&2
  fail "public installer verify-only failed"
fi

grep -Fq "[PASS] standalone release verification complete" "$TMP_ROOT/verify.log" || fail "installer did not report verification completion"
pass "installer_verify_only"

echo
echo "PASS: public release smoke test"
echo "version : $VERSION"
echo "commit  : $COMMIT"
echo "sha256  : $ACTUAL_SHA"
echo "No War Room installation was executed."
