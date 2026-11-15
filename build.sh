#!/bin/bash
set -e

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SRC_DIR/dist"

mkdir -p "$DIST_DIR"

echo "Building DompetKu with build.sh..."
node "$SRC_DIR/build.js"
echo "Build finished."
