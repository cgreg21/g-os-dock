#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -r /etc/os-release ]]; then
    echo "Cannot identify the operating system (/etc/os-release is missing)." >&2
    exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release

if [[ "${ID:-}" != "fedora" || "${VERSION_ID:-}" != "45" ]]; then
    echo "This installer targets Fedora 45; detected ${PRETTY_NAME:-unknown}." >&2
    exit 1
fi

if ! command -v dnf >/dev/null 2>&1; then
    echo "dnf is required to install Fedora development dependencies." >&2
    exit 1
fi

PACKAGES=(
    coreutils
    dbus-daemon
    glib2
    gnome-session
    gnome-shell
    inotify-tools
    mutter-devkit
    nodejs
    npm
    zip
)

echo "Installing G-OS Dock development dependencies for Fedora 45..."
sudo dnf install -y "${PACKAGES[@]}"

echo
echo "Installed desktop components:"
gnome-shell --version
rpm -q mutter-devkit

echo
echo "Next steps (from the G-OS Dock repository):"
echo "  npm install"
echo "  npm run dev:check"
echo "  npm run dev"
