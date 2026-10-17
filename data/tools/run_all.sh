#!/bin/sh
# Rebuild, verify and audit all regions into the app's data folder.
# Inputs outside the repo: CLIO (Cliopatria polities GeoJSON) and NE (Natural Earth admin-0 countries GeoJSON).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
D=${D:-$HERE/..}
C=${CLIO:-/root/tl/src/clio_unzipped/cliopatria_polities_only_v021.geojson}
N=${NE:-/root/tl/ne/ne_50m_admin_0_countries.geojson}
cd "$HERE"
for r in europe americas oceania africa-middle-east asia; do
  python3 -I build_region.py $r $C $N $D
  python3 -I verify_region.py $r $D $C $N | grep -v "^   ("
done
python3 -I audit_coverage.py $C $N $D --json $D/_coverage.json | tail -5
python3 -I audit_events.py $N $D --json $D/_coverage.json
