/**
 * Functionality: read manifest-selected InputXML v2 evidence and classify comparison differences.
 * Parameters: an exact file-name-to-bytes map and an explicit selected-manifest file name.
 * Outputs: release validation state with normalized and semantic/topological differences separated.
 * Fallback: manifest-free evidence is viewable only as LEGACY_UNVERIFIED and is never release eligible.
 */
import { releaseBytes } from './inputxml-release-hash.js';
import {
  InputXmlReleaseContractError,
  validateApprovedSemanticSplit,
  validateCompatibilityPolicy,
  verifySelectedOutputFiles,
} from './inputxml-release-contracts.js';
import { validateInputXmlCompatibilityRequest } from './inputxml-compatibility-request.js';

function decodeJson(bytes, label) {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(releaseBytes(bytes)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('root must be an object');
    return value;
  } catch (error) {
    throw new InputXmlReleaseContractError('EVIDENCE_JSON_INVALID', `${label} is not valid UTF-8 JSON: ${error.message}.`);
  }
}

function requiredArtifact(manifest, files, role) {
  const descriptor = manifest.artifacts?.[role];
  const bytes = descriptor ? files[descriptor.fileName] : null;
  if (!descriptor || bytes === undefined || bytes === null) {
    throw new InputXmlReleaseContractError('EVIDENCE_ARTIFACT_MISSING', `Required InputXML v2 evidence is missing: ${role}.`);
  }
  return decodeJson(bytes, `${role} (${descriptor.fileName})`);
}

function normalizedDifferences(plan) {
  const operations = Array.isArray(plan.operations) ? plan.operations : [];
  const diagnostics = Array.isArray(plan.diagnostics) ? plan.diagnostics : [];
  return Object.freeze({ operations: Object.freeze([...operations]), diagnostics: Object.freeze([...diagnostics]) });
}

function semanticTopologyDifferences(parity) {
  const mismatches = Array.isArray(parity.mismatches) ? parity.mismatches : [];
  return Object.freeze({ status: parity.status, mismatches: Object.freeze([...mismatches]), summary: Object.freeze({ ...(parity.summary || {}) }) });
}

function validateEvidenceSchemas(plan, parity, assurance, projection, diagnostics, resolverTrace) {
  if (plan.schema !== 'InputXmlNormalizationPlan.v1') throw new InputXmlReleaseContractError('NORMALIZATION_SCHEMA_INVALID', 'InputXML v2 normalization plan schema is invalid.');
  if (parity.schema !== 'TopologyParityReport.v2' || parity.status !== 'PASS') throw new InputXmlReleaseContractError('TOPOLOGY_PARITY_BLOCKED', 'InputXML v2 topology parity must be PASS.');
  if (assurance.schema !== 'InputXmlCiiAssuranceLedger.v2' || assurance.status !== 'PASS') throw new InputXmlReleaseContractError('ASSURANCE_BLOCKED', 'InputXML v2 assurance must be PASS.');
  if (projection.schema !== 'InputXmlCiiProjectionLedger.v1' || projection.status !== 'PASS') throw new InputXmlReleaseContractError('PROJECTION_BLOCKED', 'InputXML CII projection evidence must be PASS.');
  if (diagnostics.schema !== 'InputXmlDiagnosticReport.v1' || diagnostics.status !== 'PASS') throw new InputXmlReleaseContractError('DIAGNOSTIC_REPORT_BLOCKED', 'InputXML diagnostic report must be PASS.');
  if (resolverTrace.schema !== 'InputXmlResolverTrace.v1' || resolverTrace.status !== 'PASS') throw new InputXmlReleaseContractError('RESOLVER_TRACE_BLOCKED', 'InputXML resolver trace must be PASS.');
}

export async function readInputXmlReleaseEvidence(filesByName, manifestFileName) {
  if (!filesByName || typeof filesByName !== 'object' || Array.isArray(filesByName)) {
    throw new InputXmlReleaseContractError('EVIDENCE_FILES_INVALID', 'InputXML evidence files must be a file-name-to-bytes object.');
  }
  if (!manifestFileName) {
    return Object.freeze({ classification: 'LEGACY_UNVERIFIED', releaseValidated: false, normalizedDifferences: null, semanticTopologyDifferences: null });
  }
  const manifestBytes = filesByName[manifestFileName];
  if (manifestBytes === undefined) throw new InputXmlReleaseContractError('MANIFEST_MISSING', `Selected-output manifest is missing: ${manifestFileName}.`);
  const manifest = await verifySelectedOutputFiles(decodeJson(manifestBytes, manifestFileName), filesByName);
  const request = await validateInputXmlCompatibilityRequest(requiredArtifact(manifest, filesByName, 'compatibilityRequest'));
  if (request.sourceHashSha256 !== manifest.sourceHashSha256) throw new InputXmlReleaseContractError('REQUEST_SOURCE_MISMATCH', 'InputXML compatibility request source hash differs from the selected manifest.');
  const policy = validateCompatibilityPolicy(requiredArtifact(manifest, filesByName, 'compatibilityPolicy'));
  if (policy.status !== 'PASS') throw new InputXmlReleaseContractError('POLICY_BLOCKED', 'Release-selected compatibility policy is not PASS.');
  const plan = requiredArtifact(manifest, filesByName, 'normalizationPlan');
  const parity = requiredArtifact(manifest, filesByName, 'topologyParityReport');
  const assurance = requiredArtifact(manifest, filesByName, 'assuranceLedger');
  const projection = requiredArtifact(manifest, filesByName, 'ciiProjectionLedger');
  const diagnostics = requiredArtifact(manifest, filesByName, 'diagnosticReport');
  const resolverTrace = requiredArtifact(manifest, filesByName, 'resolverTrace');
  validateEvidenceSchemas(plan, parity, assurance, projection, diagnostics, resolverTrace);
  const approval = manifest.approvedSemanticSplit
    ? await validateApprovedSemanticSplit(requiredArtifact(manifest, filesByName, 'approvedSemanticSplitEvidence'))
    : null;
  if (approval && approval.artifactHashSha256 !== manifest.approvedSemanticSplit.artifactHashSha256) {
    throw new InputXmlReleaseContractError('APPROVAL_SELECTION_MISMATCH', 'Selected approval bytes differ from the manifest approval reference.');
  }
  return Object.freeze({
    classification: 'RELEASE_VALIDATED_V2',
    releaseValidated: true,
    manifest,
    compatibilityRequest: request,
    compatibilityPolicy: policy,
    diagnosticReport: diagnostics,
    resolverTrace,
    approvedSemanticSplit: approval,
    normalizedDifferences: normalizedDifferences(plan),
    semanticTopologyDifferences: semanticTopologyDifferences(parity),
  });
}
