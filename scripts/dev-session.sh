#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_HOME="${G_OS_DOCK_DEV_HOME:-$HOME/.local/share/g-os-dock-dev}"

for command in dbus-run-session gnome-shell gnome-extensions npm inotifywait gdbus timeout; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Missing required command: $command" >&2
        echo "See README.md, section 'Local development environment'." >&2
        exit 1
    fi
done

SHELL_VERSION="$(gnome-shell --version | grep -oE '[0-9]+' | head -n1 || true)"
if [[ "$SHELL_VERSION" != "51" ]]; then
    echo "G-OS Dock targets GNOME Shell 51; detected: $(gnome-shell --version)." >&2
    exit 1
fi

if [[ -z "${WAYLAND_DISPLAY:-}" && -z "${DISPLAY:-}" ]]; then
    echo "No graphical display detected. Start this script from your desktop session." >&2
    exit 1
fi

mkdir -p "$DEV_HOME"/{config,data,cache,state}
export XDG_CONFIG_HOME="$DEV_HOME/config"
export XDG_DATA_HOME="$DEV_HOME/data"
export XDG_CACHE_HOME="$DEV_HOME/cache"
export XDG_STATE_HOME="$DEV_HOME/state"
export GSETTINGS_BACKEND=dconf

if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    SHELL_MODE="--wayland"
else
    SHELL_MODE="--x11"
fi

echo "Starting an isolated nested GNOME Shell session ($SHELL_MODE)."
echo "Private GNOME profile: $DEV_HOME"
echo "Close the nested GNOME window or press Ctrl+C here to stop."

# shellcheck disable=SC2016 # The nested script must expand variables in its own shell.
dbus-run-session -- bash -Eeuo pipefail -c '
    ROOT="$1"
    SHELL_MODE="$2"
    SHELL_PID=""
    cleanup() {
        if [[ -n "$SHELL_PID" ]]; then
            kill "$SHELL_PID" 2>/dev/null || true
            wait "$SHELL_PID" 2>/dev/null || true
        fi
    }
    trap cleanup EXIT INT TERM

    gnome-shell --nested "$SHELL_MODE" &
    SHELL_PID=$!

    # Wait until the nested Shell owns its D-Bus name before using gnome-extensions.
    if ! timeout 45s gdbus wait --session org.gnome.Shell; then
        echo "Nested GNOME Shell did not become ready within 45 seconds." >&2
        exit 1
    fi

    cd "$ROOT"
    npm run dev:watch
' _ "$ROOT" "$SHELL_MODE"
