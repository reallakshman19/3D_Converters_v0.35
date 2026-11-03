/**
 * Functionality: builds and validates InputXML release policy and manifest artifacts.
 * Parameters: explicit contract objects and exact artifact bytes.
 * Outputs: frozen validated objects whose hashes anchor the selected release files.
 * Fallback: none; incomplete, stale, or non-PASS evidence raises a specific error.
 */
import { hashReleaseJson, releaseBytes, sha256Hex } from './inputxml-release-hash.js';

export const INPUTXML_COMPATIBILITY_MODES = Object.freeze([
  'CANONICAL_STRICT', 'ADAPTED_CANONICAL', 'DIAGNOSTIC_ONLY',
]);

export class InputXmlReleaseContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InputXmlReleaseContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new InputXmlReleaseContractError(code, message);
}

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('OBJECT_REQUIRED', `${label} must be an object.`);
  return value;
}

function textValue(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fail('TEXT_REQUIRED', `${label} is required.`);
  return text;
}

function hashValue(value, label) {
  const hash = textValue(value, label);
  if (!/^[0-9a-f]{64}$/.test(hash)) fail('HASH_INVALID', `${label} must be a lowercase SHA-256 value.`);
  return hash;
}

function freezeRecord(value) {
  return Object.freeze({ ...value });
}

export function validateCompatibilityPolicy(value) {
  const policy = objectValue(value, 'Compatibility policy');
  if (policy.schema !== 'InputXmlCompatibilityPolicy.v1') fail('POLICY_SCHEMA_INVALID', 'Compatibility policy schema is invalid.');
  if (!INPUTXML_COMPATIBILITY_MODES.includes(policy.mode)) fail('POLICY_MODE_INVALID', `Unsupported compatibility mode: ${policy.mode}.`);
  hashValue(policy.sourceHashSha256, 'Compatibility source hash');
  if (policy.mode === 'CANONICAL_STRICT' && policy.detectedDialect !== 'canonical-inputxml-v1') fail('STRICT_DIALECT_BLOCKED', 'Canonical strict mode requires canonical-inputxml-v1.');
  if (policy.mode === 'DIAGNOSTIC_ONLY' && policy.status !== 'DIAGNOSTIC') fail('DIAGNOSTIC_STATUS_INVALID', 'Diagnostic-only mode must have DIAGNOSTIC status.');
  if (policy.mode !== 'ADAPTED_CANONICAL' && policy.approvedSemanticSplitId !== null) fail('APPROVAL_MODE_INVALID', 'Semantic split approval is permitted only in adapted mode.');
  if (!Array.isArray(policy.diagnostics)) fail('POLICY_DIAGNOSTICS_INVALID', 'Compatibility diagnostics must be an array.');
  return freezeRecord(policy);
}

export async function validateApprovedSemanticSplit(value) {
  const approval = objectValue(value, 'Approved semantic split');
  if (approval.schema !== 'ApprovedSemanticSplit.v1') fail('APPROVAL_SCHEMA_INVALID', 'Approved semantic split schema is invalid.');
  if (approval.mode !== 'ADAPTED_CANONICAL') fail('APPROVAL_MODE_INVALID', 'Approved semantic split requires adapted mode.');
  textValue(approval.approvalId, 'Approval ID');
  hashValue(approval.sourceHashSha256, 'Approval source hash');
  hashValue(approval.approvedCanonicalHashSha256, 'Approved canonical hash');
  hashValue(approval.expectedCanonicalTopologyHashSha256, 'Expected topology hash');
  textValue(approval.approvedCanonicalFile, 'Approved canonical file');
  textValue(approval.expectedCanonicalTopologyFile, 'Expected canonical topology file');
  if (!Array.isArray(approval.approvers) || approval.approvers.length === 0) fail('APPROVERS_REQUIRED', 'At least one approver is required.');
  if (!Array.isArray(approval.overflowElements) || approval.overflowElements.length === 0) fail('OVERFLOW_EVIDENCE_REQUIRED', 'Approved semantic split requires overflow element evidence.');
  const expected = await hashReleaseJson(approval, 'artifactHashSha256');
  if (approval.artifactHashSha256 !== expected) fail('APPROVAL_HASH_MISMATCH', 'Approved semantic split artifact hash is stale.');
  return freezeRecord(approval);
}

function validateAssurance(value) {
  const ledger = objectValue(value, 'Assurance ledger');
  if (ledger.schema !== 'InputXmlCiiAssuranceLedger.v2') fail('ASSURANCE_SCHEMA_INVALID', 'Release requires InputXmlCiiAssuranceLedger.v2.');
  if (ledger.status !== 'PASS') fail('ASSURANCE_BLOCKED', 'Release requires PASS assurance.');
  const gates = objectValue(ledger.gates, 'Assurance gates');
  const required = [
    'compatibility', 'canonicalization', 'canonicalValidation', 'topologyTrace',
    'topologyParity', 'diagnostics', 'resolverTrace', 'ciiProjectionReadiness',
  ];
  for (const gate of required) if (gates[gate] !== 'PASS') fail('ASSURANCE_GATE_BLOCKED', `Assurance gate ${gate} must be PASS.`);
  hashValue(ledger.assuranceHashSha256, 'Assurance hash');
  return ledger;
}

