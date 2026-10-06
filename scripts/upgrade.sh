#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(
  cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd
)"

SOURCE_ROOT="$(
  cd "$SCRIPT_DIR/.." >/dev/null 2>&1
  pwd -P
)"

INSTALL_DIR="${WARROOM_INSTALL_DIR:-$HOME/.local/share/warroom}"

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
OPENCODE_HOME="$XDG_CONFIG_HOME/opencode"

OPENCODE_CONFIG="$OPENCODE_HOME/opencode.json"
GUARD_TARGET="$OPENCODE_HOME/plugins/warroom-guard.js"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

INSTALL_PARENT="$(dirname "$INSTALL_DIR")"
INSTALL_NAME="$(basename "$INSTALL_DIR")"

STAGE="$INSTALL_PARENT/.${INSTALL_NAME}.stage.$$"
BACKUP="${INSTALL_DIR}.bak.upgrade.${TIMESTAMP}"

CONFIG_BACKUP=""
GUARD_BACKUP=""

echo "=== WAR ROOM UPGRADE ==="
echo
echo "Source : $SOURCE_ROOT"
echo "Install: $INSTALL_DIR"
echo

require_command() {
  local name="$1"

  if ! command -v "$name" >/dev/null 2>&1; then
    echo "❌ required command missing: $name"
    exit 1
  fi
}

for cmd in \
  bash \
  python3 \
  node \
  npm \
  cp \
  mv \
  rm
do
  require_command "$cmd"
done

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "❌ War Room is not currently installed:"
  echo "   $INSTALL_DIR"
  echo
  echo "Use scripts/install.sh for a fresh installation."
  exit 1
fi

for path in \
  "$SOURCE_ROOT/bin/warroom" \
  "$SOURCE_ROOT/warroom-bridge/bridge.cjs" \
  "$SOURCE_ROOT/warroom-bridge/env-broker.cjs" \
  "$SOURCE_ROOT/warroom-bridge/managed-delegation-wait.cjs" \
  "$SOURCE_ROOT/warroom-bridge/secret-redactor.cjs" \
  "$SOURCE_ROOT/warroom-bridge/mcp.js" \
  "$SOURCE_ROOT/warroom-bridge/supervisor-mcp.js" \
  "$SOURCE_ROOT/warroom-bridge/project-policy-update.cjs" \
  "$SOURCE_ROOT/warroom-bridge/task-router.cjs" \
  "$SOURCE_ROOT/warroom-bridge/package.json" \
  "$SOURCE_ROOT/warroom-bridge/package-lock.json" \
  "$SOURCE_ROOT/plugins/warroom-guard.js" \
  "$SOURCE_ROOT/VERSION"
do
  if [[ ! -f "$path" ]]; then
    echo "❌ required source file missing:"
    echo "   $path"
    exit 1
  fi
done

CURRENT_VERSION="unknown"

if [[ -f "$INSTALL_DIR/VERSION" ]]; then
  CURRENT_VERSION="$(
    tr -d '\r\n' < "$INSTALL_DIR/VERSION"
  )"
fi

NEW_VERSION="$(
  tr -d '\r\n' < "$SOURCE_ROOT/VERSION"
)"

echo "Current version : $CURRENT_VERSION"
echo "New version     : $NEW_VERSION"
echo

cleanup_stage() {
  if [[ -n "${STAGE:-}" ]] &&
     [[ -d "$STAGE" ]]
  then
    rm -rf "$STAGE"
  fi
}

rollback() {
  local status=$?

  if (( status == 0 )); then
    cleanup_stage
    return
  fi

  echo
  echo "❌ upgrade failed"
  echo "→ attempting rollback"

  cleanup_stage

  if [[ -d "$BACKUP" ]]; then
    rm -rf "$INSTALL_DIR" 2>/dev/null || true
    mv "$BACKUP" "$INSTALL_DIR"

    echo "✅ program files rolled back"
  fi

  if [[ -n "$CONFIG_BACKUP" ]] &&
     [[ -f "$CONFIG_BACKUP" ]]
  then
    cp "$CONFIG_BACKUP" "$OPENCODE_CONFIG"
    chmod 600 "$OPENCODE_CONFIG" 2>/dev/null || true

    echo "✅ OpenCode config rolled back"
  fi

  if [[ -n "$GUARD_BACKUP" ]] &&
     [[ -f "$GUARD_BACKUP" ]]
  then
    cp "$GUARD_BACKUP" "$GUARD_TARGET"
    chmod 644 "$GUARD_TARGET" 2>/dev/null || true

    echo "✅ guard rolled back"
  elif [[ -n "$GUARD_BACKUP" ]]; then
    rm -f "$GUARD_TARGET"
  fi

  echo
  echo "Previous War Room installation restored."
  exit "$status"
}

