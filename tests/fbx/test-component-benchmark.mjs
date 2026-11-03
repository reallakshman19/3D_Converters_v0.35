import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  discoverComponentCatalog,
  validateComponentIdentityPolicy,
} from '../../tabs/model-converters/converters/fbx/benchmark/component-qualification.js';
import {
  branch, buildSubjects, componentPolicy, fitting, loadBranches, pipe, qualify,
  toleranceProfile,
} from './component-benchmark-fixtures.mjs';

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
  const python = process.env.FBX_SCHEMA_PYTHON || 'python3';
  const result = spawnSync(python, ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr);
  }
  return JSON.parse(result.stdout);
}

const acceptedPolicy = validateComponentIdentityPolicy(componentPolicy());
assert.equal(acceptedPolicy.authorityState, 'FROZEN');
assert.throws(() => validateComponentIdentityPolicy({
  ...componentPolicy(), authorityState: 'FROZEN', policyContentSha256: null,
}), /policyContentSha256/);
assert.throws(() => validateComponentIdentityPolicy({
  ...componentPolicy(),
  identityRules: componentPolicy().identityRules.map((rule) => (
    rule.ruleId === 'spatial-diagnostic' ? { ...rule, passing: true } : rule
  )),
}), /diagnostic rules cannot pass/);

const zoneScopedPolicy = structuredClone(componentPolicy());
zoneScopedPolicy.identityRules = [{
  ...zoneScopedPolicy.identityRules[0],
  requiredFields: ['zoneIds', 'sourceIdentity'],
  scope: 'ZONE',
}];
assert.equal(
  validateComponentIdentityPolicy(zoneScopedPolicy).identityRules[0].scope,
  'ZONE',
);
const invalidZoneScope = structuredClone(zoneScopedPolicy);
invalidZoneScope.identityRules[0].requiredFields = ['sourceIdentity'];
assert.throws(
  () => validateComponentIdentityPolicy(invalidZoneScope),
  /must include zoneIds/,
);

const inventoryFixture = branch('/LINE/B1', [
  fitting('FLAN', '=1'), pipe('PIPE AUTO /LINE/B1 1'), fitting('OLET', '=2'),
  { name: 'SUPPORT X', type: 'SUPPORT', attributes: { TYPE: 'ATTA' } },
]);
assert.deepEqual(discoverComponentCatalog(await loadBranches(inventoryFixture)), {
  schema: 'FbxComponentCatalog.v1', branchCount: 1,
  componentCount: 3, supportCount: 1,
  countsByOuterType: { FLAN: 1, OLET: 1, PIPE: 1 },
  countsByRawType: { FLAN: 1, OLET: 1, PIPE: 1 },
});

const reference = branch('/LINE/B1', [
  fitting('FLAN', '=F1'), pipe('PIPE AUTO /LINE/B1 1'),
]);
const actual = branch('/LINE/B1', [
  pipe('PIPE AUTO /LINE/B1 1'), fitting('FLAN', '=F1'),
]);
const exact = await qualify({
  reference, actual, identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(exact.summary.componentStatus, 'PASS');
assert.equal(exact.inventory.referenceComponentCount, 2);
assert.equal(exact.inventory.actualComponentCount, 2);
assert.equal(
  exact.ledger.filter((record) => record.match.state === 'EXACT_MATCH').length,
  2,
);
assert.equal(
  exact.ledger.filter((record) => record.match.state === 'APPROVED_EQUIVALENT').length,
  2,
);
assert.ok(exact.ledger.every((record) => (
  record.match.passingCounterpartSubjectId
  && record.subjectLocator.zoneMembership.status === 'ASSIGNED'
  && record.subjectLocator.zoneMembership.zoneIds[0] === 'ZONE-LINE'
)));
assert.match(
  exact.executionIdentity.zoneMembershipIndexes.reference.contentSha256,
  /^[0-9a-f]{64}$/,
);

const reordered = await qualify({
  reference: branch('/LINE/B1', [...reference[0].children].reverse()),
  actual: branch('/LINE/B1', [...actual[0].children].reverse()),
  identityPolicy: componentPolicy(), toleranceProfile,
});
const semanticLedger = (report) => report.ledger.map((record) => ({
  side: record.side, family: record.classification.family,
  subjectId: record.subjectId, state: record.match.state,
}));
assert.equal(
  canonicalJson(semanticLedger(exact)), canonicalJson(semanticLedger(reordered)),
  'semantic component matching depends on child order',
);

const subjects = await buildSubjects(reference);
assert.equal(subjects.length, 2);
assert.ok(subjects.every((subject) => (
  /^[RA]-COMP-[0-9a-f]{24}-\d+$/.test(subject.subjectId)
  && /^[0-9a-f]{64}$/.test(subject.canonicalSubjectPayloadSha256)
  && subject.zoneMembership.status === 'ASSIGNED'
  && /^branch:\d+\/child:\d+$/.test(subject.sourceOccurrenceId)
  && /^branch:\d+$/.test(subject.branchOccurrenceId)
)));

const identityPolicySchema = JSON.parse(await readFile(
  new URL(
    '../../contracts/fbx/fbx-component-identity-policy.v1.schema.json',
    import.meta.url,
  ),
  'utf8',
));
const componentReportSchema = JSON.parse(await readFile(
  new URL(
    '../../contracts/fbx/fbx-component-benchmark-report.v1.schema.json',
    import.meta.url,
  ),
  'utf8',
));
assert.deepEqual(validateSchema(identityPolicySchema, componentPolicy()), []);
assert.deepEqual(validateSchema(componentReportSchema, exact), []);
assert.notDeepEqual(
  validateSchema(identityPolicySchema, { ...componentPolicy(), unexpected: true }),
  [],
);
assert.notDeepEqual(
  validateSchema(componentReportSchema, { ...exact, unexpected: true }),
  [],
);

console.log('test-component-benchmark: PASS');
