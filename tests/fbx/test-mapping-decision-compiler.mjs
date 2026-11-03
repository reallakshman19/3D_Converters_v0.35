import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  calculateDecisionSetId, compileMappingDecisions, createDecisionSet,
} from '../../tabs/model-converters/converters/fbx/mapping-decision-compiler.js';
import { buildMappingPackage } from '../../tabs/model-converters/converters/fbx/mapping-package.js';
import { validateMappingManifest } from '../../tabs/model-converters/converters/fbx/mapping-validator.js';
import { completeDecisionSet, explicitDecisions, worklistFixture } from './worklist-helpers.mjs';

function schemaErrors(schema, mappingSchema, instances) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["mappingSchema"])
Draft202012Validator.check_schema(payload["schema"])
registry = Registry().with_resource(payload["mappingSchema"]["$id"], Resource.from_contents(payload["mappingSchema"]))
validator = Draft202012Validator(payload["schema"], registry=registry)
print(json.dumps([[error.message for error in validator.iter_errors(item)] for item in payload["instances"]]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, mappingSchema, instances }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

function acceptedMapping(mapping, graph) {
  const accepted = validateMappingManifest(mapping, graph);
  return {
    schema: accepted.schema,
    inScopeSourceObjectIds: accepted.scope,
    entries: accepted.entries,
    exclusions: accepted.exclusions,
  };
}

async function compile(context, decisionSet) {
  return compileMappingDecisions({ ...context, decisionSet });
}

async function changedSet(context, mutate) {
  const decisions = explicitDecisions(context.worklist, context.mapping);
  mutate(decisions);
  return createDecisionSet({ worklist: context.worklist, decisions });
}

const context = await worklistFixture(true);
const complete = await completeDecisionSet(context);
const compiled = await compile(context, complete);
assert.equal(canonicalJson(compiled), canonicalJson(acceptedMapping(context.mapping, context.graph)));

const reversed = await createDecisionSet({
  worklist: context.worklist,
  decisions: [...complete.decisions].reverse(),
});
assert.equal(reversed.decisionSetId, complete.decisionSetId);
assert.equal(canonicalJson(await compile(context, reversed)), canonicalJson(compiled));

const firstPackage = await buildMappingPackage({ ...context, mapping: compiled });
const secondPackage = await buildMappingPackage({ ...context, mapping: compiled });
assert.equal(canonicalJson(firstPackage), canonicalJson(secondPackage));

const decisionSchema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-mapping-decision-set.v1.schema.json', import.meta.url), 'utf8',
));
const mappingSchema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-staged-mapping.v2.schema.json', import.meta.url), 'utf8',
));
const extra = structuredClone(complete);
extra.unexpected = true;
const placeholderSchema = structuredClone(complete);
placeholderSchema.decisions[0] = {
  workItemId: placeholderSchema.decisions[0].workItemId,
  disposition: 'exclude-with-reason',
  reason: 'tBd',
};
const results = schemaErrors(decisionSchema, mappingSchema, [complete, extra, placeholderSchema]);
assert.equal(results[0].length, 0, JSON.stringify(results[0]));
assert.notEqual(results[1].length, 0, 'unexpected decision-set field passed schema');
assert.notEqual(results[2].length, 0, 'placeholder exclusion reason passed schema');

const missing = await createDecisionSet({ worklist: context.worklist, decisions: complete.decisions.slice(1) });
await assert.rejects(() => compile(context, missing), /BLOCKED_DECISION_COVERAGE/);
const duplicate = await createDecisionSet({
  worklist: context.worklist,
  decisions: [...complete.decisions, structuredClone(complete.decisions[0])],
});
await assert.rejects(() => compile(context, duplicate), /BLOCKED_DECISION_CONFLICT/);
const unknown = await createDecisionSet({
  worklist: context.worklist,
  decisions: complete.decisions.map((item, index) => index ? item : {
    ...item, workItemId: `work-${'f'.repeat(64)}`,
  }),
});
await assert.rejects(() => compile(context, unknown), /BLOCKED_DECISION_COVERAGE/);

const wrongBinding = structuredClone(complete);
wrongBinding.worklistId = '0'.repeat(64);
wrongBinding.decisionSetId = await calculateDecisionSetId(wrongBinding);
await assert.rejects(() => compile(context, wrongBinding), /BLOCKED_DECISION_BINDING/);

const sourceTamper = await changedSet(context, (decisions) => {
  decisions.find((item) => item.disposition === 'promote').mappingEntry.sourceModelObjectId = '999';
});
await assert.rejects(() => compile(context, sourceTamper), /BLOCKED_DECISION_CONFLICT/);
const occurrenceTamper = await changedSet(context, (decisions) => {
  decisions.find((item) => item.disposition === 'promote').mappingEntry.sourceOccurrenceId = 'occ:999';
});
await assert.rejects(() => compile(context, occurrenceTamper), /BLOCKED_DECISION_CONFLICT/);
const geometryTamper = await changedSet(context, (decisions) => {
  decisions.find((item) => item.disposition === 'promote').mappingEntry.sourceGeometryObjectIds = ['999'];
});
await assert.rejects(() => compile(context, geometryTamper), /BLOCKED_DECISION_CONFLICT/);

await assert.rejects(
  () => changedSet(context, (decisions) => {
    decisions.find((item) => item.mappingEntry?.componentType === 'VALVE').mappingEntry.engineering.valveType = 'TBD';
  }),
  /BLOCKED_DECISION_BINDING.*placeholder/,
);
await assert.rejects(
  () => changedSet(context, (decisions) => {
    decisions[0].mappingEntry.ports.A.coordinate = [0, 0, 0];
  }),
  /BLOCKED_DECISION_BINDING.*unbound coordinate/,
);
await assert.rejects(
  () => createDecisionSet({
    worklist: context.worklist,
    decisions: context.worklist.workItems.map((item, index) => ({
      workItemId: item.workItemId,
      disposition: 'exclude-with-reason',
      reason: index ? 'Explicit fixture exclusion.' : 'TBD',
    })),
  }),
  /BLOCKED_DECISION_BINDING.*placeholder/,
);

const unsupported = await changedSet(context, (decisions) => {
  decisions[0].mappingEntry.componentType = 'PUMP';
});
await assert.rejects(() => compile(context, unsupported), /BLOCKED_MAPPING/);
const incomplete = await changedSet(context, (decisions) => {
  decisions.find((item) => item.mappingEntry.componentType === 'ELBOW').mappingEntry.engineering = {};
});
await assert.rejects(() => compile(context, incomplete), /BLOCKED_MAPPING/);
const invalidRole = await changedSet(context, (decisions) => {
  decisions[0].mappingEntry.ports.A.role = 'L';
});
await assert.rejects(() => compile(context, invalidRole), /BLOCKED_MAPPING/);
const asymmetric = await changedSet(context, (decisions) => {
  const target = decisions.find((item) => item.mappingEntry?.mappingEntryId === 'map-2');
  target.mappingEntry.ports.A.connections = [];
});
await assert.rejects(() => compile(context, asymmetric), /BLOCKED_MAPPING.*asymmetric/);

const allExclusions = await createDecisionSet({
  worklist: context.worklist,
  decisions: context.worklist.workItems.map((item) => ({
    workItemId: item.workItemId,
    disposition: 'exclude-with-reason',
    reason: 'Explicit fixture exclusion.',
  })),
});
await assert.rejects(
  () => compile(context, allExclusions),
  /BLOCKED_MAPPING mapping entries are required/,
  'current FbxStagedMapping.v2 authority does not permit an all-exclusion mapping',
);
console.log('test-mapping-decision-compiler: PASS');
