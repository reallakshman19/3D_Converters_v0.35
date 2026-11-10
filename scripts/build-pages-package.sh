#!/usr/bin/env bash
set -euo pipefail
# Deterministic GitHub Pages payload: preserve application JS, Python
# converter modules, Pyodide/WASM, and R1/R3 audit resources.
root="$(cd "$(dirname "$0")/.." && pwd)"
target="$1"
if [[ -z "$target" ]]; then echo 'usage: build-pages-package.sh TARGET_DIR' >&2; exit 2; fi
mkdir -p "$target"
target="$(cd "$target" && pwd)"
if [[ "$target" == "$root" || "$target" == "$root/"* ]]; then
  echo "Refusing staging directory inside source repository" >&2; exit 2
fi

rsync -a --delete --exclude='/.git/' --exclude='/.github/' \
  --exclude='/.backups/' --exclude='/.node140-transfer/' \
  --exclude='/.agents/' --exclude='/.claude/' \
  --exclude='/Benchmarks/' --exclude='/Sample/' \
  --exclude='/node-history/' --exclude='/tests/' \
  --exclude='/roundtrip-evidence/' \
  --exclude='/system_logs_backup*.zip' \
  --exclude='/legacy_before.js' --exclude='/legacy_after.js' \
  --exclude='/temp_before.py' --exclude='/temp_after.py' \
  --exclude='/test*.cii' --exclude='/output.cii' \
  --exclude='/test.xml' --exclude='/test_config.json' \
  --exclude='/test_pyodide.js' --exclude='/test_normalizer.js' \
  --exclude='/node_modules/' --exclude='/__pycache__/' \
  --exclude='*.pyc' --exclude='*.log' \
  "$root/" "$target/"

for required in \
  index.html site.webmanifest .nojekyll \
  main-rhbg-fitguard.js \
  tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js \
  tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js \
  converters/xml-cii-2019-standalone/engine.js \
  converters/scripts/xml_to_cii2019_runtime_custody.py \
  converters/scripts/xml_to_cii2019.py \
  converters/scripts/xml_to_cii2019_patched.py \
  vendor/pyodide/pyodide.mjs \
  roundtrip_foundation/lineage.py \
  roundtrip_fidelity/field_lineage.py; do
  if [[ ! -s "$target/$required" ]]; then
    echo "HOLD_RUNTIME_ASSET_MISSING: $required" >&2; exit 2
  fi
done
printf 'PAGES_STAGING_SHA256='
sha256sum "$target/index.html" | awk '{print $1}'
printf 'PAGES_STAGING_FILES='
find "$target" -type f | wc -l
printf 'PAGES_STAGING_BYTES='
du -sb "$target" | awk '{print $1}'
