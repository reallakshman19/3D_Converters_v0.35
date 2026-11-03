import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [toolbar, shell, index, shim, scope, ports, worker, analysis, capture,
  reviewUi, panels, inlineReviewUi, connectivityUi, artifactActions,
  generatedGapUi, mappedScope, primaryReviewUi] = await Promise.all([
  read('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js'),
  read('tabs/model-converters/ModelConvertersTab.js'),
  read('tabs/model-converters/index.js'),
  read('tabs/model-converters-tab.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/zone-scope.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/derived-ports.js'),
  read('tests/fbx/test-zone-geometry-worker.mjs'),
  read('tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-capture.js'),
  read('tabs/model-converters/converters/fbx/fitting-kernels/branch-fitting/review-ui.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/zone-review-panels.js'),
  read('tabs/model-converters/converters/fbx/fitting-kernels/inline-assembly/review-ui.js'),
  read('tabs/model-converters/converters/fbx/fitting-kernels/connectivity/review-ui.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/zone-artifact-actions.js'),
  read('tabs/model-converters/converters/fbx/generated-gap-pipe/review-ui.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-scope.js'),
  read('tabs/model-converters/converters/fbx/fitting-kernels/primary-fitting/review-ui.js'),
]);

for (const label of ['Analyse zone geometry', 'Download zone geometry evidence',
  'Download derived port evidence', 'Download PIPE inference evidence']) {
  assert.match(toolbar, new RegExp(label));
}
assert.match(reviewUi, /Download OLET evidence/);
assert.match(inlineReviewUi, /Download inline assembly evidence/);
assert.match(inlineReviewUi, /BLIND remains review-only/);
assert.match(connectivityUi, /Download connectivity evidence/);
assert.match(connectivityUi, /Explicit mapping links only/);
assert.match(generatedGapUi, /Download generated gap PIPE evidence/);
assert.match(generatedGapUi, /No proximity fallback/);
assert.match(generatedGapUi, /data-fbx-generated-gap-pipe-profile-info/);
assert.match(primaryReviewUi, /Download ELBOW evidence/);
assert.match(primaryReviewUi, /Download TEE evidence/);
assert.match(primaryReviewUi, /Download REDUCER evidence/);
assert.match(primaryReviewUi, /no engineering attributes or flow direction are inferred/i);
assert.match(toolbar, /installMappedStageCapture/);
assert.match(toolbar, /installZoneReviewPanels/);
assert.match(panels, /installConnectivityReviewUi/);
assert.match(panels, /installGeneratedGapPipeReviewUi/);
assert.match(panels, /installPrimaryFittingReviewUi/);
assert.match(panels, /installBranchFittingReviewUi/);
assert.match(panels, /installInlineAssemblyReviewUi/);
assert.match(toolbar, /stagedBranches: controller\.runInput\.stagedBranches/);
assert.match(toolbar, /downloadZoneArtifact/);
assert.match(artifactActions, /connectivity: 'connectivityJson'/);
assert.match(artifactActions, /'generated-gap-pipe': 'generatedGapPipeJson'/);
assert.match(artifactActions, /elbow: 'elbowJson'/);
assert.match(artifactActions, /tee: 'teeJson'/);
assert.match(artifactActions, /reducer: 'reducerJson'/);
assert.match(artifactActions, /buildFbxGeneratedGapPipeDownloadName/);
assert.match(capture, /extractMappedStagedBranches/);
assert.match(analysis, /buildSelectedZoneComponentCrosswalk/);
assert.match(analysis, /buildSelectedZoneConnectivityEvidence/);
assert.match(analysis, /buildSelectedZoneGeneratedGapPipeEvidence/);
assert.match(analysis, /buildElbowPortEvidence/);
assert.match(analysis, /buildTeePortEvidence/);
assert.match(analysis, /buildReducerPortEvidence/);
assert.match(analysis, /buildPrimaryFittingReviewModel/);
assert.match(analysis, /buildBranchFittingPortEvidence/);
assert.match(analysis, /buildInlineAssemblyPortEvidence/);
assert.match(analysis, /scopeMappedStagedBranches/);
assert.match(mappedScope, /generationProvenance/);
assert.match(mappedScope, /sourceOccurrenceIds/);
assert.match(toolbar, /bindFbxPrimaryInputInvalidation/);
assert.match(toolbar, /A new FBX input was loaded; prior analysis was cleared/);
assert.match(toolbar, /container\.addEventListener\('change', listener, true\)/);
assert.match(toolbar, /Selected zone changed; prior analysis was cleared/);
assert.match(toolbar, /A new FBX run started; prior analysis was cleared/);
assert.match(toolbar, /controller\.analysis\.invalidate/);
assert.doesNotMatch(toolbar, /JSON\.stringify|convertFbxToStagedJson|port-resolver/);
assert.doesNotMatch(scope, /toUpperCase|toLowerCase|localeCompare|Intl\.Collator|normalize\(/);
assert.match(scope, /domSubtype === GOVERNED_NULL_SUBTYPE/);
assert.match(scope, /`\$\{label\} · \$\{zoneId\}`/);
assert.match(ports, /compareDecimalId\(a\.geometryObjectId, b\.geometryObjectId\)/);
assert.doesNotMatch(worker, /not-available-in-local-harness|PASS \(real parity: not/);
assert.match(shell, /installFbxPreviewZoneSelector\(container\); installFbxZoneGeometryToolbar\(container\)/);
for (const text of [shell, index, shim]) assert.match(text, /20260727-fbx-auto-001-1/);
assert.ok(toolbar.split('\n').length <= 300);
console.log('test-zone-geometry-ui-static: PASS');
