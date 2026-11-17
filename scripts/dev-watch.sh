#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="g-os-dock@cgreg21.github.io"
ARCHIVE="$ROOT/$UUID.zip"
cd "$ROOT"

install_extension() {
    echo
    echo "==> Building G-OS Dock..."
    if ! npm run pack; then
        echo "Build failed; the running extension was left unchanged." >&2
        return 1
    fi

    echo "==> Reloading extension in the nested GNOME session..."
    gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    gnome-extensions install --force "$ARCHIVE"
    gnome-extensions enable "$UUID"
    echo "==> G-OS Dock updated."
}

if ! command -v inotifywait >/dev/null 2>&1; then
    echo "inotifywait is required (package: inotify-tools)." >&2
    exit 1
fi

install_extension || exit 1

echo
echo "Watching src/, schemas/, metadata.json and stylesheet.css."
echo "Edit a file to compile, package, install and reload automatically."
echo "Press Ctrl+C to stop."

while true; do
    inotifywait -q -r -e close_write,create,delete,move \
        "$ROOT/src" "$ROOT/schemas" "$ROOT/metadata.json" "$ROOT/stylesheet.css" >/dev/null

    # Coalesce bursts of editor save events into one build.
    sleep 0.4
    while inotifywait -q -t 0.2 -r -e close_write,create,delete,move \
        "$ROOT/src" "$ROOT/schemas" "$ROOT/metadata.json" "$ROOT/stylesheet.css" >/dev/null 2>&1; do
        sleep 0.2
    done

    install_extension || true
done
