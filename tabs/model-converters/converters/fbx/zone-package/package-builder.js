import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { buildPackageArtifactFiles } from './package-artifacts.js';
import { validateSelectedZoneGeometryManifest } from './geometry-manifest.js';
import { validateSupportCandidateEvidence } from './support-evidence.js';
import { validateSelectedZonePackage } from './package-validation.js';
import {
  FBX_ZONE_PACKAGE_LIMITS, FBX_ZONE_PACKAGE_SCHEMAS, fail,
} from './constants.js';

function bytesView(value, label = 'file bytes') {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  fail('ZONE_PACKAGE_INVALID_FILE', `${label} must be bytes.`);
}
function textFile(path, text) {
  return { path, bytes: new TextEncoder().encode(text) };
}
function comparePath(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}
async function presentRecord(role, file) {
  const bytes = bytesView(file.bytes, file.path);
  return {
    role, path: file.path, disposition: 'PRESENT',
    sha256: await sha256Hex(bytes), byteLength: bytes.byteLength, reason: null,
  };
}
function omittedRecord(role, path, reason) {
  const text = String(reason || '').trim();
  if (!text) fail('ZONE_PACKAGE_INVALID_AUDIT', `${role} omission requires a reason.`);
  return {
    role, path, disposition: 'OMITTED_BLOCKED',
    sha256: null, byteLength: 0, reason: text,
  };
}
function descriptorPayload(entry) {
  return {
    geometryId: entry.geometryId,
    sourceObjectId: entry.sourceObjectId,
    occurrenceIds: [...entry.occurrenceIds],
    controlPointCount: entry.controlPointCount,
    polygonCount: entry.polygonCount,
  };
}
async function geometryFiles(manifest, buffersByGeometryId) {
  if (!(buffersByGeometryId instanceof Map)) {
    fail('ZONE_PACKAGE_MISSING_BUFFERS', 'buffersByGeometryId must be a Map.');
  }
  const files = [];
  for (const entry of manifest.geometries) {
    const raw = buffersByGeometryId.get(entry.geometryId);
    if (!raw) {
      fail('ZONE_PACKAGE_MISSING_BUFFERS',
        `no raw buffers supplied for geometryId ${entry.geometryId}.`);
    }
    files.push({
      role: 'GEOMETRY_DESCRIPTOR',
      ...textFile(entry.packagePath, canonicalJson(descriptorPayload(entry))),
    });
    for (const descriptor of entry.buffers) {
      const rawBuffer = raw[descriptor.role];
      if (!rawBuffer) {
        fail('ZONE_PACKAGE_MISSING_BUFFERS',
          `raw buffer ${entry.geometryId}/${descriptor.role} is missing.`);
      }
      const bytes = bytesView(rawBuffer.bytes,
        `${entry.geometryId}/${descriptor.role}`);
      const actualHash = await sha256Hex(bytes);
      if (actualHash !== descriptor.sha256
          || bytes.byteLength !== descriptor.byteLength
          || rawBuffer.sha256 !== descriptor.sha256
          || rawBuffer.byteLength !== descriptor.byteLength) {
        fail('ZONE_PACKAGE_BUFFER_MISMATCH',
          `raw buffer ${entry.geometryId}/${descriptor.role} differs from the manifest.`);
      }
      files.push({
        role: 'GEOMETRY_BUFFER', path: descriptor.packagePath, bytes: bytes.slice(),
      });
    }
  }
  return files;
}
function validatedStagedJson(text) {
  if (text == null) return null;
  if (typeof text !== 'string' || !text.trim()) {
    fail('ZONE_PACKAGE_INVALID_STAGEDJSON',
      'stagedJsonText must be non-empty JSON text.');
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object') {
      fail('ZONE_PACKAGE_INVALID_STAGEDJSON',
        'stagedJsonText must contain a JSON object or array.');
    }
  } catch (error) {
    if (error?.code === 'ZONE_PACKAGE_INVALID_STAGEDJSON') throw error;
    fail('ZONE_PACKAGE_INVALID_STAGEDJSON',
      `stagedJsonText is invalid JSON: ${error?.message || error}`);
  }
  return textFile('stagedjson.json', text);
}
async function validatedSupportEvidence(value, manifest) {
  if (value == null) return null;
  await validateSupportCandidateEvidence(value);
  if (value.selectedZoneDigest !== manifest.selectedZoneDigest) {
    fail('ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE',
      'supportEvidence is not bound to the selected manifest.');
  }
  return textFile('support-evidence.json', canonicalJson(value));
}
function physicalFiles(manifestFile, geometryFileList, stagedFile, supportFile,
  artifactFiles) {
  return [
    manifestFile, ...geometryFileList,
    ...(stagedFile ? [stagedFile] : []),
    ...(supportFile ? [supportFile] : []),
    ...artifactFiles,
  ].sort(comparePath);
}
async function auditFor(manifest, manifestFile, physical, stagedFile, supportFile,
  stagedJsonOmissionReason, supportEvidenceOmissionReason, omittedArtifacts) {
  const records = await Promise.all(
    physical.map((file) => presentRecord(file.role, file)));
  if (!stagedFile) {
    records.push(omittedRecord('STAGEDJSON', 'stagedjson.json',
      stagedJsonOmissionReason));
  }
  if (!supportFile) {
    records.push(omittedRecord('SUPPORT_EVIDENCE', 'support-evidence.json',
      supportEvidenceOmissionReason));
  }
  records.push(...omittedArtifacts);
  records.sort(comparePath);
  const auditBase = {
    schema: FBX_ZONE_PACKAGE_SCHEMAS.packageAudit,
    manifestSha256: await sha256Hex(manifestFile.bytes),
    manifestDigest: manifest.manifestDigest,
    selectedZoneDigest: manifest.selectedZoneDigest,
    files: records,
    supportSemantics: supportFile ? 'CANDIDATE_EVIDENCE_ONLY' : 'NOT_AUTHORIZED',
    geometryCount: manifest.geometries.length,
  };
  return {
    ...auditBase,
    packageDigest: await sha256Hex(canonicalJson(auditBase)),
  };
}

