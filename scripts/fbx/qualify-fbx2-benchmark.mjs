import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const EXPECTED = Object.freeze({
  auditSchema: 'Fbx2BenchmarkAudit.v2',
  inputArchiveSha256: '18758c5283b852efb2a1154fd07dcd9982c088b793e4ffe63b1a9ab2f11e6131',
  inputFbxSha256: '7f198ce867ea33ce98b6d4f73f5a06c3c0e9a2f1a8e35412a63e38c504c83c1b',
  outputArchiveSha256: 'e0dbbc42ddedd17e96c3eadced2a4d65e10a333552c791dea4e725b9feea4cd8',
  managedJsonSha256: '5b7430e371442c9b24d8eba87edbbfb5c3c52761a13c743fa2bcff94418c6f1e',
  zoneLabel: '/GLRD-1000-CU-PI-P',
  selectedOccurrences: 438,
  selectedGeometries: 438,
  admittedPipes: 112,
  rejectedOccurrences: 326,
  stagedBranches: 112,
  pipeLinks: 0,
  managedPipeRecords: 197,
  unresolvedCylinderRecords: 1,
});

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function countOf(entries, value) {
  return entries.find((item) => item.value === value)?.count || 0;
}

function assertImmutableSources(audit) {
  assert.equal(audit.schema, EXPECTED.auditSchema);
  assert.equal(audit.source.archiveSha256, EXPECTED.inputArchiveSha256);
  assert.equal(audit.source.sha256, EXPECTED.inputFbxSha256);
  assert.equal(audit.managedStage.archiveSha256, EXPECTED.outputArchiveSha256);
  assert.equal(audit.managedStage.sha256, EXPECTED.managedJsonSha256);
}

function assertSelectedZone(audit) {
  assert.equal(audit.targetZone.label, EXPECTED.zoneLabel);
  assert.equal(audit.targetZone.selectedOccurrenceCount, EXPECTED.selectedOccurrences);
  assert.equal(audit.targetZone.selectedGeometryCount, EXPECTED.selectedGeometries);
  assert.equal(audit.zoneAnalysis.status, 'ZONE_GEOMETRY_PASS');
  assert.equal(audit.zoneAnalysis.autoPipeStatus, 'STAGEDJSON_PASS');
}

function assertDirectPipeRelease(audit) {
  const counts = audit.zoneAnalysis.autoPipeCounts;
  assert.equal(counts.classifiedOccurrences, EXPECTED.selectedOccurrences);
  assert.equal(counts.admittedPipes, EXPECTED.admittedPipes);
  assert.equal(counts.rejectedOccurrences, EXPECTED.rejectedOccurrences);
  assert.equal(counts.links, EXPECTED.pipeLinks);
  assert.equal(counts.branches, EXPECTED.stagedBranches);
  const classifications = audit.zoneAnalysis.autoPipeClassifications;
  assert.deepEqual(classifications.admittedFamilies, [
    { value: 'CYLINDER', count: EXPECTED.admittedPipes },
  ]);
  assert.equal(countOf(classifications.methods, 'CLOSED_SOLID_CYLINDER'), EXPECTED.admittedPipes);
  assert.equal(countOf(classifications.methods, 'NONE'), EXPECTED.rejectedOccurrences);
  assert.equal(countOf(classifications.familyReasons, 'CYLINDER:ADMITTED'), EXPECTED.admittedPipes);
  assert.equal(countOf(classifications.familyReasons, 'CYLINDER:BOUNDARY_COUNT'),
    EXPECTED.unresolvedCylinderRecords);
}

function managedPipeCount(audit) {
  return countOf(audit.managedStage.summary.semanticTypes, 'PIPE');
}

function qualificationRecord(audit) {
  const managedPipes = managedPipeCount(audit);
  const directPipes = audit.zoneAnalysis.autoPipeCounts.admittedPipes;
  return {
    schema: 'Fbx2BenchmarkQualification.v1',
    disposition: 'DIRECT_PIPE_STAGEDJSON_PASS',
    source: {
      inputArchiveSha256: audit.source.archiveSha256,
      inputFbxSha256: audit.source.sha256,
      outputArchiveSha256: audit.managedStage.archiveSha256,
      managedJsonSha256: audit.managedStage.sha256,
    },
    selectedZone: {
      zoneId: audit.targetZone.zoneId,
      label: audit.targetZone.label,
      occurrenceCount: audit.targetZone.selectedOccurrenceCount,
      geometryCount: audit.targetZone.selectedGeometryCount,
    },
    directRelease: {
      admittedPipeCount: directPipes,
      rejectedOccurrenceCount: audit.zoneAnalysis.autoPipeCounts.rejectedOccurrences,
      stagedBranchCount: audit.zoneAnalysis.autoPipeCounts.branches,
      linkCount: audit.zoneAnalysis.autoPipeCounts.links,
      admittedFamilies: audit.zoneAnalysis.autoPipeClassifications.admittedFamilies,
    },
    managedComparison: {
      managedPipeRecordCount: managedPipes,
      directPipeCoverageCount: directPipes,
      unresolvedOrGeneratedPipeRecordCount: managedPipes - directPipes,
      directPipeCoverageRatio: directPipes / managedPipes,
      parityDisposition: 'NOT_CLAIMED',
    },
    limitations: [
      'Only directly evidenced straight Cylinder occurrences are released as PIPE.',
      'Managed-stage fittings and engineering attributes are not inferred by this release.',
      'Generated gap PIPE records and fitting-mediated route reconstruction are not included.',
      'Zero direct PIPE-to-PIPE links are expected because fittings separate the admitted cylinders.',
    ],
  };
}

async function main() {
  const auditPath = argument('--audit');
  const outputPath = argument('--output', 'artifacts/fbx2-benchmark-qualification.json');
  assert.ok(auditPath, '--audit is required.');
  const audit = JSON.parse(await readFile(auditPath, 'utf8'));
  assertImmutableSources(audit);
  assertSelectedZone(audit);
  assertDirectPipeRelease(audit);
  assert.equal(managedPipeCount(audit), EXPECTED.managedPipeRecords);
  const record = qualificationRecord(audit);
  assert.equal(record.managedComparison.unresolvedOrGeneratedPipeRecordCount, 85);
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(record, null, 2));
}

await main();
