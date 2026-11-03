import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildSelectedZoneConnectivityEvidence } from '../../tabs/model-converters/converters/fbx/fitting-kernels/connectivity/evidence.js';
import { prepareGeneratedGapPipeRelease } from '../../tabs/model-converters/converters/fbx/generated-gap-pipe/release.js';
import { buildSelectedZoneGeneratedGapPipeEvidence } from '../../tabs/model-converters/converters/fbx/generated-gap-pipe/selected-evidence.js';
import { writeNativeStagedJsonV2 } from '../../tabs/model-converters/converters/fbx/staged-writer.js';

function fixture() {
  const connection = (mappingEntryId, portId) => [{ mappingEntryId, portId }];
  const port = (portId, role, positionMm, vector, connections = []) => ({
    portId, role, authority: 'mesh-vertex', geometryObjectId: `${role}-geo`,
    positionMm, direction: { authority: 'world-vector', vector }, connections,
  });
  const entries = ['1', '2'].map((id) => ({
    mappingEntryId: `p${id}`, logicalComponentId: `P-${id}`, componentType: 'PIPE',
    sourceModelObjectId: id, sourceOccurrenceId: `occ:${id}`,
    sourceGeometryObjectIds: [`${id}0`], engineering: {},
  }));
  return {
    entries,
    resolvedByEntry: new Map([
      ['p1', { A: port('A', 'A', [-10, 0, 0], [-1, 0, 0]),
        L: port('L', 'L', [0, 0, 0], [1, 0, 0], connection('p2', 'A')) }],
      ['p2', { A: port('A', 'A', [100, 0, 0], [-1, 0, 0], connection('p1', 'L')),
        L: port('L', 'L', [110, 0, 0], [1, 0, 0]) }],
    ]),
    links: [{ pairKey: 'p1:L|p2:A', endpoints: ['p1:L', 'p2:A'] }],
  };
}

function schemaErrors(schema, instances) {
  const program = String.raw`import json,sys
from jsonschema import Draft202012Validator as V
p=json.load(sys.stdin);V.check_schema(p["schema"]);v=V(p["schema"])
print(json.dumps([[e.message for e in v.iter_errors(i)] for i in p["instances"]]))`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instances }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

function functionLengths(source) {
  const lines = source.split('\n'), lengths = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (!match) continue;
    let depth = 0, started = false, end = index;
    for (; end < lines.length; end += 1) {
      for (const character of lines[end]) {
        if (character === '{') { depth += 1; started = true; }
        if (character === '}') depth -= 1;
      }
      if (started && depth === 0) break;
    }
    lengths.push([match[1], end - index + 1]);
  }
  return lengths;
}

const release = prepareGeneratedGapPipeRelease(fixture());
const staged = writeNativeStagedJsonV2(release.entries, release.resolvedByEntry, release.links);
const zone = { artifactId: 'zone:gap', selectedZone: { zoneId: 'zone:gap' },
  selectedOccurrenceIds: ['occ:1', 'occ:2'] };
const selected = buildSelectedZoneGeneratedGapPipeEvidence({ stagedBranches: staged,
  zoneGeometryEvidence: zone, mappingStatus: 'MAPPED_STAGE_AVAILABLE' });
const branchId = staged[0].attributes.REF;
const crosswalk = {
  schema: 'FbxSelectedZoneComponentCrosswalk.v1', artifactId: 'crosswalk:gap',
  inputs: { zoneGeometryArtifactId: zone.artifactId, selectedZoneId: zone.selectedZone.zoneId },
  managedComponents: staged[0].children.map((child) => {
    const a = child.attributes, p = a.mappingEngineering?.generationProvenance;
    return { managedRecordId: `${branchId}::${a.REF}`,
      exactSourceOccurrenceId: p ? null : a.sourceOccurrenceId,
      disposition: p ? 'GENERATED_MANAGED_COMPONENT' : 'MATCHED_SOURCE_COMPONENT',
      generationProvenanceStatus: p ? 'EVIDENCED' : 'NOT_APPLICABLE',
      generationMethod: p?.generationMethod || null };
  }),
};
const connectivity = await buildSelectedZoneConnectivityEvidence({ stagedBranches: staged,
  componentCrosswalk: crosswalk, mappingStatus: 'MAPPED_STAGE_AVAILABLE' });
const loadSchema = (name) => readFile(new URL(`../../contracts/fbx/${name}`, import.meta.url), 'utf8')
  .then(JSON.parse);
const [globalSchema, selectedSchema, connectivitySchema] = await Promise.all([
  loadSchema('fbx-generated-gap-pipe-evidence.v1.schema.json'),
  loadSchema('fbx-selected-zone-generated-gap-pipe-evidence.v1.schema.json'),
  loadSchema('fbx-selected-zone-connectivity-evidence.v1.schema.json'),
]);
const invalidGlobal = structuredClone(release.evidence); invalidGlobal.unexpected = true;
const invalidSelected = structuredClone(selected); invalidSelected.records[0].unexpected = true;
const invalidConnectivity = structuredClone(connectivity); invalidConnectivity.authority.writerAuthorityChanged = true;
for (const [schema, valid, invalid] of [
  [globalSchema, release.evidence, invalidGlobal],
  [selectedSchema, selected, invalidSelected],
  [connectivitySchema, connectivity, invalidConnectivity],
]) {
  const results = schemaErrors(schema, [valid, invalid]);
  assert.equal(results[0].length, 0, JSON.stringify(results[0]));
  assert.notEqual(results[1].length, 0, 'invalid schema fixture passed');
}

const files = ['profile.js', 'endpoint-model.js', 'qualify.js', 'release.js',
  'selected-evidence.js', 'review-model.js', 'review-ui.js'];
for (const name of files) {
  const url = new URL(`../../tabs/model-converters/converters/fbx/generated-gap-pipe/${name}`, import.meta.url);
  const source = await readFile(url, 'utf8');
  assert.ok(source.split('\n').length - 1 < 300, `${name} exceeds 300 lines`);
  assert.doesNotMatch(source, /export\s+default|localeCompare|Math\.random|Date\.now/);
  for (const [fn, length] of functionLengths(source)) assert.ok(length <= 40, `${fn} has ${length} lines`);
}
console.log('PASS test-generated-gap-pipe-contract');
