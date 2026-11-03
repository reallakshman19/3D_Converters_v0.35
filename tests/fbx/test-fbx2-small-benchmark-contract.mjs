import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  buildFbx2SmallBenchmarkReport,
  validateFbx2SmallBenchmarkReport,
} from '../../scripts/fbx/fbx2-small-benchmark/report.mjs';

const hash = (digit) => digit.repeat(64);

function validateSchema(schema, instance) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
errors = sorted(Draft202012Validator(payload["schema"]).iter_errors(payload["instance"]),
                key=lambda error: (list(error.absolute_path), error.message))
print(json.dumps([{"path": list(error.absolute_path), "message": error.message}
                  for error in errors]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

const managedRecord = Object.freeze({
  managedRecordId: 'BRANCH-A::PIPE-1', branchId: 'BRANCH-A', reference: 'PIPE-1',
  outerType: 'PIPE', rawType: 'PIPE', family: 'PIPE', generated: false,
  generationMethod: null, status: 'PASS', disposition: 'PIPE_GEOMETRY_PARITY_PASS',
  exactSourceOccurrenceId: 'occ:pipe-1', candidateSourceOccurrenceIds: [], reasons: [],
});
const sourceRecord = Object.freeze({
  sourceOccurrenceId: 'occ:pipe-1', sourceModelObjectId: 'model:pipe-1',
  parentOccurrenceId: 'occ:zone', geometryObjectIds: ['geometry:pipe-1'], displayName: 'Pipe 1',
  domSubtype: 'Mesh', rawType: null, autoPipeAdmitted: true, autoPipeReason: null,
  supportCandidateId: null, solidTopologyDispositions: ['STRAIGHT_TWO_PORT'], status: 'PASS',
  disposition: 'PIPE_ADMITTED', reasons: [],
});
const managedSummary = Object.freeze({
  managedComponentCount: 1, terminalDispositionCount: 1, passCount: 1,
  blockedCount: 0, unresolvedCount: 0, coverageRatio: 1, parityRatio: 1,
  parityTargetRatio: 1, parityTargetMet: true,
});
const sourceSummary = Object.freeze({
  selectedOccurrenceCount: 1, terminalDispositionCount: 1, passCount: 1,
  blockedCount: 0, coverageRatio: 1, dispositionCounts: { PIPE_ADMITTED: 1 },
});
const packageSummary = Object.freeze({
  status: 'BLOCKED', artifactId: null, rootDigest: null, checks: [],
  blockedChecks: ['MAPPING_REQUIRED'], error: null,
});
const managedInventory = Object.freeze({
  summary: Object.freeze({
    branchCount: 1, componentCount: 1, supportComponentCount: 0,
    unsupportedComponentCount: 0, generatedComponentCount: 0,
    positionalIdentityCount: 0, familyCounts: { PIPE: 1 }, rawTypeCounts: { PIPE: 1 },
  }),
});

function run() {
  return Object.freeze({
    identities: Object.freeze({
      sourceGraphDigest: hash('1'), geometryBundleDigest: hash('2'),
      zoneGeometryArtifactId: 'FBXZGEOM-contract', autoPipeDigest: hash('3'),
      componentCrosswalkArtifactId: 'FBXZCROSS-contract', elbowArtifactId: 'FBXELBO-contract',
      teeArtifactId: 'FBXTEE-contract', reducerArtifactId: 'FBXREDU-contract',
      branchFittingArtifactId: 'FBXOLET-contract', inlineAssemblyArtifactId: 'FBXINLINE-contract',
      supportEvidenceDigest: hash('4'), supportHostEvidenceDigest: hash('5'),
      supportAssemblyEvidenceDigest: hash('6'), qualificationRootDigest: null,
    }),
    managedInventory,
    sourceInventory: Object.freeze({ records: [sourceRecord], summary: sourceSummary }),
    reconciliation: Object.freeze({
      records: [managedRecord], familySummary: [{
        family: 'PIPE', total: 1, pass: 1, blocked: 0, unresolved: 0, parityRatio: 1,
      }], summary: managedSummary,
    }),
    packageSummary,
  });
}

const report = buildFbx2SmallBenchmarkReport({
  source: {
    file: '.tmp/fbx2/input/STF.fbx', byteLength: 10066688, sha256: hash('7'),
    archive: 'Benchmarks/FBX2/STF_2026Jul23-1554_binary.zip',
    archiveByteLength: 3126315, archiveSha256: hash('8'),
  },
  managedStage: {
    file: '.tmp/fbx2/output/ATTRIBUTE_GL_managed_stage.json', byteLength: 1687826,
    sha256: hash('9'), archive: 'Benchmarks/FBX2/ATTRIBUTE_GL_managed_stage.zip',
    archiveByteLength: 73205, archiveSha256: hash('a'),
  },
  selectedZone: {
    zoneId: 'occ:zone', label: '/GLRD-1000-CU-PI-P', sourcePointCount: 10,
    selectedOccurrenceCount: 1, selectedGeometryIds: ['geometry:pipe-1'], selectedGeometryCount: 1,
  },
  runs: [run(), run()],
});

const schema = JSON.parse(await readFile(new URL(
  '../../contracts/fbx/fbx2-small-benchmark.v1.schema.json', import.meta.url), 'utf8'));
assert.deepEqual(validateSchema(schema, report), []);
assert.equal(validateFbx2SmallBenchmarkReport(report), report);
assert.equal(report.status, 'COMPLETE_TARGET_MET');
assert.notDeepEqual(validateSchema(schema, { ...report, unexpected: true }), []);
assert.notDeepEqual(validateSchema(schema, {
  ...report, managedRecords: [{ ...report.managedRecords[0], status: 'INFERRED' }],
}), []);

console.log('test-fbx2-small-benchmark-contract: PASS');
