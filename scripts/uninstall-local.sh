#!/usr/bin/env bash
set -euo pipefail
gnome-extensions disable g-os-dock@cgreg21.github.io || true
gnome-extensions uninstall g-os-dock@cgreg21.github.io
