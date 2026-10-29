#!/bin/bash
# Builds release/VATcube-Leads-Generator.zip: the bundle, launchers and the setup guide.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf release/stage && mkdir -p release/stage/VATcube-Leads-Generator
cp dist/agent.cjs installer/* .env.example THIRD-PARTY-NOTICES.md release/stage/VATcube-Leads-Generator/
(cd release/stage && rm -f ../VATcube-Leads-Generator.zip && zip -qr ../VATcube-Leads-Generator.zip VATcube-Leads-Generator)
rm -rf release/stage
ls -la release/VATcube-Leads-Generator.zip