export { validateSelectedZonePackage } from './package-validation.js';

export async function buildSelectedZonePackage({
  manifest, buffersByGeometryId, stagedJsonText = null, supportEvidence = null,
  artifacts = {}, artifactOmissionReasons = {},
  stagedJsonOmissionReason = 'StagedJSON was not produced for this selected zone.',
  supportEvidenceOmissionReason = 'Support evidence was not produced for this selected zone.',
} = {}) {
  await validateSelectedZoneGeometryManifest(manifest);
  const manifestFile = {
    role: 'MANIFEST', ...textFile('manifest.json', canonicalJson(manifest)),
  };
  const geometryFileList = await geometryFiles(manifest, buffersByGeometryId);
  const stagedValue = validatedStagedJson(stagedJsonText);
  const stagedFile = stagedValue ? { role: 'STAGEDJSON', ...stagedValue } : null;
  const supportValue = await validatedSupportEvidence(supportEvidence, manifest);
  const supportFile = supportValue
    ? { role: 'SUPPORT_EVIDENCE', ...supportValue } : null;
  const packagedArtifacts = buildPackageArtifactFiles(artifacts, artifactOmissionReasons);
  const physical = physicalFiles(
    manifestFile, geometryFileList, stagedFile, supportFile, packagedArtifacts.files);
  if (physical.length + 1 > FBX_ZONE_PACKAGE_LIMITS.maxPackageFiles) {
    fail('ZONE_PACKAGE_LIMIT_EXCEEDED',
      `package file count exceeds ${FBX_ZONE_PACKAGE_LIMITS.maxPackageFiles}.`);
  }
  const audit = await auditFor(
    manifest, manifestFile, physical, stagedFile, supportFile,
    stagedJsonOmissionReason, supportEvidenceOmissionReason, packagedArtifacts.omitted);
  const files = [
    ...physical.map(({ path, bytes }) => ({ path, bytes })),
    textFile('audit.json', canonicalJson(audit)),
  ];
  await validateSelectedZonePackage({ files, audit });
  return { files, audit };
}
