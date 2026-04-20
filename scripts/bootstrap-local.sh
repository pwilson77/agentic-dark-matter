#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.localchain ]]; then
  cp .env.localchain.example .env.localchain
  echo "Created .env.localchain from template."
fi

if ! command -v anvil >/dev/null 2>&1; then
  if [[ -x "$HOME/.foundry/bin/anvil" ]]; then
    export PATH="$HOME/.foundry/bin:$PATH"
  fi
fi

if ! command -v anvil >/dev/null 2>&1; then
  echo "anvil not found. Install Foundry first: https://book.getfoundry.sh/getting-started/installation"
  exit 1
fi

echo "Running dark matter demo in local mode..."
npm run dark-matter:demo:local
