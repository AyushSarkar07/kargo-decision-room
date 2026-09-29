#!/usr/bin/env bash
# Deploys the committed tree (no working-tree files, no git metadata) to Vercel production.
# Use this while the GitHub commit author is not linked to the Vercel account, which makes
# Vercel block deployments that carry git metadata. Only committed files are uploaded.
set -euo pipefail
ref="${1:-HEAD}"
out="$(mktemp -d)"
git archive "$ref" | tar -x -C "$out"
mkdir -p "$out/.vercel" && cp .vercel/project.json "$out/.vercel/"
(cd "$out" && vercel deploy --prod --yes)
rm -rf "$out"
