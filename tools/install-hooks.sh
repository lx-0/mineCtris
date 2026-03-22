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
# pre-push hook — runs smoke test and secrets scan before allowing a push.
# Install with: bash tools/install-hooks.sh

echo "Running smoke test before push..."
node tools/smoke-test.js

if [ $? -ne 0 ]; then
  echo ""
  echo "Push blocked: smoke test failed. Fix the errors above and try again."
  exit 1
fi

echo ""
echo "Running secrets scan before push..."
bash tools/scan-secrets.sh

if [ $? -ne 0 ]; then
  echo ""
  echo "Push blocked: secrets detected. Fix the errors above and try again."
  exit 1
fi
HOOK

chmod +x "$HOOKS_DIR/pre-push"

# Install pre-commit hook (secrets scan on staged files)
cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/bin/sh
#
# pre-commit hook — scans staged files for secrets.
# Install with: bash tools/install-hooks.sh

echo "Scanning staged files for secrets..."
bash tools/scan-secrets.sh --staged

if [ $? -ne 0 ]; then
  echo ""
  echo "Commit blocked: secrets detected. Fix the errors above and try again."
  exit 1
fi
HOOK

chmod +x "$HOOKS_DIR/pre-commit"

echo "Git hooks installed successfully."
echo "  - pre-push: runs smoke test (tools/smoke-test.js) + secrets scan (tools/scan-secrets.sh)"
echo "  - pre-commit: runs secrets scan on staged files (tools/scan-secrets.sh --staged)"