trap rollback EXIT

# ------------------------------------------------------------
# Build complete candidate in staging
# ------------------------------------------------------------

rm -rf "$STAGE"

mkdir -p \
  "$STAGE/bin" \
  "$STAGE/warroom-bridge" \
  "$STAGE/plugins"

cp "$SOURCE_ROOT/bin/warroom" \
   "$STAGE/bin/warroom"

cp "$SOURCE_ROOT/warroom-bridge/bridge.cjs" \
    "$SOURCE_ROOT/warroom-bridge/env-broker.cjs" \
    "$SOURCE_ROOT/warroom-bridge/managed-delegation-wait.cjs" \
   "$SOURCE_ROOT/warroom-bridge/secret-redactor.cjs" \
    "$SOURCE_ROOT/warroom-bridge/managed-task.cjs" \
    "$SOURCE_ROOT/warroom-bridge/mcp.js" \
    "$SOURCE_ROOT/warroom-bridge/message-normalizer.cjs" \
    "$SOURCE_ROOT/warroom-bridge/project-policy-update.cjs" \
    "$SOURCE_ROOT/warroom-bridge/supervisor-mcp.js" \
    "$SOURCE_ROOT/warroom-bridge/task-router.cjs" \
   "$SOURCE_ROOT/warroom-bridge/task-store.cjs" \
   "$SOURCE_ROOT/warroom-bridge/package.json" \
   "$SOURCE_ROOT/warroom-bridge/package-lock.json" \
   "$STAGE/warroom-bridge/"

cp "$SOURCE_ROOT/plugins/warroom-guard.js" \
   "$STAGE/plugins/warroom-guard.js"

cp "$SOURCE_ROOT/VERSION" \
   "$STAGE/VERSION"

chmod 755 \
  "$STAGE/bin/warroom"

chmod 644 \
  "$STAGE/warroom-bridge/bridge.cjs" \
  "$STAGE/warroom-bridge/env-broker.cjs" \
  "$STAGE/warroom-bridge/managed-delegation-wait.cjs" \
  "$STAGE/warroom-bridge/secret-redactor.cjs" \
  "$STAGE/warroom-bridge/managed-task.cjs" \
  "$STAGE/warroom-bridge/mcp.js" \
  "$STAGE/warroom-bridge/message-normalizer.cjs" \
  "$STAGE/warroom-bridge/project-policy-update.cjs" \
  "$STAGE/warroom-bridge/supervisor-mcp.js" \
  "$STAGE/warroom-bridge/task-router.cjs" \
  "$STAGE/warroom-bridge/task-store.cjs" \
  "$STAGE/warroom-bridge/package.json" \
  "$STAGE/warroom-bridge/package-lock.json" \
  "$STAGE/plugins/warroom-guard.js" \
  "$STAGE/VERSION"

echo "→ installing candidate Node dependencies"

npm ci \
  --prefix "$STAGE/warroom-bridge" \
  --omit=dev

echo "→ validating candidate"

bash -n \
  "$STAGE/bin/warroom"

node --check \
  "$STAGE/warroom-bridge/bridge.cjs"

node --check "$STAGE/warroom-bridge/env-broker.cjs"
node --check "$STAGE/warroom-bridge/managed-delegation-wait.cjs"
node --check "$STAGE/warroom-bridge/secret-redactor.cjs"
node --check "$STAGE/warroom-bridge/project-policy-update.cjs"
node --check "$STAGE/warroom-bridge/task-router.cjs"

node --check \
  "$STAGE/warroom-bridge/managed-task.cjs"

node --check \
  "$STAGE/warroom-bridge/mcp.js"

node --check \
  "$STAGE/warroom-bridge/message-normalizer.cjs"

node --check \
  "$STAGE/warroom-bridge/supervisor-mcp.js"

node --check \
  "$STAGE/warroom-bridge/task-store.cjs"

node --check \
  "$STAGE/plugins/warroom-guard.js"

npm list \
  --prefix "$STAGE/warroom-bridge" \
  --depth=0 \
  '@modelcontextprotocol/server' \
  zod \
  >/dev/null

echo "✅ candidate validated"

# ------------------------------------------------------------
# Validate existing OpenCode config before touching install
# ------------------------------------------------------------

