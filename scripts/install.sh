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
BIN_DIR="${WARROOM_BIN_DIR:-$HOME/.local/bin}"

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
OPENCODE_HOME="$XDG_CONFIG_HOME/opencode"

INSTALLED_BIN="$INSTALL_DIR/bin/warroom"
BIN_LINK="$BIN_DIR/warroom"

GUARD_SOURCE="$INSTALL_DIR/plugins/warroom-guard.js"
GUARD_TARGET="$OPENCODE_HOME/plugins/warroom-guard.js"

MCP_FILE="$INSTALL_DIR/warroom-bridge/mcp.js"
OPENCODE_CONFIG="$OPENCODE_HOME/opencode.json"

echo "=== WAR ROOM INSTALLER ==="
echo
echo "Source : $SOURCE_ROOT"
echo "Install: $INSTALL_DIR"
echo "Binary : $BIN_LINK"
echo

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "❌ required command missing: $command_name"
    exit 1
  fi
}

for cmd in \
  bash \
  python3 \
  node \
  npm \
  cp \
  ln \
  rm
do
  require_command "$cmd"
done

for path in \
  "$SOURCE_ROOT/bin/warroom" \
  "$SOURCE_ROOT/warroom-bridge/bridge.cjs" \
  "$SOURCE_ROOT/warroom-bridge/mcp.js" \
  "$SOURCE_ROOT/warroom-bridge/supervisor-mcp.js" \
  "$SOURCE_ROOT/warroom-bridge/package.json" \
  "$SOURCE_ROOT/warroom-bridge/package-lock.json" \
  "$SOURCE_ROOT/plugins/warroom-guard.js"
do
  if [[ ! -f "$path" ]]; then
    echo "❌ required source file missing:"
    echo "   $path"
    exit 1
  fi
done

if [[ -e "$INSTALL_DIR" ]]; then
  BACKUP="${INSTALL_DIR}.bak.$(date +%Y%m%d-%H%M%S)"

  echo "Existing installation detected."
  echo "Backing up to:"
  echo "  $BACKUP"

  mv "$INSTALL_DIR" "$BACKUP"
fi

mkdir -p \
  "$INSTALL_DIR/bin" \
  "$INSTALL_DIR/warroom-bridge" \
  "$INSTALL_DIR/plugins" \
  "$BIN_DIR" \
  "$OPENCODE_HOME/plugins"

cp "$SOURCE_ROOT/bin/warroom" \
   "$INSTALL_DIR/bin/warroom"

cp "$SOURCE_ROOT/warroom-bridge/bridge.cjs" \
   "$SOURCE_ROOT/warroom-bridge/managed-task.cjs" \
   "$SOURCE_ROOT/warroom-bridge/mcp.js" \
   "$SOURCE_ROOT/warroom-bridge/message-normalizer.cjs" \
   "$SOURCE_ROOT/warroom-bridge/supervisor-mcp.js" \
   "$SOURCE_ROOT/warroom-bridge/task-store.cjs" \
   "$SOURCE_ROOT/warroom-bridge/package.json" \
   "$SOURCE_ROOT/warroom-bridge/package-lock.json" \
   "$INSTALL_DIR/warroom-bridge/"

cp "$SOURCE_ROOT/plugins/warroom-guard.js" \
   "$GUARD_SOURCE"

if [[ -f "$SOURCE_ROOT/VERSION" ]]; then
  cp "$SOURCE_ROOT/VERSION" \
     "$INSTALL_DIR/VERSION"
fi

chmod 755 \
  "$INSTALL_DIR/bin/warroom"

chmod 644 \
  "$INSTALL_DIR/warroom-bridge/bridge.cjs" \
  "$INSTALL_DIR/warroom-bridge/managed-task.cjs" \
  "$INSTALL_DIR/warroom-bridge/mcp.js" \
  "$INSTALL_DIR/warroom-bridge/message-normalizer.cjs" \
  "$INSTALL_DIR/warroom-bridge/supervisor-mcp.js" \
  "$INSTALL_DIR/warroom-bridge/task-store.cjs" \
  "$INSTALL_DIR/warroom-bridge/package.json" \
  "$INSTALL_DIR/warroom-bridge/package-lock.json" \
  "$GUARD_SOURCE"

echo
echo "→ installing Node dependencies"

npm ci \
  --prefix "$INSTALL_DIR/warroom-bridge" \
  --omit=dev

echo
echo "→ installing OpenCode guard"

cp "$GUARD_SOURCE" \
   "$GUARD_TARGET"

chmod 644 "$GUARD_TARGET"

echo
echo "→ registering War Room MCP in OpenCode"

if [[ -f "$OPENCODE_CONFIG" ]]; then
  CONFIG_BACKUP="${OPENCODE_CONFIG}.bak.$(date +%Y%m%d-%H%M%S)"

  cp "$OPENCODE_CONFIG" \
     "$CONFIG_BACKUP"

  echo "OpenCode config backup:"
  echo "  $CONFIG_BACKUP"
fi

python3 - \
  "$OPENCODE_CONFIG" \
  "$MCP_FILE" <<'PY'
import json
import os
import sys
import tempfile

config_file, mcp_file = sys.argv[1:3]

data = {}

if os.path.exists(config_file):
    try:
        with open(config_file) as f:
            loaded = json.load(f)

        if isinstance(loaded, dict):
            data = loaded
    except Exception as exc:
        print(
            f"❌ invalid OpenCode config: {exc}",
            file=sys.stderr,
        )
        raise SystemExit(1)

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

echo
echo "→ installing launcher symlink"

rm -f "$BIN_LINK"

ln -s \
  "$INSTALLED_BIN" \
  "$BIN_LINK"

echo
echo "=== INSTALL COMPLETE ==="
echo
echo "Launcher:"
echo "  $BIN_LINK"
echo
echo "Install root:"
echo "  $INSTALL_DIR"
echo
echo "Next steps:"
echo "  1. Ensure $BIN_DIR is in PATH"
echo "  2. Install/configure OpenAI tunnel-client"
echo "  3. Run: warroom setup"
echo "  4. Run: warroom doctor-install"
