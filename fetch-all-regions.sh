#!/bin/bash
# fetch-all-regions.sh
# Fetches OSM data for all regions sequentially with a 30s pause between each
# to avoid rate-limiting on the public Overpass API.
# Skips regions that already have a cache file.

REGIONS=(
  "grand-teton"
  "rocky-mountain-np"
  "mount-rainier"
  "wind-river-range"
  "john-muir-wilderness"
  "yosemite-backcountry"
  "north-cascades"
  "olympic-national-park"
  "maroon-bells-snowmass"
  "zion-backcountry"
  "bryce-canyon"
  "grand-canyon-backcountry"
  "enchantments-alpine-lakes"
  "bob-marshall-wilderness"
  "desolation-wilderness"
  "weminuche-wilderness"
  "adirondack-high-peaks"
  "white-mountains"
  "great-smoky-mountains"
)

DIR="$(cd "$(dirname "$0")" && pwd)"

for region in "${REGIONS[@]}"; do
  CACHE="$DIR/cache/${region}.json"
  if [ -f "$CACHE" ]; then
    echo "[$region] Already cached — skipping"
    continue
  fi
  echo ""
  echo "[$region] Fetching..."
  node "$DIR/fetch-overpass.js" --region="$region"
  if [ $? -ne 0 ]; then
    echo "[$region] FAILED — will retry on next run"
  else
    echo "[$region] Done. Waiting 90s before next fetch..."
    sleep 90
  fi
done

echo ""
echo "All fetches complete. Cache files in $DIR/cache/"
ls -lh "$DIR/cache/"*.json 2>/dev/null | grep -v elevation | grep -v graph | grep -v clusters
