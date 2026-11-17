#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_HOME="${G_OS_DOCK_DEV_HOME:-$HOME/.local/share/g-os-dock-dev}"
UUID="g-os-dock@cgreg21.github.io"

for command in dbus-run-session gnome-shell gnome-extensions npm inotifywait; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Missing required command: $command" >&2
        echo "See README.md, section 'Local development environment'." >&2
        exit 1
    fi
done

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

dbus-run-session -- bash -Eeuo pipefail -c '
    ROOT="$1"
    SHELL_MODE="$2"
    trap "kill ${SHELL_PID:-0} 2>/dev/null || true" EXIT INT TERM

    gnome-shell --nested "$SHELL_MODE" &
    SHELL_PID=$!

    # Give GNOME Shell time to create its session bus services.
    for attempt in {1..30}; do
        if ! kill -0 "$SHELL_PID" 2>/dev/null; then
            wait "$SHELL_PID"
            exit $?
        fi
        if gnome-extensions list >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    cd "$ROOT"
    npm run dev:watch
' _ "$ROOT" "$SHELL_MODE"
