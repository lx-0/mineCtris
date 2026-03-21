#!/bin/bash
#
# Installs git hooks for the MineCtris project.
# Usage: bash tools/install-hooks.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

# Install pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'HOOK'
#!/bin/sh
#
# pre-push hook — runs smoke test before allowing a push.
# Install with: bash tools/install-hooks.sh

echo "Running smoke test before push..."
node tools/smoke-test.js

if [ $? -ne 0 ]; then
  echo ""
  echo "Push blocked: smoke test failed. Fix the errors above and try again."
  exit 1
fi
HOOK

chmod +x "$HOOKS_DIR/pre-push"

echo "Git hooks installed successfully."
echo "  - pre-push: runs smoke test (tools/smoke-test.js)"
