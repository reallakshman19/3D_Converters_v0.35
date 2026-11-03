import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAivEitImport } from '../converters/vibration/aiv/aiv-eit-import.js';
import { calculateAivKernelCandidateSource } from '../converters/vibration/aiv/aiv-kernel-candidate.js';
import { AIV_SOURCE_CSV_HEADER } from '../converters/vibration/aiv/source-csv.js';

function value(row, column) {
  return row[AIV_SOURCE_CSV_HEADER.indexOf(column)];
}

function detail(line) {
  return JSON.parse(line.aiv_data)[0];
}

function setDetail(line, patch) {
  line.aiv_data = JSON.stringify([{ ...detail(line), ...patch }]);
}

function controlledWorkedExampleDocument() {
  return {
    options: {
      title: 'Energy Institute AVIFF - Worked Examples', version: 5, id: 8872, project: 3010,
    },
    lines: [
      {
        rid: '5', pnid: 'Figure D-1', lref: 'Recycle line (compressor discharge)',
        modules: 'fit,fip,mex,aiv', pi: 2, si: 4, aiv: '0.29', pwl: '129.36',
        aiv_data: JSON.stringify([{ vt: 'Recycle', mfr: '53482', usp: '88', dsp: '26', ust: '136.7', lnt: '30', lof: 0.29 }]),
      },
      {
        rid: '6', pnid: 'Figure D-1', lref: 'Recycle line (compressor suction)',
        modules: 'fit,fip,aiv', pi: 5, si: 5, aiv: '0.29', pwl: '129.02',
        aiv_data: JSON.stringify([{ vt: 'Recycle', mfr: '53482', usp: '88', dsp: '26', ust: '136.7', lnt: '30', lof: 0.29 }]),
      },
      {
        rid: '8', pnid: 'Figure D-1', lref: 'Relief line (downstream of PSV)',
        modules: 'fit,fip,aiv,tra', pi: 5, si: 7, aiv: '1.48', pwl: '164.69',
        aiv_data: JSON.stringify([{ vt: 'Relief', mfr: '53482', usp: '99', dsp: '1', ust: '137', lof: 1.4842587976269557 }]),
      },
    ],
    pipes: [
      { pi: 2, od: '219.075', wt: '18.263', mat: 'Carbon Steel' },
      { pi: 5, od: '168.275', wt: '7.112', mat: 'Carbon Steel' },
    ],
    streams: [
      { si: 4, desc: 'Stream 7', phase: 'gas', mfr: '53482', t: '136.7', p: '88', mw: '21.75' },
      { si: 5, desc: 'Recycle low pressure', phase: 'gas', mfr: '53482', t: '141.9', p: '26', mw: '23.22' },
      { si: 7, desc: 'Relief low pressure', phase: 'gas', mfr: '53482', t: '88', p: '1', mw: '21.75' },
    ],
    mats: [],
  };
}

function sourceById(imported, sourceId) {
  return imported.tables.sources.find((row) => value(row, 'Source Canonical ID') === sourceId);
}

function quantity(row, valueColumn, unitColumn) {
  return { value: Number(value(row, valueColumn)), unit: value(row, unitColumn) };
}

function sourceForCalculation(row) {
  const trimState = value(row, 'Low Noise Trim State');
  const lowNoiseTrim = trimState === 'MANUFACTURER_REDUCTION'
    ? {
      state: trimState,
      reduction: quantity(row, 'Low Noise Trim Reduction', 'Low Noise Trim Unit'),
      source: value(row, 'Low Noise Trim Source'),
      sourceRevision: value(row, 'Low Noise Trim Source Revision'),
    }
    : { state: trimState };
  return {
    sourceCanonicalId: value(row, 'Source Canonical ID'),
    caseId: value(row, 'Operating Case'),
    sourceDeviceType: value(row, 'Source Device Type'),
    sourceState: value(row, 'Source State'),
    phase: value(row, 'Phase'),
    massFlow: quantity(row, 'Mass Flow', 'Mass Flow Unit'),
    upstreamPressure: { ...quantity(row, 'Upstream Pressure', 'Upstream Pressure Unit'), basis: value(row, 'Upstream Pressure Basis') },
    downstreamPressure: { ...quantity(row, 'Downstream Pressure', 'Downstream Pressure Unit'), basis: value(row, 'Downstream Pressure Basis') },
    upstreamTemperature: quantity(row, 'Upstream Temperature', 'Upstream Temperature Unit'),
    molecularWeight: quantity(row, 'Molecular Weight', 'Molecular Weight Unit'),
    lowNoiseTrim,
    sonicState: value(row, 'Sonic State'),
    source: value(row, 'Source'),
    sourceRevision: value(row, 'Source Revision'),
    recordId: value(row, 'Record ID'),
  };
}

