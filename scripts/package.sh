#!/bin/bash
# Builds release/lead-agent.zip: the bundle, launchers and the setup guide.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf release/stage && mkdir -p release/stage/lead-agent
cp dist/agent.cjs installer/* .env.example release/stage/lead-agent/
(cd release/stage && rm -f ../lead-agent.zip && zip -qr ../lead-agent.zip lead-agent)
rm -rf release/stage
ls -la release/lead-agent.zip
