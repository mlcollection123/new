#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Node.js 22.13 or newer is needed. It is a free one-time install."
  echo "Opening the download page. Install the LTS version, then open this file again."
  xdg-open https://nodejs.org/en/download
  read -r -p "Press Enter to close"
  exit 1
fi
node --disable-warning=ExperimentalWarning agent.cjs dashboard --open
