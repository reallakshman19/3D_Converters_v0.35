import assert from 'node:assert/strict';
import {
  InputXmlReleaseContractError,
  buildSelectedOutputManifest,
  validateApprovedSemanticSplit,
  validateCompatibilityPolicy,
  validateSelectedOutputManifest,
  verifySelectedOutputFiles,
} from '../converters/inputxml-release/inputxml-release-contracts.js';
import { hashReleaseJson, sha256Hex, stableReleaseJson } from '../converters/inputxml-release/inputxml-release-hash.js';

const sourceHash = await sha256Hex('source');
const policy = validateCompatibilityPolicy({
  schema: 'InputXmlCompatibilityPolicy.v1', mode: 'CANONICAL_STRICT',
  detectedDialect: 'canonical-inputxml-v1', sourceHashSha256: sourceHash,
  status: 'PASS', approvedSemanticSplitId: null, diagnostics: [],
});
assert.equal(policy.status, 'PASS');
assert.throws(() => validateCompatibilityPolicy({ ...policy, detectedDialect: 'legacy' }), InputXmlReleaseContractError);

const gates = Object.fromEntries([
  'compatibility', 'canonicalization', 'canonicalValidation', 'topologyTrace',
  'topologyParity', 'diagnostics', 'resolverTrace', 'ciiProjectionReadiness',
].map((name) => [name, 'PASS']));
const assurance = {
  schema: 'InputXmlCiiAssuranceLedger.v2', status: 'PASS', gates,
  assuranceHashSha256: await sha256Hex('assurance'),
};
const artifactNames = [
  'canonicalInputXml', 'cii', 'compatibilityRequest', 'compatibilityPolicy',
  'canonicalizationLedger', 'canonicalValidation', 'normalizationPlan',
  'diagnosticReport', 'resolverTrace', 'canonicalSourceModel', 'resolvedRelationships',
  'canonicalTopology', 'topoNodePlan', 'numberedTopologyProjection',
  'parsedInputXmlTopology', 'topologyParityReport', 'assuranceLedger', 'ciiProjectionLedger',
];
const artifacts = Object.fromEntries(artifactNames.map((name) => [name, {
  fileName: `${name}.json`, bytes: stableReleaseJson({ name }),
}]));
const manifest = await buildSelectedOutputManifest({
  sourceHashSha256: sourceHash, compatibilityMode: 'CANONICAL_STRICT',
  assuranceLedger: assurance, artifacts, approvedSemanticSplit: null,
});
assert.equal((await validateSelectedOutputManifest(manifest)).status, 'PASS');

const files = Object.fromEntries(Object.values(artifacts).map((artifact) => [artifact.fileName, artifact.bytes]));
assert.equal((await verifySelectedOutputFiles(manifest, files)).manifestHashSha256, manifest.manifestHashSha256);
await assert.rejects(
  verifySelectedOutputFiles(manifest, { ...files, 'cii.json': 'mutated' }),
  (error) => error.code === 'ARTIFACT_LENGTH_MISMATCH' || error.code === 'ARTIFACT_HASH_MISMATCH',
);
const approvalBase = {
  schema: 'ApprovedSemanticSplit.v1', approvalId: 'IAS-SIMULATED-JS', mode: 'ADAPTED_CANONICAL',
  sourceHashSha256: sourceHash, approvedCanonicalFile: 'approved.xml',
  approvedCanonicalHashSha256: await sha256Hex('approved'),
  expectedCanonicalTopologyFile: 'approved-topology.json',
  expectedCanonicalTopologyHashSha256: await sha256Hex('topology'),
  approvers: ['engineering-reviewer'], approvedAt: '2026-07-23T00:00:00Z',
  rationale: 'Reviewed simulated replacement.',
  overflowElements: [{ elementId: 'E1', fromNode: '10', toNode: '20', observedCount: 7, allowedCount: 6 }],
};
const approval = { ...approvalBase, artifactHashSha256: await hashReleaseJson(approvalBase, 'artifactHashSha256') };
await validateApprovedSemanticSplit(approval);
const adaptedArtifacts = {
  ...artifacts,
  approvedSemanticSplitEvidence: { fileName: 'approved-semantic-split.json', bytes: stableReleaseJson(approval) },
};
const adaptedManifest = await buildSelectedOutputManifest({
  sourceHashSha256: sourceHash, compatibilityMode: 'ADAPTED_CANONICAL',
  assuranceLedger: assurance, artifacts: adaptedArtifacts,
  approvedSemanticSplit: { approvalId: approval.approvalId, artifactHashSha256: approval.artifactHashSha256 },
});
assert.ok(adaptedManifest.artifacts.approvedSemanticSplitEvidence);
console.log('[SIMULATED] InputXML selected-output contract checks passed.');
