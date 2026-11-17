#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="g-os-dock@cgreg21.github.io"
cd "$ROOT"

: "${XDG_DATA_HOME:?XDG_DATA_HOME must point to the isolated DevKit profile}"
EXTENSIONS_DIR="$XDG_DATA_HOME/gnome-shell/extensions"
EXTENSION_DIR="$EXTENSIONS_DIR/$UUID"
STAGING_DIR="$EXTENSIONS_DIR/.$UUID.staging"

install_extension() {
    echo
    echo "==> Building G-OS Dock..."
    if ! npm run build; then
        echo "Build failed; the running extension was left unchanged." >&2
        return 1
    fi

    if [[ ! -f "$ROOT/dist/extension.js" || ! -f "$ROOT/dist/metadata.json" ]]; then
        echo "Build output is incomplete; refusing to replace the installed extension." >&2
        return 1
    fi

    echo "==> Staging compiled files in $EXTENSION_DIR..."
    mkdir -p "$EXTENSIONS_DIR"
    rm -rf "$STAGING_DIR"
    mkdir -p "$STAGING_DIR"
    cp -a "$ROOT/dist/." "$STAGING_DIR/"

    echo "==> Reloading G-OS Dock in the nested Shell..."
    gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    rm -rf "$EXTENSION_DIR"
    mv "$STAGING_DIR" "$EXTENSION_DIR"

    if ! gnome-extensions enable "$UUID"; then
        echo "Could not enable G-OS Dock after deployment." >&2
        return 1
    fi

    echo "==> G-OS Dock deployed from: $EXTENSION_DIR"
    echo "==> G-OS Dock updated successfully."
}

if ! command -v inotifywait >/dev/null 2>&1; then
    echo "inotifywait is required (package: inotify-tools)." >&2
    exit 1
fi

install_extension || exit 1

echo
echo "Watching project source files (src/, schemas/, metadata.json, stylesheet.css)."
echo "Changes are debounced, compiled, copied into the isolated profile and re-enabled automatically."
echo "Press Ctrl+C to stop."

WATCH_INCLUDE='(^|/)(src/.*|schemas/.*|metadata\.json|stylesheet\.css)$'

while true; do
    inotifywait -q -r \
        --include "$WATCH_INCLUDE" \
        -e close_write,create,delete,move \
        "$ROOT" >/dev/null

    sleep 0.5
    while inotifywait -q -t 0.2 -r \
        --include "$WATCH_INCLUDE" \
        -e close_write,create,delete,move \
        "$ROOT" >/dev/null 2>&1; do
        sleep 0.2
    done

    install_extension || true
done
