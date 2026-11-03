import assert from 'node:assert/strict';
import fs from 'node:fs';

const addon = fs.readFileSync(new URL('../tabs/model-converters/cii-ver14-merge-addon.js', import.meta.url), 'utf8');
const integration = fs.readFileSync(new URL('../tabs/model-converters/cii-merge-dropdown-integration.js', import.meta.url), 'utf8');
const tab = fs.readFileSync(new URL('../tabs/model-converters/ModelConvertersTab.js', import.meta.url), 'utf8');
const managed = fs.readFileSync(new URL('../tabs/model-converters/ModelConvertersTab-fbx2-managed-reference.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../tabs/model-converters/index.js', import.meta.url), 'utf8');
const shim = fs.readFileSync(new URL('../tabs/model-converters-tab.js', import.meta.url), 'utf8');

assert.match(addon, /CII Ver 14 Merge/);
assert.match(addon, /type="file"[^>]*multiple/);
assert.match(addon, /data-cii-v14-offset/);
assert.match(addon, /--input/);
assert.match(addon, /--offset/);
assert.match(addon, /--allow-node-overlap/);
assert.match(addon, /cii14_multi_merge\.py/);
assert.match(addon, /cii14_section_rules\.py/);
assert.match(addon, /cii2019_section_rules\.py/);
assert.match(addon, /Qualified-v1 boundary/);
assert.match(addon, /SIF&amp;TEES uses 14 rows\/record/);
assert.match(addon, /REDUCERS uses 2 rows\/record/);
assert.match(addon, /Download merged CII/);
assert.match(addon, /Download merge receipt/);
assert.match(addon, /10 → 5010/);

assert.match(integration, /CII Ver 14 Merge Tool/);
assert.match(integration, /cii_ver14_merge_tool/);
assert.match(integration, /#model-converters-select/);
assert.match(integration, /\[data-cii-v14-merge-launcher\]/);
assert.match(integration, /\.remove\(\)/);
assert.match(integration, /stopImmediatePropagation\(\)/);
assert.match(integration, /addEventListener\('change',[\s\S]*true\)/);

assert.match(tab, /installCiiVer14MergeAddon/);
assert.match(tab, /installCiiMergeDropdownIntegration/);
assert.match(tab, /cii-merge-dropdown-integration\.js\?v=20260816-cii-merge-dropdown-1/);
assert.match(tab, /installSafely\('cii-merge-dropdown-integration'/);
assert.match(managed, /20260816-cii-merge-dropdown-1/);
assert.match(index, /20260816-cii-merge-dropdown-1/);
assert.match(shim, /20260816-cii-merge-dropdown-1/);

console.log('CII Ver 14 merge dropdown wiring: PASS');
