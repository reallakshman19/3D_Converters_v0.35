import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [runner, review, wrapper, index, shim, zip, inputs, promotion] = await Promise.all([
  read('tabs/model-converters/converters/fbx-to-stagedjson.js'),
  read('tabs/model-converters/fbx-review-ui-addon.js'),
  read('tabs/model-converters/ModelConvertersTab-fbx2-managed-reference.js'),
  read('tabs/model-converters/index.js'),
  read('tabs/model-converters-tab.js'),
  read('tabs/model-converters/converters/fbx/browser-zip.js'),
  read('tabs/model-converters/converters/fbx/fbx2-browser-inputs.js'),
  read('tabs/model-converters/converters/fbx/selected-zone-promotion.js'),
]);

assert.match(runner, /resolveBrowserFbxPrimary/);
assert.match(runner, /resolveBrowserFbxSecondary/);
assert.match(runner, /stagedBranches: managed\.value/);
assert.match(runner, /mappedStageStatus: 'MAPPED_STAGE_AVAILABLE'/);
assert.match(runner, /MANAGED_STAGE_ZONE_NOT_FOUND/);
assert.match(runner, /BLOCKED_MANAGED_STAGE_REFERENCE/);
assert.match(runner, /governed-fbx2-profile/);
assert.match(runner, /MAPPING_NOT_REQUIRED_MANAGED_REFERENCE/);
assert.match(runner, /T0_QUALIFICATION_NOT_EXECUTED/);
assert.match(review, /primaryAccept = '\.fbx,\.FBX,\.zip,\.ZIP'/);
assert.match(review, /secondaryAccept = '\.fbxmap\.json,\.json,\.JSON,\.zip,\.ZIP'/);
assert.match(review, /Managed Reference Zone Label/);
assert.match(review, /20260802-fbx2-managed-reference-1/);
assert.match(wrapper, /installFbxReviewUiAddon\(\)/);
assert.match(index, /ModelConvertersTab-fbx2-managed-reference/);
assert.match(shim, /20260802-fbx2-managed-reference-1/);
assert.match(zip, /ZIP_UNSAFE_PATH/);
assert.match(zip, /ZIP_CRC_MISMATCH/);
assert.match(zip, /ZIP_LOCAL_NAME_MISMATCH/);
assert.match(zip, /ZIP_DUPLICATE_ENTRY/);
assert.match(zip, /ZIP_TOTAL_SIZE_LIMIT_EXCEEDED/);
assert.match(inputs, /STF_2026Jul23-1554_binary\.zip/);
assert.match(inputs, /ATTRIBUTE_GL_managed_stage\.zip/);
assert.match(inputs, /FBX2_BROWSER_SOURCE_IDENTITY_MISMATCH/);
assert.match(inputs, /MANAGED_STAGE_ZONE_LABEL_REQUIRED/);
assert.match(promotion, /Mapping manifest is absent/);
assert.match(promotion, /WORKLIST_GENERATED/);

for (const [name, source] of Object.entries({ runner, review, zip, inputs, promotion })) {
  const lines = source.split(/\r?\n/).length - 1;
  assert.ok(lines <= 300, `${name} exceeds 300 physical lines: ${lines}`);
}
console.log('FBX2 browser managed-reference integration guards: PASS');
