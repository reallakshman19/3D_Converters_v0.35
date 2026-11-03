import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  XML_CII_DTXR_WALL_EVIDENCE_SCHEMA,
  resolveXmlCiiWallThicknessWithEvidence,
} from '../converters/xml-cii2019-core/dtxr-wall-evidence-ledger.js';

test('selected PIPE schedule retains exact component and source ancestry', () => {
  const result = resolveXmlCiiWallThicknessWithEvidence({
    boreMm: 250,
    dtxrValues: [
      {
        componentType: 'PIPE',
        componentRefNo: '=PIPE-1001',
        boreMm: 250,
        dtxr: 'PIPE NPS 10 SCH 80',
        source: 'xml-dtxr',
      },
    ],
  });

  assert.equal(result.wallThicknessMm, 15.09);
  assert.equal(result.evidenceSchema, XML_CII_DTXR_WALL_EVIDENCE_SCHEMA);
  assert.equal(result.selectedEvidence.componentType, 'PIPE');
  assert.equal(result.selectedEvidence.componentRefNo, '=PIPE-1001');
  assert.equal(result.selectedEvidence.boreMm, 250);
  assert.equal(result.selectedEvidence.source, 'xml-dtxr');
  assert.equal(result.selectedEvidence.schedule, '80');
  assert.equal(result.selectedEvidence.nps, '10');
  assert.ok(result.selectedEvidence.provenance, 'pipe-data provenance must be retained');
  assert.equal(result.evidenceRecords[0].disposition, 'SELECTED');
});

test('blocked support and mismatched-bore evidence receive explicit dispositions', () => {
  const result = resolveXmlCiiWallThicknessWithEvidence({
    boreMm: 250,
    dtxrValues: [
      {
        componentType: 'SUPPORT',
        componentRefNo: 'SUP-1',
        boreMm: 250,
        dtxr: 'SUPPORT SHOE SCH 160',
        source: 'staged-json',
      },
      {
        componentType: 'PIPE',
        componentRefNo: 'PIPE-50',
        boreMm: 50,
        dtxr: 'PIPE SCH 160',
        source: 'staged-json',
      },
      {
        componentType: 'FLAN',
        componentRefNo: 'FL-250',
        boreMm: 250,
        dtxr: 'WELDING NECK FLANGE Wth 40.0',
        source: 'xml-dtxr-pos',
      },
    ],
  });

  assert.equal(result.wallThicknessMm, 40);
  assert.equal(result.selectedEvidence.componentRefNo, 'FL-250');
  assert.equal(result.evidenceCount, 3);
  assert.equal(result.eligibleEvidenceCount, 1);
  assert.equal(result.rejectedEvidenceCount, 2);
  assert.equal(result.evidenceRecords[0].disposition, 'REJECTED_BLOCKED_CARRIER_TYPE');
  assert.equal(result.evidenceRecords[1].disposition, 'REJECTED_BORE_MISMATCH');
  assert.equal(result.evidenceRecords[2].disposition, 'SELECTED');
});

test('lower-priority valid evidence remains auditable without changing selection', () => {
  const result = resolveXmlCiiWallThicknessWithEvidence({
    boreMm: 250,
    dtxrValues: [
      { componentType: 'FLAN', componentRefNo: 'FL-1', boreMm: 250, dtxr: 'FLANGE SCH 40', source: 'xml-dtxr' },
      { componentType: 'PIPE', componentRefNo: 'P-1', boreMm: 250, dtxr: 'PIPE SCH 80', source: 'xml-dtxr' },
    ],
  });

  assert.equal(result.wallThicknessMm, 15.09);
  assert.equal(result.selectedEvidence.componentRefNo, 'P-1');
  assert.equal(result.evidenceRecords[0].disposition, 'ELIGIBLE_SCHEDULE');
  assert.equal(result.evidenceRecords[1].disposition, 'SELECTED');
  assert.equal(result.selectionPolicy, 'existing-resolver-rank-then-source-sequence');
});

test('parsed but unsupported schedule is rejected rather than called eligible', () => {
  const result = resolveXmlCiiWallThicknessWithEvidence({
    boreMm: 250,
    dtxrValues: [
      { componentType: 'FLAN', componentRefNo: 'FL-999', boreMm: 250, dtxr: 'FLANGE SCH 999', source: 'staged-json' },
      { componentType: 'PIPE', componentRefNo: 'P-80', boreMm: 250, dtxr: 'PIPE SCH 80', source: 'xml-dtxr' },
    ],
  });

  assert.equal(result.wallThicknessMm, 15.09);
  assert.equal(result.evidenceRecords[0].schedule, '999');
  assert.equal(result.evidenceRecords[0].candidateWallThicknessMm, null);
  assert.equal(result.evidenceRecords[0].disposition, 'REJECTED_UNRESOLVED_WALL_EVIDENCE');
  assert.equal(result.evidenceRecords[1].disposition, 'SELECTED');
});

test('Preview authority exposes complete structured wall evidence fields', () => {
  const source = fs.readFileSync(
    new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-bore-wall-authority.js', import.meta.url),
    'utf8',
  );
  for (const token of [
    'dtxrWallComponentRefNo',
    'dtxrWallEvidenceSource',
    'dtxrWallProvenance',
    'dtxrWallSelectedEvidence',
    'dtxrWallEvidenceRecords',
    'dtxrWallRejectedEvidenceCount',
  ]) {
    assert.ok(source.includes(token), `Preview wall authority missing ${token}`);
  }
});
