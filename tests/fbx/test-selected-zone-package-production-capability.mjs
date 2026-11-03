import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [analysis, controller, toolbar, capture, liveInput, supportProjection,
  hostEvidence, hostAssociation, assemblyRelations, assemblyEvidence, assemblyReview,
  builder, validator, validationSupport, exporter] = await Promise.all([
  read('tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/analysis-controller.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-capture.js'),
  read('tabs/model-converters/converters/fbx/zone-package/live-input.js'),
  read('tabs/model-converters/converters/fbx/zone-package/selected-support-evidence.js'),
  read('tabs/model-converters/converters/fbx/support-host/evidence.js'),
  read('tabs/model-converters/converters/fbx/support-host/association.js'),
  read('tabs/model-converters/converters/fbx/support-assembly/relations.js'),
  read('tabs/model-converters/converters/fbx/support-assembly/evidence.js'),
  read('tabs/model-converters/converters/fbx/support-assembly/review-model.js'),
  read('tabs/model-converters/converters/fbx/zone-package/package-builder.js'),
  read('tabs/model-converters/converters/fbx/zone-package/package-validation.js'),
  read('tabs/model-converters/converters/fbx/zone-package/package-validation-support.js'),
  read('tabs/model-converters/fbx-zone-package-export.js'),
]);
assert.match(capture, /extractMappedEngineeringAttributeLedger/);
assert.match(toolbar, /engineeringAttributeLedger: controller\.runInput\.engineeringAttributeLedger/);
assert.match(controller, /engineeringAttributeLedger: input\.engineeringAttributeLedger/);
for (const token of ['componentCrosswalk', 'connectivityEvidence', 'elbowEvidence',
  'teeEvidence', 'reducerEvidence', 'branchFittingEvidence', 'inlineAssemblyEvidence']) {
  assert.match(analysis, new RegExp(token));
}
assert.match(analysis, /pipeClassifications: pipeEvidence\.autoPipe\.classificationDispositions/);
assert.match(liveInput, /buildSelectedZoneQualificationRoot/);
assert.match(liveInput, /buildSelectedZoneEngineeringAttributeLedger/);
assert.match(liveInput, /buildSelectedZoneSourceGraph/);
assert.match(liveInput, /buildSelectedZoneSupportEvidence/);
assert.match(liveInput, /buildSupportHostAssociationEvidence/);
assert.match(liveInput, /buildSupportAssemblyEvidence/);
assert.match(liveInput, /SUPPORT_HOST_ASSOCIATION_EVIDENCE/);
assert.match(liveInput, /SUPPORT_ASSEMBLY_EVIDENCE/);
assert.match(supportProjection, /customProperties/);
assert.doesNotMatch(supportProjection, /displayName.*RAW_TYPE|domSourceName.*RAW_TYPE/);
assert.match(hostEvidence, /ADMITTED_AUTO_PIPE_CLASSIFICATIONS_ONLY/);
assert.match(hostEvidence, /nearestPipeFallbackUsed: false/);
assert.match(hostEvidence, /restraintSubtypeEvaluated: false/);
assert.match(hostAssociation, /DUPLICATE_CYLINDER_HOST_AUTHORITY/);
assert.match(assemblyRelations, /rootCandidate/);
assert.doesNotMatch(assemblyRelations, /aabb|distance|proximity/i);
assert.match(assemblyEvidence, /EXACT_FBX_OCCURRENCE_ANCESTRY_ONLY/);
assert.match(assemblyEvidence, /siblingProximityGroupingUsed: false/);
assert.match(assemblyEvidence, /restraintSubtypeEvaluated: false/);
assert.match(assemblyReview, /generic support assemblies proved/);
assert.match(builder, /buildPackageArtifactFiles/);
assert.match(validator, /verifyPackagedSemanticArtifacts/);
assert.match(validator, /verifyQualifiedSupportBindings/);
assert.match(validationSupport, /SUPPORT_HOST_ASSOCIATION_BINDING/);
assert.match(validationSupport, /SUPPORT_ASSEMBLY_BINDING/);
assert.match(validationSupport, /supportAssemblyEvidenceDigest/);
assert.match(exporter, /qualification PASS/);
assert.match(exporter, /generic support assemblies proved/);
assert.match(exporter, /data-fbx-support-host-policy/);
assert.match(exporter, /No nearest-pipe fallback/);
assert.match(exporter, /Sibling candidates are not grouped/);
assert.doesNotMatch([analysis, liveInput, supportProjection, hostEvidence,
  hostAssociation, assemblyRelations, assemblyEvidence, builder].join('\n'),
  /Math\.random|Date\.now|localeCompare/);
console.log('test-selected-zone-package-production-capability: PASS');
