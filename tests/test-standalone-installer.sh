#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$REPO_ROOT/scripts/install-warroom.sh"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/warroom-standalone-test.XXXXXX")"
cleanup() {
  rm -rf -- "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

make_checksum() {
  local archive="$1"
  sha256sum "$archive" > "${archive}.sha256"
}

run_verify() {
  local archive="$1"
  local checksum="${2:-${archive}.sha256}"

  WARROOM_RELEASE_URL="file://${archive}" \
  WARROOM_CHECKSUM_URL="file://${checksum}" \
  bash "$INSTALLER" --verify-only
}

expect_success() {
  local name="$1"
  local archive="$2"
  local output

  if ! output="$(run_verify "$archive" 2>&1)"; then
    printf '%s\n' "$output" >&2
    fail "$name unexpectedly failed"
  fi

  grep -Fq "[PASS] standalone release verification complete" <<<"$output" \
    || fail "$name did not report verification completion"

  printf 'PASS: %s\n' "$name"
}

expect_failure_contains() {
  local name="$1"
  local archive="$2"
  local checksum="$3"
  local expected="$4"
  local output
  local rc=0

  output="$(run_verify "$archive" "$checksum" 2>&1)" || rc=$?

  [[ "$rc" -ne 0 ]] || fail "$name unexpectedly succeeded"

  grep -Fq "$expected" <<<"$output" || {
    printf '%s\n' "$output" >&2
    fail "$name did not report expected failur: $expected"
  }

  printf 'PASS: %s\n' "$name"
}

[[ -f "$INSTALLER" ]] || fail "installer not found: $INSTALLER"
bash -n "$INSTALLER"

GOOD_DIR="$TMP_ROOT/good/warroom-ai"
mkdir -p "$GOOD_DIR/scripts"
printf '%s\n' '0.1.0-alpha.1' > "$GOOD_DIR/VERSION"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$GOOD_DIR/scripts/bootstrap-ubuntu.sh"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$GOOD_DIR/scripts/install.sh"
tar -czf "$TMP_ROOT/good.tar.gz" -C "$TMP_ROOT/good" warroom-ai
make_checksum "$TMP_ROOT/good.tar.gz"

expect_success "happy_path" "$TMP_ROOT/good.tar.gz"

printf '%064d  good.tar.gz\n' 0 > "$TMP_ROOT/bad.sha256"
expect_failure_contains \
  "bad_checksum" \
  "$TMP_ROOT/good.tar.gz" \
  "$TMP_ROOT/bad.sha256" \
  "[FAIL] release checksum mismatch"

python3 - "$TMP_ROOT/traversal.tar.gz" <<'PY'
import io
import sys
import tarfile

path = sys.argv[1]
with tarfile.open(path, "w:gz") as archive:
    data = b"unsafe"
    info = tarfile.TarInfo("../escape.txt")
    info.size = len(data)
    archive.addfile(info, io.BytesIO(data))
PY
make_checksum "$TMP_ROOT/traversal.tar.gz"

expect_failure_contains \
  "path_traversal" \
  "$TMP_ROOT/traversal.tar.gz" \
  "$TMP_ROOT/traversal.tar.gz.sha256" \
  "[FAIL] release archive contains an unsafe path"

BAD_LAYOUT_DIR="$TMP_ROOT/bad-layout/warroom-ai"
mkdir -p "$BAD_LAYOUT_DIR"
printf '%s\n' '0.1.0-alpha.1' > "$BAD_LAYOUT_DIR/VERSION"
tar -czf "$TMP_ROOT/bad-layout.tar.gz" -C "$TMP_ROOT/bad-layout" warroom-ai
make_checksum "$TMP_ROOT/bad-layout.tar.gz"

expect_failure_contains \
  "bad_layout" \
  "$TMP_ROOT/bad-layout.tar.gz" \
  "$TMP_ROOT/bad-layout.tar.gz.sha256" \
  "[FAIL] release archive does not contain scripts/bootstrap-ubuntu.sh"

printf '\nPASS: standalone installer verification suite\n'
printf 'No War Room installation was executed.\n'
