#!/usr/bin/env bash
# Deploys every Edge Function in supabase/functions to the linked Supabase project.
# Run `pnpm sb login` and `pnpm sb link --project-ref <ref>` first, and apply new migrations
# (`pnpm sb db push`) before this. Functions bundle the shared code when they are deployed, so
# after any change to packages/shared they all need redeploying.
set -euo pipefail
cd "$(dirname "$0")/.."
for dir in supabase/functions/*/; do
  name=$(basename "$dir")
  [ "$name" = "_shared" ] && continue
  echo "Deploying $name"
  pnpm sb functions deploy "$name" --use-api
done
echo "Done. Check one: press refresh on the Forecast page, or POST to forecast-cashflow and look for the ml field."
