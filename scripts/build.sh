#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v npm >/dev/null || { echo 'npm is required' >&2; exit 1; }
command -v glib-compile-schemas >/dev/null || { echo 'glib-compile-schemas is required' >&2; exit 1; }
npm install
npm run build
