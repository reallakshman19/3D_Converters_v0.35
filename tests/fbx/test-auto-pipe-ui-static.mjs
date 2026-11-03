import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const toolbar = await readFile(new URL(
  'tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', root), 'utf8');
const selector = await readFile(new URL(
  'tabs/model-converters/fbx-preview-zone-selector.js', root), 'utf8');
const writer = await readFile(new URL(
  'tabs/model-converters/converters/fbx/staged-writer.js', root), 'utf8');

assert.match(toolbar, /Download PIPE inference evidence/);
assert.match(toolbar, /model-converters:fbx-auto-pipe-outputs/);
assert.match(toolbar, /conversionStatus: 'STAGEDJSON_PASS'/);
assert.match(toolbar, /dispatchAutoPipe\(controller, \{ conversionStatus: '', zoneId:/);
assert.match(selector, /auto\?\.zoneId === project\?\.selectedZoneId/);
assert.match(selector, /RUN_OUTPUTS\.get\(container\) \|\| null/);
assert.match(selector, /internal-auto-pipe/);
assert.match(writer, /options\.mappingSchema \|\| 'FbxStagedMapping\.v2'/);
assert.match(writer, /options\.connectivityAuthority \|\| 'explicit-mapping-port-links'/);
assert.doesNotMatch(toolbar, /FbxStagedMapping\.v2/);
console.log('PASS test-auto-pipe-ui-static');
