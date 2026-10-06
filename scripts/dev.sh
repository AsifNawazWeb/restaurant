#!/bin/bash
# Dev launcher for RestoPulse POS (Linux sandbox workaround baked in)
cd "$(dirname "$0")/.."
export ELECTRON_DISABLE_SANDBOX=1
exec npx electron-vite dev "$@"
