#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${1:-$ROOT/backups/boomboom-$STAMP}"

mkdir -p "$DEST"

copy_if_present() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cp -a "$file" "$DEST/"
  fi
}

copy_if_present "$DATA_DIR/boomboom.sqlite"
copy_if_present "$DATA_DIR/boomboom.sqlite-wal"
copy_if_present "$DATA_DIR/boomboom.sqlite-shm"

echo "Backup written to $DEST"
ls -lh "$DEST"
