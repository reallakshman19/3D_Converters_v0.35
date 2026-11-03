import { sha256Hex } from '../sha256.js';
import { canonicalJson } from '../canonical-json.js';
import { buildSelectedZoneGeometryManifest } from './geometry-manifest.js';
import { buildSelectedZonePackage } from './package-builder.js';
import { buildPackageArchive } from './archive.js';
import { buildSelectedZoneDiagnosticLedger } from './diagnostic-ledger.js';
import { FBX_ZONE_PACKAGE_LIMITS } from './constants.js';

const QUALIFICATION_REPORT_SCHEMA = 'FbxSelectedZonePackageQualificationReport.v1';

const COMPLETE_SOURCE_GRAPH_SHA256 = '9'.repeat(64);
const SOURCE_IDENTITY = { sha256: '8'.repeat(64), byteLength: 71486048, fbxVersion: 7500 };

// A deterministic synthetic truth set: N distinct closed tetrahedra, each
// translated along X so every geometry has unique, reproducible geometry.
function truthSetGeometries(count) {
  return Array.from({ length: count }, (_, index) => {
    const x = index * 20;
    return {
      geometryId: String(index + 1),
      occurrenceId: `occ:${index + 1}`,
      sourceObjectId: String(index + 101),
      controlPointsMm: [x, 0, 0, x + 10, 0, 0, x + 5, 10, 0, x + 5, 5, 10],
      polygonOffsets: [0, 3, 6, 9, 12],
      polygonVertexIndices: [0, 1, 2, 0, 1, 3, 1, 2, 3, 2, 0, 3],
    };
  });
}

async function buildOnce(geometries) {
  const { manifest, buffersByGeometryId } = await buildSelectedZoneGeometryManifest({
    completeSourceGraphSha256: COMPLETE_SOURCE_GRAPH_SHA256, sourceIdentity: SOURCE_IDENTITY, geometries,
  });
  const { files, audit } = await buildSelectedZonePackage({ manifest, buffersByGeometryId });
  const archive = await buildPackageArchive(files);
  const ledger = await buildSelectedZoneDiagnosticLedger({ manifest, geometries });
  return { manifest, files, audit, archive, ledger };
}

async function checkByteDeterminism(geometries) {
  const first = await buildOnce(geometries);
  const second = await buildOnce(geometries);
  const identical = first.archive.sha256 === second.archive.sha256
    && first.audit.packageDigest === second.audit.packageDigest
    && first.ledger.ledgerDigest === second.ledger.ledgerDigest;
  return { pass: identical, first, archiveSha256: first.archive.sha256 };
}

function checkResourceCeiling(build) {
  const fileCount = build.files.length;
  const archiveBytes = build.archive.bytes.byteLength;
  const withinFileCeiling = fileCount <= FBX_ZONE_PACKAGE_LIMITS.maxPackageFiles;
  const withinByteCeiling = archiveBytes <= FBX_ZONE_PACKAGE_LIMITS.maxGeometryBufferBytes * fileCount;
  return {
    pass: withinFileCeiling && withinByteCeiling, fileCount, archiveBytes,
    maxPackageFiles: FBX_ZONE_PACKAGE_LIMITS.maxPackageFiles,
  };
}

function checkLedgerCoverage(build, expectedCount) {
  const covered = build.ledger.entries.length === expectedCount
    && build.ledger.summary.totalGeometries === expectedCount;
  return { pass: covered, explained: build.ledger.entries.length, expected: expectedCount };
}

/**
 * Phase 7: exercises the full Phase 1/5/6 pipeline against a deterministic
 * synthetic truth set and reports byte determinism, resource-ceiling, and
 * full-coverage evidence with explicit pass/fail thresholds. This is not a
 * substitute for real TAY-A qualification (see the Phase 7 doc for the
 * explicit gap) — it certifies the pipeline's own mechanical guarantees.
 */
export async function runZonePackageQualification({ geometryCount = 200 } = {}) {
  const geometries = truthSetGeometries(geometryCount);
  const determinism = await checkByteDeterminism(geometries);
  const resourceCeiling = checkResourceCeiling(determinism.first);
  const ledgerCoverage = checkLedgerCoverage(determinism.first, geometryCount);
  const checks = { byteDeterminism: determinism.pass, resourceCeiling: resourceCeiling.pass, ledgerCoverage: ledgerCoverage.pass };
  const overallStatus = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
  const report = {
    schema: QUALIFICATION_REPORT_SCHEMA,
    geometryCount,
    checks,
    archiveSha256: determinism.archiveSha256,
    resourceCeiling,
    ledgerCoverage,
    overallStatus,
  };
  return { ...report, reportDigest: await sha256Hex(canonicalJson(report)) };
}
