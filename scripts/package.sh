#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run pack
printf 'Extension archive: %s\n' "$PWD/g-os-dock@cgreg21.github.io.zip"
