#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP="$ROOT/scripts/bootstrap-ubuntu.sh"

if [[ ! -f "$BOOTSTRAP" ]]; then
  echo "FAIL: bootstrap not found: $BOOTSTRAP" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

make_home() {
  local name="$1"
  local home="$TMP/$name/home"
  mkdir -p "$home/bin" "$home/.local/bin" "$home/.opencode/bin"
  printf '%s\n' "$home"
}

write_node() {
  local home="$1" major="$2" version="$3"
  cat > "$home/bin/node" <<EOF
#!/usr/bin/env bash
case "\${1:-}" in
  --version) echo "v$version" ;;
  -p) echo "$major" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$home/bin/node"
}

write_simple_version_cmd() {
  local path="$1" output="$2"
  cat > "$path" <<EOF
#!/usr/bin/env bash
echo "$output"
EOF
  chmod +x "$path"
}

run_case() {
  local name="$1" expected_rc="$2"
  shift 2
  local home="$1"
  shift

  local out="$TMP/$name.out"
  local rc=0

  set +e
  env -i \
    HOME="$home" \
    PATH="/usr/bin:/bin" \
    USER="${USER:-warroom-test}" \
    LOGNAME="${LOGNAME:-warroom-test}" \
    bash "$BOOTSTRAP" --check >"$out" 2>&1
  rc=$?
  set -e

  if [[ "$rc" -ne "$expected_rc" ]]; then
    echo "FAIL: $name returned $rc, expected $expected_rc"
    cat "$out"
    exit 1
  fi

  for needle in "$@"; do
    if ! grep -Fq "$needle" "$out"; then
      echo "FAIL: $name missing expected text: $needle"
      cat "$out"
      exit 1
    fi
  done

  echo "PASS: $name"
}

# Case 1: everything ready -> exit 0.
HOME_READY="$(make_home ready)"
write_node "$HOME_READY" 24 "24.13.0"
write_simple_version_cmd "$HOME_READY/bin/npm" "11.6.2"
write_simple_version_cmd "$HOME_READY/bin/opencode" "opencode-test"
write_simple_version_cmd "$HOME_READY/bin/tunnel-client" "tunnel-client-test"

run_case \
  ready \
  0 \
  "$HOME_READY" \
  "[PASS] Node.js v24.13.0 (>=20)" \
  "[PASS] OpenCode" \
  "[PASS] tunnel-client" \
  "[PASS] all bootstrap dependencies are ready"

# Case 2: OpenCode and tunnel-client missing -> exit 1.
HOME_MISSING="$(make_home missing)"
write_node "$HOME_MISSING" 24 "24.13.0"
write_simple_version_cmd "$HOME_MISSING/bin/npm" "11.6.2"

run_case \
  missing_agents \
  1 \
  "$HOME_MISSING" \
  "[MISSING] OpenCode" \
  "[MISSING] tunnel-client"

# Case 3: incompatible Node -> exit 1.
HOME_OLDNODE="$(make_home oldnode)"
write_node "$HOME_OLDNODE" 18 "18.20.8"
write_simple_version_cmd "$HOME_OLDNODE/bin/npm" "10.8.2"
write_simple_version_cmd "$HOME_OLDNODE/bin/opencode" "opencode-test"
write_simple_version_cmd "$HOME_OLDNODE/bin/tunnel-client" "tunnel-client-test"

run_case \
  old_node \
  1 \
  "$HOME_OLDNODE" \
  "[WARN] Node.js v18.20.8 is incompatible; War Room requires Node.js >=20" \
  "[PASS] OpenCode" \
  "[PASS] tunnel-client"

echo
echo "PASS: bootstrap --check simulation suite"
echo "No packages were installed and no War Room installer was executed."
