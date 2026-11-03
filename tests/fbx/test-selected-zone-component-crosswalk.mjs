import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  buildSelectedZoneComponentCrosswalk,
} from '../../tabs/model-converters/converters/fbx/parity/component-crosswalk.js';

function validateSchema(schema, instance) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
errors = sorted(
    Draft202012Validator(payload["schema"]).iter_errors(payload["instance"]),
    key=lambda error: (list(error.absolute_path), error.message),
)
print(json.dumps([{"path": list(error.absolute_path), "message": error.message} for error in errors]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instance }),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr);
  }
  return JSON.parse(result.stdout);
}

function sourceObject(id, name) {
  return { sourceObjectId: id, displayName: `Model::${name}`, domSubtype: 'Mesh' };
}

function occurrence(id, model, geometryObjectIds) {
  return {
    sourceOccurrenceId: id,
    sourceModelObjectId: model,
    parentOccurrenceId: 'occ:zone',
    geometryObjectIds,
  };
}

function component(type, id, attributes = {}) {
  return { type, id, name: id, attributes, children: [] };
}

const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    sourceObject('101', 'Pipe'),
    sourceObject('102', 'Valve Body'),
    sourceObject('103', 'Unmatched Geometry'),
  ],
  occurrences: [
    occurrence('occ:pipe', '101', ['geo:pipe']),
    occurrence('occ:valve', '102', ['geo:valve']),
    occurrence('occ:unmatched', '103', ['geo:unmatched']),
  ],
};

const zoneGeometryEvidence = {
  schema: 'FbxZoneGeometryEvidence.v1',
  artifactId: 'FBXZGEOM-test',
  selectedZone: { zoneId: 'occ:zone' },
  selectedOccurrenceIds: ['occ:pipe', 'occ:valve', 'occ:unmatched'],
  selectedGeometryIds: ['geo:pipe', 'geo:valve', 'geo:unmatched'],
};

const stagedBranches = [{
  type: 'BRANCH',
  id: 'BRANCH-A',
  attributes: { REF: 'BRANCH-A' },
  children: [
    component('PIPE', 'P-1', { REF: 'P-1', sourceOccurrenceId: 'occ:pipe' }),
    component('VALV', 'V-1', { REF: 'V-1', sourceOccurrenceId: 'occ:valve' }),
    component('INST', 'I-1', { REF: 'I-1', sourceOccurrenceId: 'occ:valve' }),
    component('FLAN', 'F-1', { REF: 'F-1', sourceModelObjectId: '101' }),
    component('PIPE', 'P-GAP', {
      REF: 'P-GAP',
      AUTO_GENERATED_PIPE: 'true',
    }),
    component('TEE', 'T-MISSING', {
      REF: 'T-MISSING',
      sourceOccurrenceId: 'occ:not-selected',
    }),
    component('OLET', 'O-UNMATCHED', { REF: 'O-UNMATCHED' }),
    component('SUPPORT', 'S-1', { REF: 'S-1', TYPE: 'ATTA' }),
  ],
}];

const first = await buildSelectedZoneComponentCrosswalk({
  sourceGraph,
  zoneGeometryEvidence,
  stagedBranches,
});
const second = await buildSelectedZoneComponentCrosswalk({
  sourceGraph: { ...sourceGraph, occurrences: [...sourceGraph.occurrences].reverse() },
  zoneGeometryEvidence: {
    ...zoneGeometryEvidence,
    selectedOccurrenceIds: [...zoneGeometryEvidence.selectedOccurrenceIds].reverse(),
  },
  stagedBranches: [{ ...stagedBranches[0], children: [...stagedBranches[0].children].reverse() }],
});

const schema = JSON.parse(await readFile(new URL(
  '../../contracts/fbx/fbx-selected-zone-component-crosswalk.v1.schema.json',
  import.meta.url,
), 'utf8'));
assert.deepEqual(validateSchema(schema, first), []);
assert.notDeepEqual(validateSchema(schema, { ...first, unexpected: true }), []);

assert.equal(first.schema, 'FbxSelectedZoneComponentCrosswalk.v1');
assert.equal(first.summary.selectedSourceOccurrenceCount, 3);
assert.equal(first.summary.managedComponentCount, 7);
assert.equal(first.summary.matchedManagedComponentCount, 3);
assert.equal(first.summary.generatedManagedComponentCount, 1);
assert.equal(first.summary.unresolvedGenerationProvenanceCount, 1);
assert.equal(first.summary.candidateManagedComponentCount, 1);
assert.equal(first.summary.unresolvedSourceBindingCount, 1);
assert.equal(first.summary.unmatchedManagedComponentCount, 1);
assert.equal(first.summary.unmatchedSourceOccurrenceCount, 1);
assert.equal(first.summary.oneSourceToManyCount, 1);
assert.deepEqual(first.summary.managedCountsByRawType, {
  FLAN: 1,
  INST: 1,
  OLET: 1,
  PIPE: 2,
  TEE: 1,
  VALV: 1,
});

