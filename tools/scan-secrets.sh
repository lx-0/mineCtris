#!/bin/bash
#
# Scans staged/committed code for secrets using gitleaks.
# Usage:
#   bash tools/scan-secrets.sh           # scan pre-push (commits not on remote)
#   bash tools/scan-secrets.sh --staged  # scan staged files only (pre-commit)
#
# If gitleaks is not installed, it will be downloaded automatically.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GITLEAKS_VERSION="8.21.2"
GITLEAKS_BIN="$REPO_ROOT/.gitleaks/gitleaks"

install_gitleaks() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Unsupported architecture: $arch"; exit 1 ;;
  esac

  local os
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"

  local url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${os}_${arch}.tar.gz"

  echo "Installing gitleaks v${GITLEAKS_VERSION}..."
  mkdir -p "$REPO_ROOT/.gitleaks"
  curl -sL "$url" | tar xz -C "$REPO_ROOT/.gitleaks" gitleaks
  chmod +x "$GITLEAKS_BIN"
  echo "gitleaks installed to $GITLEAKS_BIN"
}

# Use system gitleaks if available, otherwise download
if command -v gitleaks &>/dev/null; then
  GITLEAKS_CMD="gitleaks"
elif [ -x "$GITLEAKS_BIN" ]; then
  GITLEAKS_CMD="$GITLEAKS_BIN"
else
  install_gitleaks
  GITLEAKS_CMD="$GITLEAKS_BIN"
fi

CONFIG_FLAG=""
if [ -f "$REPO_ROOT/.gitleaks.toml" ]; then
  CONFIG_FLAG="--config=$REPO_ROOT/.gitleaks.toml"
fi

echo "Scanning for secrets..."

if [ "$1" = "--staged" ]; then
  # Scan only staged changes (useful as pre-commit hook)
  $GITLEAKS_CMD protect --staged $CONFIG_FLAG --verbose
else
  # Scan the repo for secrets in git history (pre-push)
  $GITLEAKS_CMD detect --source="$REPO_ROOT" $CONFIG_FLAG --verbose
fi

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "Secrets detected! Fix the issues above before pushing."
  echo "If a finding is a false positive, add it to .gitleaks.toml allowlist."
  exit 1
else
  echo "No secrets detected."
fi
