#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_HOME="${G_OS_DOCK_DEV_HOME:-$HOME/.local/share/g-os-dock-dev}"

bash "$ROOT/scripts/dev-check.sh"

mkdir -p "$DEV_HOME"/{config,data,cache,state}
export XDG_CONFIG_HOME="$DEV_HOME/config"
export XDG_DATA_HOME="$DEV_HOME/data"
export XDG_CACHE_HOME="$DEV_HOME/cache"
export XDG_STATE_HOME="$DEV_HOME/state"
export GSETTINGS_BACKEND=dconf

SHELL_MAJOR="$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)"
if ((SHELL_MAJOR >= 49)); then
    # GNOME 49 removed --nested; use the Mutter Development Kit instead.
    SHELL_ARGS=(--wayland --devkit)
    SHELL_MODE="Wayland devkit"
else
    if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
        SHELL_ARGS=(--nested --wayland)
        SHELL_MODE="nested Wayland"
    else
        SHELL_ARGS=(--nested --x11)
        SHELL_MODE="nested X11"
    fi
fi

echo "Starting an isolated GNOME Shell session ($SHELL_MODE)."
echo "Private GNOME profile: $DEV_HOME"
echo "Close the nested GNOME window or press Ctrl+C here to stop."

# shellcheck disable=SC2016 # The nested script must expand variables in its own shell.
dbus-run-session -- bash -Eeuo pipefail -c '
    ROOT="$1"
    shift 2
    SHELL_PID=""
    cleanup() {
        if [[ -n "$SHELL_PID" ]]; then
            kill "$SHELL_PID" 2>/dev/null || true
            wait "$SHELL_PID" 2>/dev/null || true
        fi
    }
    trap cleanup EXIT INT TERM

    gnome-shell "$@" &
    SHELL_PID=$!

    # Wait until the nested Shell owns its D-Bus name before using gnome-extensions.
    if ! timeout 45s gdbus wait --session org.gnome.Shell; then
        echo "Nested GNOME Shell did not become ready within 45 seconds." >&2
        exit 1
    fi

    cd "$ROOT"
    npm run dev:watch
' _ "$ROOT" "$SHELL_MODE" "${SHELL_ARGS[@]}"