const valve = first.sourceOccurrences.find((record) => record.sourceOccurrenceId === 'occ:valve');
assert.equal(valve.relationship, 'ONE_SOURCE_TO_MANY_MANAGED');
assert.deepEqual(valve.managedRecordIds, ['BRANCH-A::I-1', 'BRANCH-A::V-1']);

const candidate = first.managedComponents.find((record) => record.reference === 'F-1');
assert.equal(candidate.disposition, 'SOURCE_OCCURRENCE_CANDIDATES');
assert.deepEqual(candidate.candidateSourceOccurrenceIds, ['occ:pipe']);
assert.equal(candidate.exactSourceOccurrenceId, null);

const generated = first.managedComponents.find((record) => record.reference === 'P-GAP');
assert.equal(generated.disposition, 'GENERATED_MANAGED_COMPONENT');
assert.equal(generated.generationMethod, null);
assert.equal(generated.generationProvenanceStatus, 'UNRESOLVED');
assert.equal(generated.exactSourceOccurrenceId, null);

assert.equal(first.authority.missingGenerationMethodIsUnresolved, true);
assert.equal(first.authority.runtimeAdmissionChanged, false);
assert.equal(first.authority.engineeringAttributesInferred, false);
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first.managedComponents), true);
assert.equal(canonicalJson(first), canonicalJson(second));

const original = canonicalJson({ sourceGraph, zoneGeometryEvidence, stagedBranches });
await buildSelectedZoneComponentCrosswalk({ sourceGraph, zoneGeometryEvidence, stagedBranches });
assert.equal(canonicalJson({ sourceGraph, zoneGeometryEvidence, stagedBranches }), original);

const governedGenerated = await buildSelectedZoneComponentCrosswalk({
  sourceGraph,
  zoneGeometryEvidence,
  stagedBranches: [{
    ...stagedBranches[0],
    children: [component('PIPE', 'P-GOV', {
      REF: 'P-GOV',
      AUTO_GENERATED_PIPE: 'true',
      generationMethod: 'PORT_GAP_RECONSTRUCTION_V1',
    })],
  }],
});
assert.equal(governedGenerated.managedComponents[0].generationProvenanceStatus, 'EVIDENCED');
assert.equal(governedGenerated.summary.unresolvedGenerationProvenanceCount, 0);

const inconsistentGenerated = structuredClone(first);
const inconsistentRecord = inconsistentGenerated.managedComponents.find((record) => record.generated);
inconsistentRecord.generationProvenanceStatus = 'EVIDENCED';
assert.notDeepEqual(validateSchema(schema, inconsistentGenerated), []);

await assert.rejects(() => buildSelectedZoneComponentCrosswalk({
  sourceGraph,
  zoneGeometryEvidence: {
    ...zoneGeometryEvidence,
    selectedOccurrenceIds: ['occ:pipe', 'occ:pipe'],
  },
  stagedBranches,
}), /duplicates or blanks/);

await assert.rejects(() => buildSelectedZoneComponentCrosswalk({
  sourceGraph,
  zoneGeometryEvidence,
  stagedBranches: [{
    ...stagedBranches[0],
    children: [component('PIPE', 'INVALID', {
      REF: 'INVALID',
      AUTO_GENERATED_PIPE: true,
      generationMethod: 'PORT_GAP_RECONSTRUCTION_V1',
      sourceOccurrenceId: 'occ:pipe',
    })],
  }],
}), /generated record BRANCH-A cannot claim direct source identity/);

await assert.rejects(() => buildSelectedZoneComponentCrosswalk({
  sourceGraph,
  zoneGeometryEvidence,
  stagedBranches: [{
    type: 'BRANCH', attributes: {},
    children: [component('PIPE', 'P-NO-BRANCH', { REF: 'P-NO-BRANCH' })],
  }],
}), /branch 0 explicit identity is required/);

await assert.rejects(() => buildSelectedZoneComponentCrosswalk({
  sourceGraph,
  zoneGeometryEvidence,
  stagedBranches: [{
    ...stagedBranches[0],
    children: [{ type: 'PIPE', attributes: {}, children: [] }],
  }],
}), /BRANCH-A child 0 explicit identity is required/);

console.log('test-selected-zone-component-crosswalk: PASS');
