import assert from 'node:assert/strict';
import { runGovernedTayaSupportQualification } from
  '../../tabs/model-converters/converters/fbx/taya-qualification/session.js';

const h = (value) => value.repeat(64);
const selection = {
  policy: 'FbxSelectedZoneAutoPipePolicy.v1', reason: 'ranked-source-graph', rank: 1,
  zoneId: 'occ:flowline', label: 'TAY-A-FL-01', sourcePointCount: 100,
  selectedOccurrenceCount: 3, selectedGeometryCount: 2,
  pipeLikeGeometryCount: 2, pipeLikeRatio: 1,
  positiveNameHints: 1, negativeNameHints: 0, candidateCount: 2, eligibleCandidateCount: 2,
};
const sourceIdentity = {
  schema: 'FbxGovernedTayaSourceIdentity.v1', profileId: 'FBX-TAYA-20260721',
  suppliedFileName: 'fbxtaya.fbx', expectedFileName: 'fbxtaya.fbx',
  fileNameDisposition: 'MATCH', byteLength: 71_486_048, expectedByteLength: 71_486_048,
  sha256: '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8',
  expectedSha256: '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8',
  expectedFbxVersion: 7500, sourceGraphSchema: 'FbxSourceGraph.v2',
  sourceCounts: { sourceObjects: 50_228, occurrences: 19_281, geometries: 12_119 },
  expectedSourceCounts: { sourceObjects: 50_228, occurrences: 19_281, geometries: 12_119 },
  sourceCountMismatches: [], status: 'PASS', blockedReasons: [],
  authority: { byteIdentityAuthority: 'SHA256_AND_BYTE_LENGTH', fileNameUsedAsAuthority: false,
    sourceGraphCountAuthority: 'GOVERNED_TAYA_BROWSER_BASELINE', sourcePropertiesChanged: false,
    parserAuthorityChanged: false },
};
function packageInputs() {
  return {
    manifest: { manifestDigest: h('2'), selectedZoneDigest: h('3') },
    supportEvidence: { schema: 'FbxSupportEvidence.v1', evidenceDigest: h('4'),
      candidates: [{ candidateId: 'c1' }] },
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
      rootDigest: h('7'), status: 'PASS', selectedZone: { selectedZoneId: selection.zoneId },
      checks: [
        { code: 'SUPPORT_EVIDENCE_BINDING', status: 'PASS' },
        { code: 'SUPPORT_HOST_ASSOCIATION_BINDING', status: 'PASS' },
        { code: 'SUPPORT_ASSEMBLY_BINDING', status: 'PASS' },
      ],
      summary: { blockedChecks: [] },
    },
    artifacts: { ZONE_GEOMETRY_EVIDENCE: {
      selectedZone: { zoneId: selection.zoneId, label: selection.label },
      sourceGraphSha256: h('8'), geometryBundleDigest: h('9'),
      artifactId: `fbx-zone-geometry-evidence:${h('1')}`,
    } },
  };
}
let analysisCalls = 0, packageCalls = 0, archiveCalls = 0, selectionCalls = 0;
const progress = [];
const outcome = await runGovernedTayaSupportQualification({
  sourceName: 'fbxtaya.fbx', sourceBytes: new Uint8Array([1]),
  sourceGraph: { schema: 'FbxSourceGraph.v2' },
  applySelection: async (value) => { selectionCalls += 1; assert.equal(value, selection); },
  runAnalysis: async (value) => {
    analysisCalls += 1;
    assert.equal(value, selection);
    return structuredClone(packageInputs());
  },
  onProgress: (message) => progress.push(message),
  dependencies: {
    identifySource: async () => sourceIdentity,
    selectZone: () => selection,
    buildPackage: async () => { packageCalls += 1; return { files: [], audit: { packageDigest: h('a') } }; },
    buildArchive: async () => { archiveCalls += 1; return { bytes: new Uint8Array(), sha256: h('b') }; },
  },
});
assert.equal(analysisCalls, 2, 'qualification must execute two fresh analyses');
assert.equal(packageCalls, 2);
assert.equal(archiveCalls, 2);
assert.equal(selectionCalls, 1);
assert.equal(outcome.report.status, 'PASS');
assert.equal(outcome.report.comparison.status, 'PASS');
assert.match(progress.join('\n'), /Run 1: analysing/);
assert.match(progress.join('\n'), /Run 2: analysing/);

await assert.rejects(() => runGovernedTayaSupportQualification({
  sourceBytes: new Uint8Array([1]), sourceGraph: { schema: 'FbxSourceGraph.v2' },
  runAnalysis: async () => packageInputs(),
  dependencies: { identifySource: async () => ({ ...sourceIdentity, status: 'BLOCKED',
    blockedReasons: ['SOURCE_SHA256_MISMATCH'] }) },
}), /governed source identity blocked/);
console.log('test-taya-support-session: PASS');
