#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${WARROOM_INSTALL_DIR:-$HOME/.local/share/warroom}"
BIN_DIR="${WARROOM_BIN_DIR:-$HOME/.local/bin}"

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
OPENCODE_HOME="$XDG_CONFIG_HOME/opencode"

BIN_LINK="$BIN_DIR/warroom"
INSTALLED_BIN="$INSTALL_DIR/bin/warroom"

GUARD_TARGET="$OPENCODE_HOME/plugins/warroom-guard.js"
OPENCODE_CONFIG="$OPENCODE_HOME/opencode.json"

echo "=== WAR ROOM UNINSTALLER ==="
echo
echo "Install root:"
echo "  $INSTALL_DIR"
echo

# ------------------------------------------------------------
# Launcher symlink
# ------------------------------------------------------------

if [[ -L "$BIN_LINK" ]]; then
  TARGET="$(readlink -f "$BIN_LINK" 2>/dev/null || true)"

  if [[ "$TARGET" == "$INSTALLED_BIN" ]]; then
    rm -f "$BIN_LINK"
    echo "✅ launcher symlink removed"
  else
    echo "⚠️  launcher symlink points elsewhere; leaving it untouched"
    echo "   $BIN_LINK -> $TARGET"
  fi
elif [[ -e "$BIN_LINK" ]]; then
  echo "⚠️  launcher path is not a symlink; leaving it untouched"
  echo "   $BIN_LINK"
else
  echo "○ launcher symlink already absent"
fi

# ------------------------------------------------------------
# OpenCode MCP registration
# ------------------------------------------------------------

if [[ -f "$OPENCODE_CONFIG" ]]; then
  CONFIG_BACKUP="${OPENCODE_CONFIG}.bak.$(date +%Y%m%d-%H%M%S)"

  cp "$OPENCODE_CONFIG" "$CONFIG_BACKUP"

  python3 - \
    "$OPENCODE_CONFIG" \
    "$INSTALL_DIR/warroom-bridge/mcp.js" <<'PY'
import json
import os
import sys
import tempfile

config_file, installed_mcp = sys.argv[1:3]

with open(config_file) as f:
    data = json.load(f)

mcp = data.get("mcp")

changed = False

if isinstance(mcp, dict):
    entry = mcp.get("warroom")

    if isinstance(entry, dict):
        command = entry.get("command", [])

        actual = [
            os.path.realpath(x)
            for x in command
            if isinstance(x, str)
        ]

        expected = os.path.realpath(installed_mcp)

        if expected in actual:
            del mcp["warroom"]
            changed = True

if changed:
    directory = os.path.dirname(config_file)

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

  echo "✅ OpenCode MCP registration checked"
  echo "   backup: $CONFIG_BACKUP"
else
  echo "○ OpenCode config absent"
fi

# ------------------------------------------------------------
# Installed guard
# ------------------------------------------------------------

if [[ -f "$GUARD_TARGET" ]]; then
  if [[ -f "$INSTALL_DIR/plugins/warroom-guard.js" ]] &&
     cmp -s \
       "$GUARD_TARGET" \
       "$INSTALL_DIR/plugins/warroom-guard.js"
  then
    rm -f "$GUARD_TARGET"
    echo "✅ installed guard removed"
  else
    echo "⚠️  guard differs from installed package; leaving it untouched"
    echo "   $GUARD_TARGET"
  fi
else
  echo "○ installed guard already absent"
fi

# ------------------------------------------------------------
# Program files
# ------------------------------------------------------------

if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  echo "✅ War Room program files removed"
else
  echo "○ install directory already absent"
fi

echo
echo "=== UNINSTALL COMPLETE ==="
echo
echo "Preserved intentionally:"
echo "  ${XDG_CONFIG_HOME}/warroom"
echo "  ${WARROOM_HOME:-$HOME/.warroom}"
echo
echo "Your projects, handoffs, aliases, and War Room config were not deleted."
