#!/usr/bin/env bash
# Stop hook: forks the extraction worker as a detached subprocess and returns immediately.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/fork-extract-worker.sh"
