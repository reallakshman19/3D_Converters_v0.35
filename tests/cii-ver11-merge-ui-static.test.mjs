import assert from 'node:assert/strict';
import fs from 'node:fs';

const addonPath = new URL('../tabs/model-converters/cii-ver11-merge-addon.js', import.meta.url);
const integrationPath = new URL('../tabs/model-converters/cii-merge-dropdown-integration.js', import.meta.url);
const tabPath = new URL('../tabs/model-converters/ModelConvertersTab.js', import.meta.url);
const shimPath = new URL('../tabs/model-converters-tab.js', import.meta.url);

const addon = fs.readFileSync(addonPath, 'utf8');
const integration = fs.readFileSync(integrationPath, 'utf8');
const tab = fs.readFileSync(tabPath, 'utf8');
const shim = fs.readFileSync(shimPath, 'utf8');

assert.match(addon, /CII Ver 11 Merge/);
assert.match(addon, /type="file"[^>]*multiple/);
assert.match(addon, /data-cii-v11-offset/);
assert.match(addon, /--input/);
assert.match(addon, /--offset/);
assert.match(addon, /--allow-node-overlap/);
assert.match(addon, /cii2019_multi_merge\.py/);
assert.match(addon, /cii2019_section_rules\.py/);
assert.match(addon, /Download merged CII/);
assert.match(addon, /Download merge receipt/);
assert.match(addon, /10 → 5010/);
assert.match(addon, /20 → 5020/);
assert.match(addon, /30 → 5030/);

assert.match(integration, /CII Ver 11 Merge Tool/);
assert.match(integration, /cii_ver11_merge_tool/);
assert.match(integration, /#model-converters-select/);
assert.match(integration, /\[data-cii-v11-merge-launcher\]/);
assert.match(integration, /\.remove\(\)/);
assert.match(integration, /stopImmediatePropagation\(\)/);
assert.match(integration, /addEventListener\('change',[\s\S]*true\)/);

assert.match(tab, /installCiiVer11MergeAddon/);
assert.match(tab, /installCiiMergeDropdownIntegration/);
assert.match(tab, /cii-merge-dropdown-integration\.js\?v=20260816-cii-merge-dropdown-1/);
assert.match(tab, /installSafely\('cii-merge-dropdown-integration'/);
assert.match(shim, /20260816-cii-merge-dropdown-1/);

console.log('CII Ver 11 merge dropdown wiring: PASS');