function selectedArtifactNames(approval) {
  const names = [
    'canonicalInputXml', 'cii', 'compatibilityRequest', 'compatibilityPolicy',
    'canonicalizationLedger', 'canonicalValidation', 'normalizationPlan',
    'diagnosticReport', 'resolverTrace', 'canonicalSourceModel', 'resolvedRelationships',
    'canonicalTopology', 'topoNodePlan', 'numberedTopologyProjection',
    'parsedInputXmlTopology', 'topologyParityReport', 'assuranceLedger',
    'ciiProjectionLedger',
  ];
  return approval === null || approval === undefined ? names : [...names, 'approvedSemanticSplitEvidence'];
}

async function artifactDescriptor(value, label) {
  const artifact = objectValue(value, label);
  const fileName = textValue(artifact.fileName, `${label} file name`);
  if (/[\\/]/.test(fileName)) fail('ARTIFACT_NAME_INVALID', `${label} file name must not contain a path separator.`);
  const bytes = releaseBytes(artifact.bytes);
  return freezeRecord({ fileName, sha256: await sha256Hex(bytes), bytes: bytes.byteLength });
}

export async function buildSelectedOutputManifest(input) {
  const request = objectValue(input, 'Selected-output request');
  hashValue(request.sourceHashSha256, 'Selected-output source hash');
  if (!['CANONICAL_STRICT', 'ADAPTED_CANONICAL'].includes(request.compatibilityMode)) fail('RELEASE_MODE_INVALID', 'Diagnostic mode cannot publish selected output.');
  validateAssurance(request.assuranceLedger);
  const artifactInput = objectValue(request.artifacts, 'Selected-output artifacts');
  const names = selectedArtifactNames(request.approvedSemanticSplit);
  const entries = await Promise.all(names.map(async (name) => [name, await artifactDescriptor(artifactInput[name], name)]));
  const base = { schema: 'SelectedOutputManifest.v1', status: 'PASS', contractVersion: 'inputxml-v2', sourceHashSha256: request.sourceHashSha256, compatibilityMode: request.compatibilityMode, artifacts: Object.freeze(Object.fromEntries(entries)), approvedSemanticSplit: request.approvedSemanticSplit };
  return Object.freeze({ ...base, manifestHashSha256: await hashReleaseJson(base, 'manifestHashSha256') });
}

function validateDescriptor(value, label) {
  const descriptor = objectValue(value, label);
  textValue(descriptor.fileName, `${label} file name`);
  hashValue(descriptor.sha256, `${label} hash`);
  if (!Number.isInteger(descriptor.bytes) || descriptor.bytes < 0) fail('ARTIFACT_BYTES_INVALID', `${label} byte length is invalid.`);
  return descriptor;
}

export async function validateSelectedOutputManifest(value) {
  const manifest = objectValue(value, 'Selected-output manifest');
  if (manifest.schema !== 'SelectedOutputManifest.v1' || manifest.contractVersion !== 'inputxml-v2') fail('MANIFEST_SCHEMA_INVALID', 'Selected-output manifest schema or contract version is invalid.');
  if (manifest.status !== 'PASS') fail('MANIFEST_BLOCKED', 'Selected-output manifest must have PASS status.');
  hashValue(manifest.sourceHashSha256, 'Manifest source hash');
  const artifacts = objectValue(manifest.artifacts, 'Manifest artifacts');
  const required = selectedArtifactNames(manifest.approvedSemanticSplit);
  for (const name of required) validateDescriptor(artifacts[name], name);
  if (!manifest.approvedSemanticSplit && artifacts.approvedSemanticSplitEvidence) fail('UNSELECTED_APPROVAL_ARTIFACT', 'Strict release cannot select approval evidence.');
  const expected = await hashReleaseJson(manifest, 'manifestHashSha256');
  if (manifest.manifestHashSha256 !== expected) fail('MANIFEST_HASH_MISMATCH', 'Selected-output manifest hash is stale.');
  return freezeRecord(manifest);
}

export async function verifySelectedOutputFiles(manifestValue, filesByName) {
  const manifest = await validateSelectedOutputManifest(manifestValue);
  const files = objectValue(filesByName, 'Selected-output files');
  for (const [kind, descriptor] of Object.entries(manifest.artifacts)) {
    if (!(descriptor.fileName in files)) fail('ARTIFACT_MISSING', `Selected ${kind} file is missing: ${descriptor.fileName}.`);
    const bytes = releaseBytes(files[descriptor.fileName]);
    if (bytes.byteLength !== descriptor.bytes) fail('ARTIFACT_LENGTH_MISMATCH', `${descriptor.fileName} byte length does not match the manifest.`);
    if (await sha256Hex(bytes) !== descriptor.sha256) fail('ARTIFACT_HASH_MISMATCH', `${descriptor.fileName} hash does not match the manifest.`);
  }
  return manifest;
}
