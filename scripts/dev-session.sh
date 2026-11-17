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
# Enable red one-pixel outlines only in the isolated development Shell.
export G_OS_DOCK_DEV_MODE=1

SHELL_MAJOR="$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)"
if ((SHELL_MAJOR >= 49)); then
    # GNOME 49 removed --nested; use the Mutter Development Kit instead.
    SHELL_ARGS=(--devkit --wayland)
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

    cd "$ROOT"
    while true; do
        echo
        echo "Starting the isolated GNOME Shell DevKit..."
        gnome-shell "$@" &
        SHELL_PID=$!

        # Wait for the Shell D-Bus name while detecting an early process exit.
        timeout 45s gdbus wait --session org.gnome.Shell &
        WAIT_PID=$!
        while kill -0 "$WAIT_PID" 2>/dev/null; do
            if ! kill -0 "$SHELL_PID" 2>/dev/null; then
                wait "$SHELL_PID" || true
                wait "$WAIT_PID" 2>/dev/null || true
                echo "GNOME Shell exited before its D-Bus service became ready." >&2
                echo "Review the Mutter/GNOME Shell messages above." >&2
                exit 1
            fi
            sleep 0.25
        done
        if ! wait "$WAIT_PID"; then
            echo "GNOME Shell did not expose org.gnome.Shell within 45 seconds." >&2
            exit 1
        fi

        # Exit 75 requests a clean Shell restart after a successful deployment.
        WATCH_STATUS=0
        npm run dev:watch || WATCH_STATUS=$?

        kill "$SHELL_PID" 2>/dev/null || true
        wait "$SHELL_PID" 2>/dev/null || true
        SHELL_PID=""

        if ((WATCH_STATUS == 75)); then
            echo "G-OS Dock refreshed; restarting the nested Shell with the new code."
            continue
        fi

        exit "$WATCH_STATUS"
    done
' _ "$ROOT" "$SHELL_MODE" "${SHELL_ARGS[@]}"