const EXPECTED_PWL = Object.freeze({
  'EIT-SOURCE-5-1': 129.3648155401,
  'EIT-SOURCE-6-1': 129.0239800907,
  'EIT-SOURCE-8-1': 164.6851759525,
});

test('exact EI worked-example legacy vectors resolve missing sonic state to controlled NON_SONIC', () => {
  const imported = parseAivEitImport(JSON.stringify(controlledWorkedExampleDocument()), {
    sourceName: 'Energy-Institute-AVIFF---Worked-Examples.eit',
  });
  for (const sourceId of Object.keys(EXPECTED_PWL)) {
    assert.equal(value(sourceById(imported, sourceId), 'Sonic State'), 'NON_SONIC');
  }
  for (const evidence of imported.evidence.detailEvidence) {
    assert.equal(evidence.sonicStateResolution?.state, 'NON_SONIC');
    assert.equal(evidence.sonicStateResolution?.sonicFlowFactorDb, 0);
    assert.equal(evidence.sonicStateResolution?.source?.blob, 'aaf3afe262b19f927fe05e0c44f07f08167fbfa0');
    assert.equal(evidence.sonicStateResolution?.authority?.genericSonicInference, false);
  }
});

test('controlled compatibility resolution reproduces frozen worked-example PWL values', () => {
  const imported = parseAivEitImport(JSON.stringify(controlledWorkedExampleDocument()));
  for (const [sourceId, expected] of Object.entries(EXPECTED_PWL)) {
    const result = calculateAivKernelCandidateSource(sourceForCalculation(sourceById(imported, sourceId)));
    assert.equal(result.sonicFlowFactorDb, 0);
    assert.ok(Math.abs(result.effectiveSourcePwlDb - expected) <= 1e-9, `${sourceId} PWL drift`);
  }
});

test('one-field drift from a controlled legacy vector fails closed to UNRESOLVED', () => {
  const document = controlledWorkedExampleDocument();
  setDetail(document.lines[0], { dsp: '25' });
  const imported = parseAivEitImport(JSON.stringify(document));
  assert.equal(value(sourceById(imported, 'EIT-SOURCE-5-1'), 'Sonic State'), 'UNRESOLVED');
  assert.equal(imported.evidence.detailEvidence[0].sonicStateResolution, null);
  assert.equal(value(sourceById(imported, 'EIT-SOURCE-6-1'), 'Sonic State'), 'NON_SONIC');
});

test('document identity drift disables all controlled compatibility resolution', () => {
  const document = controlledWorkedExampleDocument();
  document.options.project = 3011;
  const imported = parseAivEitImport(JSON.stringify(document));
  assert.deepEqual(imported.tables.sources.map((row) => value(row, 'Sonic State')), [
    'UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED',
  ]);
});

test('explicit modern sonic state has precedence over controlled compatibility resolution', () => {
  const document = controlledWorkedExampleDocument();
  setDetail(document.lines[0], { sonicState: 'SONIC' });
  const imported = parseAivEitImport(JSON.stringify(document));
  assert.equal(value(sourceById(imported, 'EIT-SOURCE-5-1'), 'Sonic State'), 'SONIC');
  assert.equal(imported.evidence.detailEvidence[0].sonicStateResolution, null);
});
