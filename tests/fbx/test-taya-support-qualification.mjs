import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  buildTayaSupportQualificationReport,
  validateTayaSupportQualificationReport,
} from '../../tabs/model-converters/converters/fbx/taya-qualification/report.js';

const h = (value) => value.repeat(64);
const sourceIdentity = {
  schema: 'FbxGovernedTayaSourceIdentity.v1',
  profileId: 'FBX-TAYA-20260721',
  suppliedFileName: 'renamed-taya.fbx',
  expectedFileName: 'fbxtaya.fbx',
  fileNameDisposition: 'RENAMED_OR_UNAVAILABLE',
  byteLength: 71_486_048,
  expectedByteLength: 71_486_048,
  sha256: '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8',
  expectedSha256: '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8',
  expectedFbxVersion: 7500,
  sourceGraphSchema: 'FbxSourceGraph.v2',
  sourceCounts: { sourceObjects: 50_228, occurrences: 19_281, geometries: 12_119 },
  expectedSourceCounts: { sourceObjects: 50_228, occurrences: 19_281, geometries: 12_119 },
  sourceCountMismatches: [],
  status: 'PASS',
  blockedReasons: [],
  authority: {
    byteIdentityAuthority: 'SHA256_AND_BYTE_LENGTH',
    fileNameUsedAsAuthority: false,
    sourceGraphCountAuthority: 'GOVERNED_TAYA_BROWSER_BASELINE',
    sourcePropertiesChanged: false,
    parserAuthorityChanged: false,
  },
};
const selection = {
  policy: 'FbxSelectedZoneAutoPipePolicy.v1', reason: 'ranked-source-graph', rank: 1,
  zoneId: 'occ:flowline', label: 'TAY-A-FL-01', sourcePointCount: 4000,
  selectedOccurrenceCount: 12, selectedGeometryCount: 8,
  pipeLikeGeometryCount: 6, pipeLikeRatio: 0.75,
  positiveNameHints: 2, negativeNameHints: 0,
  candidateCount: 10, eligibleCandidateCount: 8,
};
function supportChecks() {
  return [
    { code: 'SUPPORT_EVIDENCE_BINDING', status: 'PASS' },
    { code: 'SUPPORT_HOST_ASSOCIATION_BINDING', status: 'PASS' },
    { code: 'SUPPORT_ASSEMBLY_BINDING', status: 'PASS' },
    { code: 'COMPONENT_CROSSWALK_BINDING', status: 'BLOCKED' },
  ];
}
function inputs(seed = '1') {
  return {
    manifest: { manifestDigest: h('2'), selectedZoneDigest: h('3') },
    supportEvidence: {
      schema: 'FbxSupportEvidence.v1', evidenceDigest: h('4'), candidates: [{ candidateId: 'c1' }],
    },
    supportHostAssociationEvidence: {
      schema: 'FbxSupportHostAssociationEvidence.v1', status: 'PASS', evidenceDigest: h('5'),
      counts: { candidateCount: 1, singleHostCount: 1, multiHostCount: 0,
        hostNotFoundCount: 0, hostAmbiguousCount: 0 },
    },
    supportAssemblyEvidence: {
      schema: 'FbxSupportAssemblyEvidence.v1', status: 'PASS', evidenceDigest: h('6'),
      counts: { candidateCount: 1, assemblyCount: 1, passedAssemblyCount: 1,
        blockedAssemblyCount: 0, singlePipeAssemblyCount: 1, multiPipeAssemblyCount: 0,
        memberRelationCount: 1, uniqueHostPipeCount: 1 },
    },
    qualificationRoot: {
      rootDigest: h('7'), status: 'BLOCKED', checks: supportChecks(),
      summary: { blockedChecks: ['COMPONENT_CROSSWALK_BINDING'] },
      selectedZone: { selectedZoneId: selection.zoneId },
    },
    artifacts: {
      ZONE_GEOMETRY_EVIDENCE: {
        selectedZone: { zoneId: selection.zoneId, label: selection.label },
        sourceGraphSha256: h('8'), geometryBundleDigest: h('9'),
        artifactId: `fbx-zone-geometry-evidence:${h(seed)}`,
      },
    },
  };
}
function materialized(seed = '1') {
  return {
    inputs: inputs(seed),
    packageValue: { audit: { packageDigest: h('a') } },
    archive: { sha256: h('b') },
  };
}
function schemaErrors(schema, instance) {
  const program = `
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload['schema'])
print(json.dumps([e.message for e in Draft202012Validator(payload['schema']).iter_errors(payload['instance'])]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

const report = await buildTayaSupportQualificationReport({
  sourceIdentity, selection, materializedRuns: [materialized(), materialized()],
});
assert.equal(report.status, 'PASS');
assert.equal(report.summary.executionStatus, 'PASS');
assert.equal(report.summary.supportStatus, 'PASS');
assert.deepEqual(report.summary.packageStatuses, ['BLOCKED', 'BLOCKED']);
assert.deepEqual(report.summary.packageBlockedChecks, ['COMPONENT_CROSSWALK_BINDING']);
assert.equal(report.comparison.status, 'PASS');
assert.equal(report.comparison.comparedFieldCount, 18);
await validateTayaSupportQualificationReport(report);
const schema = JSON.parse(await readFile(new URL(
  '../../contracts/fbx/fbx-taya-support-qualification.v1.schema.json', import.meta.url), 'utf8'));
assert.deepEqual(schemaErrors(schema, report), []);

const drifted = materialized();
drifted.inputs.supportAssemblyEvidence.evidenceDigest = h('c');
const driftReport = await buildTayaSupportQualificationReport({
  sourceIdentity, selection, materializedRuns: [materialized(), drifted],
});
assert.equal(driftReport.status, 'BLOCKED');
assert.equal(driftReport.summary.executionStatus, 'BLOCKED');
assert.deepEqual(driftReport.comparison.differingFields, ['assemblyEvidenceDigest']);

const blockedHost = materialized();
blockedHost.inputs.supportHostAssociationEvidence.status = 'BLOCKED';
blockedHost.inputs.supportHostAssociationEvidence.counts.singleHostCount = 0;
blockedHost.inputs.supportHostAssociationEvidence.counts.hostNotFoundCount = 1;
blockedHost.inputs.supportAssemblyEvidence.status = 'BLOCKED';
blockedHost.inputs.supportAssemblyEvidence.counts.passedAssemblyCount = 0;
blockedHost.inputs.supportAssemblyEvidence.counts.blockedAssemblyCount = 1;
blockedHost.inputs.qualificationRoot.checks[1].status = 'BLOCKED';
blockedHost.inputs.qualificationRoot.checks[2].status = 'BLOCKED';
const blockedSupport = await buildTayaSupportQualificationReport({
  sourceIdentity, selection, materializedRuns: [blockedHost, structuredClone(blockedHost)],
});
assert.equal(blockedSupport.summary.executionStatus, 'PASS');
assert.equal(blockedSupport.summary.supportStatus, 'BLOCKED');
assert.equal(blockedSupport.status, 'BLOCKED');

const tampered = structuredClone(report);
tampered.runs[0].counts.supportCandidateCount += 1;
await assert.rejects(() => validateTayaSupportQualificationReport(tampered), /digest is invalid/);
console.log('test-taya-support-qualification: PASS');
