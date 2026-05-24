#!/usr/bin/env bash
#
# install.sh — copy-install primer into a target project.
#
# Usage:
#   ./scripts/install.sh <target-project-path>
#
# What it does:
#   1. Verifies bun is on PATH (hard fail) and opencode is on PATH (warn).
#   2. Copies .opencode/ and src/ from this primer repo into the target.
#   3. Copies tsconfig.json only if the target has none.
#   4. Creates a minimal package.json in the target if one is missing.
#   5. Runs `bun add` for primer's runtime dependencies in the target.
#
# Safe to re-run: existing files in the target are preserved (skipped with a
# warning) rather than overwritten.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <target-project-path>" >&2
  exit 2
fi

TARGET="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIMER_DIR="$(dirname "$SCRIPT_DIR")"

err()  { printf 'error: %s\n' "$*" >&2; }
warn() { printf 'warn:  %s\n' "$*" >&2; }
info() { printf '  %s\n' "$*"; }

if ! command -v bun >/dev/null 2>&1; then
  err "bun is not installed or not on PATH. Install from https://bun.sh"
  err "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if ! command -v opencode >/dev/null 2>&1; then
  warn "opencode not found on PATH. You'll need it to run primer commands."
  warn "  install: https://opencode.ai/"
fi

if [ ! -d "$TARGET" ]; then
  err "target directory '$TARGET' does not exist"
  exit 1
fi

TARGET="$(cd "$TARGET" && pwd)"

if [ "$TARGET" = "$PRIMER_DIR" ]; then
  err "target is the primer repo itself — nothing to do"
  exit 1
fi

echo "Installing primer"
echo "  from: $PRIMER_DIR"
echo "  into: $TARGET"
echo

# 1. .opencode/
if [ -e "$TARGET/.opencode" ]; then
  warn ".opencode/ already exists in target — skipping. Remove it and re-run to refresh."
else
  cp -R "$PRIMER_DIR/.opencode" "$TARGET/.opencode"
  info "copied .opencode/"
fi

# 2. src/ — required at project root because the plugin imports ../../src/*.
PRIMER_SRC_FILES=(scanner.ts sync.ts types.ts validator.ts writer.ts)
if [ ! -e "$TARGET/src" ]; then
  cp -R "$PRIMER_DIR/src" "$TARGET/src"
  info "copied src/"
else
  warn "src/ already exists in target — copying primer's source files individually"
  for f in "${PRIMER_SRC_FILES[@]}"; do
    if [ -e "$TARGET/src/$f" ]; then
      warn "  src/$f already exists — skipping (resolve collision manually)"
    else
      cp "$PRIMER_DIR/src/$f" "$TARGET/src/$f"
      info "  copied src/$f"
    fi
  done
fi

# 3. tsconfig.json (optional)
if [ -e "$TARGET/tsconfig.json" ]; then
  info "tsconfig.json present — leaving it alone"
else
  cp "$PRIMER_DIR/tsconfig.json" "$TARGET/tsconfig.json"
  info "copied tsconfig.json"
fi

# 4. package.json — create a minimal one if missing so `bun add` works.
cd "$TARGET"
if [ ! -e "package.json" ]; then
  pkg_name="$(basename "$TARGET")"
  cat > package.json <<EOF
{
  "name": "$pkg_name",
  "version": "0.1.0",
  "type": "module"
}
EOF
  info "created minimal package.json"
fi

# 5. Install runtime deps. `bun add` is idempotent — re-runs are cheap.
echo
echo "Installing dependencies (@opencode-ai/plugin, zod)..."
bun add @opencode-ai/plugin zod@^4.1.0

echo
echo "Done."
echo
echo "Next steps:"
echo "  cd $TARGET"
echo "  opencode"
echo "  Inside opencode, type '/primer-' and select /primer-setup."
