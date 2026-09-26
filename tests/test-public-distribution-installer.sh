#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$REPO_ROOT/scripts/install-warroom.sh"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/warroom-public-test.XXXXXX")"
cleanup() { rm -rf -- "$TMP_ROOT"; }
trap cleanup EXIT INT TERM

fail() {
  printf "FAIL: %s\n" "$*" >&2
  exit 1
}

run_manifest_verify() {
  local base="$1"
  env -u WARROOM_RELEASE_URL -u WARROOM_CHECKSUM_URL \
    WARROOM_RELEASE_BASE_URL="file://$base" \
    bash "$INSTALLER" --verify-only
}

write_manifest() {
  local path="$1"
  local version="$2"
  local archive="$3"
  local checksum="$4"
  local sha="$5"

  {
    printf "{\n"
    printf "  \"schema_version\": 1,\n"
    printf "  \"version\": \"%s\",\n" "$version"
    printf "  \"archive\": \"%s\",\n" "$archive"
    printf "  \"checksum\": \"%s\",\n" "$checksum"
    printf "  \"sha256\": \"%s\"\n" "$sha"
    printf "}\n"
  } > "$path"
}

[[ -f "$INSTALLER" ]] || fail "installer not found: $INSTALLER"
bash -n "$INSTALLER"

VERSION="0.1.0-alpha.1"
ARCHIVE="warroom-ai-$VERSION.tar.gz"
CHECKSUM="$ARCHIVE.sha256"

BUILD="$TMP_ROOT/build/warroom-ai"
PUBLIC="$TMP_ROOT/public"
RELEASE_DIR="$PUBLIC/releases/$VERSION"

mkdir -p "$BUILD/scripts" "$RELEASE_DIR"
printf "%s\n" "$VERSION" > "$BUILD/VERSION"
printf "%s\n" "#!/usr/bin/env bash" "exit 0" > "$BUILD/scripts/bootstrap-ubuntu.sh"
printf "%s\n" "#!/usr/bin/env bash" "exit 0" > "$BUILD/scripts/install.sh"

tar -czf "$RELEASE_DIR/$ARCHIVE" -C "$TMP_ROOT/build" warroom-ai
(cd "$RELEASE_DIR" && sha256sum "$ARCHIVE" > "$CHECKSUM")
SHA="$(sha256sum "$RELEASE_DIR/$ARCHIVE" | awk "{print \$1}")"

write_manifest "$PUBLIC/latest.json" "$VERSION" "$ARCHIVE" "$CHECKSUM" "$SHA"

OUTPUT="$(run_manifest_verify "$PUBLIC" 2>&1)" || {
  printf "%s\n" "$OUTPUT" >&2
  fail "manifest_happy_path unexpectedly failed"
}
grep -Fq "[PASS] standalone release verification complete" <<<"$OUTPUT" \
  || fail "manifest_happy_path did not complete verification"
printf "PASS: manifest_happy_path\n"

BAD_SHA="$(printf "%064d" 0)"
write_manifest "$PUBLIC/latest.json" "$VERSION" "$ARCHIVE" "$CHECKSUM" "$BAD_SHA"
RC=0
OUTPUT="$(run_manifest_verify "$PUBLIC" 2>&1)" || RC=$?
[[ "$RC" -ne 0 ]] || fail "manifest_bad_sha unexpectedly succeeded"
grep -Fq "[FAIL] latest.json SHA256 does not match checksum file" <<<"$OUTPUT" \
  || fail "manifest_bad_sha reported the wrong failure"
printf "PASS: manifest_bad_sha\n"

MISMATCH_VERSION="0.1.0-alpha.2"
MISMATCH_DIR="$PUBLIC/releases/$MISMATCH_VERSION"
mkdir -p "$MISMATCH_DIR"
cp "$RELEASE_DIR/$ARCHIVE" "$MISMATCH_DIR/$ARCHIVE"
(cd "$MISMATCH_DIR" && sha256sum "$ARCHIVE" > "$CHECKSUM")
MISMATCH_SHA="$(sha256sum "$MISMATCH_DIR/$ARCHIVE" | awk "{print \$1}")"
write_manifest "$PUBLIC/latest.json" "$MISMATCH_VERSION" "$ARCHIVE" "$CHECKSUM" "$MISMATCH_SHA"

RC=0
OUTPUT="$(run_manifest_verify "$PUBLIC" 2>&1)" || RC=$?
[[ "$RC" -ne 0 ]] || fail "manifest_version_mismatch unexpectedly succeeded"
grep -Fq "[FAIL] release VERSION does not match latest.json version" <<<"$OUTPUT" \
  || fail "manifest_version_mismatch reported the wrong failure"
printf "PASS: manifest_version_mismatch\n"

printf "\nPASS: public distribution installer verification suite\n"
printf "No War Room installation was executed.\n"
