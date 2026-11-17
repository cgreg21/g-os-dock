#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

missing=()
for tool in node npm dbus-run-session gnome-shell gnome-extensions gdbus gsettings timeout inotifywait glib-compile-schemas zip; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        missing+=("$tool")
    fi
done

if (("${#missing[@]}" > 0)); then
    printf 'Missing development dependencies: %s\n' "${missing[*]}" >&2
    echo "Install the tools listed in README.md (Local development environment)." >&2
    exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if ((NODE_MAJOR < 20)); then
    echo "Node.js 20 or newer is required; detected $(node --version)." >&2
    exit 1
fi

SHELL_VERSION="$(gnome-shell --version 2>/dev/null || true)"
if [[ ! "$SHELL_VERSION" =~ GNOME\ Shell\ 51([.]|$) ]]; then
    echo "G-OS Dock targets GNOME Shell 51.x; detected: ${SHELL_VERSION:-unknown}." >&2
    exit 1
fi

if [[ -z "${WAYLAND_DISPLAY:-}" && -z "${DISPLAY:-}" ]]; then
    echo "No graphical display detected. Start this command from a desktop session." >&2
    exit 1
fi

SHELL_MAJOR="${SHELL_VERSION#GNOME Shell }"
SHELL_MAJOR="${SHELL_MAJOR%%.*}"
if ((SHELL_MAJOR >= 49)); then
    if [[ ! -x /usr/libexec/mutter-devkit && ! -x /usr/lib/mutter-devkit ]]; then
        echo "GNOME ${SHELL_MAJOR} removed --nested and requires the Mutter Development Kit." >&2
        echo "Install mutter-devkit (CachyOS/Fedora) or mutter-dev-bin (Ubuntu/Debian)." >&2
        exit 1
    fi
fi

echo "Development environment checks passed."
echo "Node.js: $(node --version)"
echo "$SHELL_VERSION"
if ((SHELL_MAJOR >= 49)); then
    echo "Nested backend: Mutter Development Kit (--devkit)"
else
    echo "Nested backend: legacy --nested"
fi
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    echo "Display backend: Wayland"
else
    echo "Display backend: X11"
fi
