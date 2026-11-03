import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EI_AVIFF_SBC_T3_MASTER_IDS,
  buildEiAviffSbcT3CandidateRegistry,
  inspectEiAviffSbcT3TableCandidate,
  resolveEiAviffSbcT3CurveCandidate,
  resolveVibrationMaster,
} from '../converters/vibration/masters/index.js';

const SOURCE_COMMIT = '6111ddbc0f27dd95b50a80c569a2c4daba3b3921';

async function manifest() {
  return JSON.parse(await readFile(new URL(
    '../data/vibration/ei-aviff-2e/source-manifest.v1.json', import.meta.url,
  ), 'utf8'));
}

test('source manifest pins the exact Advanced_Analysis Stage-1 objects', async () => {
  const source = await manifest();
  assert.equal(source.repository, 'reallaksh19/Advanced_Analysis');
  assert.equal(source.commit, SOURCE_COMMIT);
  assert.equal(source.runtimeFetchAllowed, false);
  assert.deepEqual(source.files.map((item) => item.gitBlobSha1), [
    '5312c9e2cf86af9e940ba722fcbee64702aeccd3',
    'c050cd90802c27241c510c6f0ac43bfaf7a89e9d',
    '51bca43473be8018d4ce48fb440ee4d7bd0abc82',
    '72730d065bcd2aa80976f0ad2870aafacff0bb4c',
  ]);
  assert.equal(source.stage1Disposition.curvesT3_1_T3_2_T3_3_T3_4, 'BLOCKED_SOURCE_DATA_CONFLICT');
});

test('candidate registry contains the three source-reconciled T3 tables and remains non-active', async () => {
  const registry = await buildEiAviffSbcT3CandidateRegistry();
  assert.equal(registry.records.length, 3);
  assert(registry.records.every((record) => record.publicationState === 'CANDIDATE'));
  assert(registry.records.every((record) => record.authorityClass === 'EI_METHOD_MASTER'));
  assert(registry.records.every((record) => record.source.commit === SOURCE_COMMIT));
  assert.throws(
    () => resolveVibrationMaster(registry, EI_AVIFF_SBC_T3_MASTER_IDS.firstSpanLimits),
    /VIBRATION_MASTER_NOT_ACTIVE/u,
  );
});

test('T3-1 fitting span factor lookup is exact and provenance-bearing', async () => {
  const result = await inspectEiAviffSbcT3TableCandidate(
    EI_AVIFF_SBC_T3_MASTER_IDS.fittingSpanFactors,
    { fittingKey: 'WELDOLET' },
  );
  assert.equal(result.status, 'CANDIDATE_ONLY');
  assert.equal(result.row.fittingSpanFactor, 0.7);
  assert.equal(result.provenance.sourceLocator.identifier, 'Table T3-1');
  assert.equal(result.authority.masterDataAuthority, false);
  await assert.rejects(
    () => inspectEiAviffSbcT3TableCandidate(
      EI_AVIFF_SBC_T3_MASTER_IDS.fittingSpanFactors, { fittingKey: 'weldolet' },
    ),
    /SBC_T3_MASTER_GRID_MISS/u,
  );
});

test('T3-2 and T3-3 use exact nominal-size grid with no interpolation', async () => {
  const first = await inspectEiAviffSbcT3TableCandidate(
    EI_AVIFF_SBC_T3_MASTER_IDS.firstSpanLimits, { sbcSizeIn: 1.5 },
  );
  const between = await inspectEiAviffSbcT3TableCandidate(
    EI_AVIFF_SBC_T3_MASTER_IDS.betweenMainLinesLimits, { sbcSizeIn: '2.0' },
  );
  assert.equal(first.row.minimumAllowableFirstSpanM, 1.3);
  assert.equal(between.row.minimumSpanBetweenMainLinesM, 2.0);
  await assert.rejects(
    () => inspectEiAviffSbcT3TableCandidate(
      EI_AVIFF_SBC_T3_MASTER_IDS.firstSpanLimits, { sbcSizeIn: 1.6 },
    ),
    /SBC_T3_MASTER_GRID_MISS/u,
  );
});

test('all T3 curve requests are quarantined and never return a numerical master value', () => {
  for (const figure of ['T3-1', 'T3-2', 'T3-3', 'T3-4']) {
    const result = resolveEiAviffSbcT3CurveCandidate(figure);
    assert.equal(result.status, 'BLOCKED_SOURCE_DATA_CONFLICT');
    assert.equal(result.value, null);
    assert.equal(result.quarantine.runtimeCurveActivation, false);
    assert.equal(result.quarantine.masterPublicationAuthorized, false);
    assert.equal(result.quarantine.authority.screeningAuthority, 'NOT_AUTHORIZED');
  }
});

test('D7 contradictions remain explicit permanent quarantine evidence', () => {
  const result = resolveEiAviffSbcT3CurveCandidate('T3-1');
  assert.deepEqual(
    result.quarantine.failingWorkedExampleProbes.map((item) => [item.figure, item.expectedLof, item.suppliedLof]),
    [['T3-1', 0.2, 0.4], ['T3-3', 0.6, 0.7], ['T3-4', 0.2, 0.3]],
  );
});