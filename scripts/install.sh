#!/usr/bin/env bash
#
# install.sh — copy-install primer into a target project.
#
# Usage:
#   ./scripts/install.sh <target-project-path>
#
# What it does:
#   1. Verifies bun is on PATH (hard fail) and opencode is on PATH (warn).
#   2. Copies .opencode/, src/, and docs/RECOVERY.md from this primer repo into
#      the target.
#   3. Copies tsconfig.json only if the target has none.
#   4. Creates a minimal package.json in the target if one is missing.
#   5. Runs `bun add` for primer's runtime dependencies in the target.
#   6. Appends every path it touched to .git/info/exclude in the target so
#      primer's machinery doesn't show up in the target project's git status.
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

# Paths created or installed by this run. Appended to .git/info/exclude at the
# end so the target project's git status stays clean.
INSTALLED_PATHS=()

# 1. .opencode/
if [ -e "$TARGET/.opencode" ]; then
  warn ".opencode/ already exists in target — skipping. Remove it and re-run to refresh."
else
  cp -R "$PRIMER_DIR/.opencode" "$TARGET/.opencode"
  info "copied .opencode/"
  INSTALLED_PATHS+=(".opencode/")
fi

# 1b. docs/RECOVERY.md — primer's operating manual; every command points at it
# when a precondition fails. Shipped statically so /primer-setup never has to
# regenerate it from an inline copy.
if [ -e "$TARGET/docs/RECOVERY.md" ]; then
  warn "docs/RECOVERY.md already exists in target — skipping."
else
  mkdir -p "$TARGET/docs"
  cp "$PRIMER_DIR/docs/RECOVERY.md" "$TARGET/docs/RECOVERY.md"
  info "copied docs/RECOVERY.md"
  INSTALLED_PATHS+=("docs/RECOVERY.md")
fi

# 2. src/ — required at project root because the plugin imports ../../src/*.
PRIMER_SRC_FILES=(scanner.ts sync.ts types.ts validator.ts writer.ts)
if [ ! -e "$TARGET/src" ]; then
  cp -R "$PRIMER_DIR/src" "$TARGET/src"
  info "copied src/"
  # Exclude only primer's source files, not the whole src/ tree — the user
  # may add their own files there later and we don't want to hide them.
  for f in "${PRIMER_SRC_FILES[@]}"; do
    INSTALLED_PATHS+=("src/$f")
  done
else
  warn "src/ already exists in target — copying primer's source files individually"
  for f in "${PRIMER_SRC_FILES[@]}"; do
    if [ -e "$TARGET/src/$f" ]; then
      warn "  src/$f already exists — skipping (resolve collision manually)"
    else
      cp "$PRIMER_DIR/src/$f" "$TARGET/src/$f"
      info "  copied src/$f"
      INSTALLED_PATHS+=("src/$f")
    fi
  done
fi

# 3. tsconfig.json (optional)
if [ -e "$TARGET/tsconfig.json" ]; then
  info "tsconfig.json present — leaving it alone"
else
  cp "$PRIMER_DIR/tsconfig.json" "$TARGET/tsconfig.json"
  info "copied tsconfig.json"
  INSTALLED_PATHS+=("tsconfig.json")
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
  INSTALLED_PATHS+=("package.json")
fi

# 5. Install runtime deps. `bun add` is idempotent — re-runs are cheap.
echo
echo "Installing dependencies (@opencode-ai/plugin, zod)..."
HAD_NODE_MODULES=0
[ -e "$TARGET/node_modules" ] && HAD_NODE_MODULES=1
HAD_BUN_LOCK=0
[ -e "$TARGET/bun.lock" ] && HAD_BUN_LOCK=1

bun add @opencode-ai/plugin zod@^4.1.0

# Only mark node_modules / bun.lock as primer's footprint if this run created
# them — otherwise we'd be hiding the user's own dependency tree.
if [ "$HAD_NODE_MODULES" -eq 0 ] && [ -e "$TARGET/node_modules" ]; then
  INSTALLED_PATHS+=("node_modules/")
fi
if [ "$HAD_BUN_LOCK" -eq 0 ] && [ -e "$TARGET/bun.lock" ]; then
  INSTALLED_PATHS+=("bun.lock")
fi

# 6. Append installed paths to .git/info/exclude so they don't pollute git
# status in the target. .git/info/exclude is local-only (not committed), which
# is what we want — primer is per-developer tooling, not project source.
echo
if [ ! -d "$TARGET/.git" ]; then
  warn "target is not a git repository — skipping .git/info/exclude update"
  warn "  if you later run 'git init', add these paths manually:"
  for p in "${INSTALLED_PATHS[@]}"; do
    warn "    $p"
  done
elif [ "${#INSTALLED_PATHS[@]}" -eq 0 ]; then
  info "nothing newly installed — .git/info/exclude unchanged"
else
  EXCLUDE_FILE="$TARGET/.git/info/exclude"
  mkdir -p "$TARGET/.git/info"
  touch "$EXCLUDE_FILE"

  HEADER="# primer (added by scripts/install.sh)"
  added=()
  if ! grep -qxF "$HEADER" "$EXCLUDE_FILE"; then
    printf '\n%s\n' "$HEADER" >> "$EXCLUDE_FILE"
  fi
  for p in "${INSTALLED_PATHS[@]}"; do
    if ! grep -qxF "$p" "$EXCLUDE_FILE"; then
      printf '%s\n' "$p" >> "$EXCLUDE_FILE"
      added+=("$p")
    fi
  done

  if [ "${#added[@]}" -eq 0 ]; then
    info "all installed paths already in .git/info/exclude"
  else
    echo "Excluded from target git status (.git/info/exclude):"
    for p in "${added[@]}"; do
      info "$p"
    done
  fi
fi

echo
echo "Done."
echo
echo "Next steps:"
echo "  cd $TARGET"
echo "  opencode"
echo "  Inside opencode, type '/primer-' and select /primer-setup."
