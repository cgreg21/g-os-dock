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

    echo "==> Installing and reloading G-OS Dock..."
    gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    gnome-extensions install --force "$ARCHIVE"
    gnome-extensions enable "$UUID"
    echo "==> G-OS Dock updated successfully."
}

if ! command -v inotifywait >/dev/null 2>&1; then
    echo "inotifywait is required (package: inotify-tools)." >&2
    exit 1
fi

install_extension || exit 1

echo
echo "Watching project source files (src/, schemas/, metadata.json, stylesheet.css)."
echo "Changes are debounced, compiled, packaged, installed and re-enabled automatically."
echo "Press Ctrl+C to stop."

# inotify-tools does not allow --include and --exclude together.
# The include expression already limits events to the files we build from.
WATCH_INCLUDE='(^|/)(src/.*|schemas/.*|metadata\.json|stylesheet\.css)$'

while true; do
    inotifywait -q -r \
        --include "$WATCH_INCLUDE" \
        -e close_write,create,delete,move \
        "$ROOT" >/dev/null

    # Coalesce editor atomic-save sequences and bursts of changes.
    sleep 0.5
    while inotifywait -q -t 0.2 -r \
        --include "$WATCH_INCLUDE" \
        -e close_write,create,delete,move \
        "$ROOT" >/dev/null 2>&1; do
        sleep 0.2
    done

    install_extension || true
done