mkdir -p \
  "$OPENCODE_HOME/plugins"

if [[ -f "$OPENCODE_CONFIG" ]]; then
  python3 -m json.tool \
    "$OPENCODE_CONFIG" \
    >/dev/null

  CONFIG_BACKUP="${OPENCODE_CONFIG}.bak.upgrade.${TIMESTAMP}"

  cp "$OPENCODE_CONFIG" \
     "$CONFIG_BACKUP"

  chmod 600 "$CONFIG_BACKUP" 2>/dev/null || true
fi

if [[ -f "$GUARD_TARGET" ]]; then
  GUARD_BACKUP="${GUARD_TARGET}.bak.upgrade.${TIMESTAMP}"

  cp "$GUARD_TARGET" \
     "$GUARD_BACKUP"
else
  # Non-empty sentinel tells rollback that the old guard
  # did not exist and a newly installed guard should be removed.
  GUARD_BACKUP="${GUARD_TARGET}.absent.${TIMESTAMP}"
fi

# ------------------------------------------------------------
# Atomic-ish program swap on the same filesystem
# ------------------------------------------------------------

echo "→ activating candidate"

mv "$INSTALL_DIR" \
   "$BACKUP"

mv "$STAGE" \
   "$INSTALL_DIR"

STAGE=""

# ------------------------------------------------------------
# Update installed integration files
# ------------------------------------------------------------

cp "$INSTALL_DIR/plugins/warroom-guard.js" \
   "$GUARD_TARGET"

chmod 644 "$GUARD_TARGET"

python3 - \
  "$OPENCODE_CONFIG" \
  "$INSTALL_DIR/warroom-bridge/mcp.js" <<'PY'
import json
import os
import sys
import tempfile

config_file, mcp_file = sys.argv[1:3]

data = {}

if os.path.exists(config_file):
    with open(config_file) as f:
        loaded = json.load(f)

    if isinstance(loaded, dict):
        data = loaded

mcp = data.get("mcp")

if not isinstance(mcp, dict):
    mcp = {}

mcp["warroom"] = {
    "type": "local",
    "command": [
        "node",
        os.path.realpath(mcp_file),
    ],
}

data["mcp"] = mcp

directory = os.path.dirname(config_file)

os.makedirs(
    directory,
    mode=0o700,
    exist_ok=True,
)

fd, tmp = tempfile.mkstemp(
    dir=directory,
    prefix=".opencode.",
    text=True,
)

try:
    with os.fdopen(fd, "w") as f:
        json.dump(
            data,
            f,
            indent=2,
            sort_keys=True,
        )
        f.write("\n")

    os.chmod(tmp, 0o600)
    os.replace(tmp, config_file)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
PY

# ------------------------------------------------------------
# Final installed validation
# ------------------------------------------------------------

bash -n \
  "$INSTALL_DIR/bin/warroom"

node --check \
  "$INSTALL_DIR/warroom-bridge/bridge.cjs"

node --check \
  "$INSTALL_DIR/warroom-bridge/env-broker.cjs"

node --check \
  "$INSTALL_DIR/warroom-bridge/managed-delegation-wait.cjs"

node --check \
  "$INSTALL_DIR/warroom-bridge/secret-redactor.cjs"

node --check \
  "$INSTALL_DIR/warroom-bridge/project-policy-update.cjs"

node --check \
  "$INSTALL_DIR/warroom-bridge/task-router.cjs"

node --check \
  "$INSTALL_DIR/warroom-bridge/mcp.js"

node --check \
  "$INSTALL_DIR/warroom-bridge/supervisor-mcp.js"

node --check \
  "$INSTALL_DIR/plugins/warroom-guard.js"

npm list \
  --prefix "$INSTALL_DIR/warroom-bridge" \
  --depth=0 \
  '@modelcontextprotocol/server' \
  zod \
  >/dev/null

INSTALLED_VERSION="$(
  tr -d '\r\n' < "$INSTALL_DIR/VERSION"
)"

if [[ "$INSTALLED_VERSION" != "$NEW_VERSION" ]]; then
  echo "❌ installed version mismatch"
  exit 1
fi

trap - EXIT

echo
echo "=== UPGRADE COMPLETE ==="
echo
echo "Previous version:"
echo "  $CURRENT_VERSION"
echo
echo "Installed version:"
echo "  $INSTALLED_VERSION"
echo
echo "Rollback backup:"
echo "  $BACKUP"
echo
echo "User config and ~/.warroom state were not modified."
