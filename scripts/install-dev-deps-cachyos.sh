#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v pacman >/dev/null 2>&1; then
    echo "This installer is intended for CachyOS (pacman-based systems)." >&2
    exit 1
fi

PACKAGES=(
    coreutils
    dbus
    glib2
    gnome-shell
    gnome-session
    inotify-tools
    nodejs
    npm
    zip
)

echo "Installing G-OS Dock development dependencies for CachyOS..."
sudo pacman -S --needed "${PACKAGES[@]}"

echo
echo "Installed GNOME Shell version:"
gnome-shell --version

echo
echo "Next steps:"
echo "  npm install"
echo "  npm run dev:check"
echo "  npm run dev"
echo
echo "The dev check requires GNOME Shell 51.x. If CachyOS currently ships"
echo "another GNOME version, update to GNOME 51 before launching the test session."
