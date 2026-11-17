#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run pack
gnome-extensions install --force g-os-dock@cgreg21.github.io.zip
printf 'Installed. Enable with: gnome-extensions enable g-os-dock@cgreg21.github.io\n'
