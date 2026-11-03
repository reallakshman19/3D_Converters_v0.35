import test from 'node:test';
import assert from 'node:assert/strict';
import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { calculateAiv } from '../converters/vibration/aiv/aiv-calculator.js';
import { buildAivEitExport, serializeAivEitExport } from '../converters/vibration/aiv/aiv-eit-export.js';
import { parseAivEitImport } from '../converters/vibration/aiv/aiv-eit-import.js';
import {
  aivEitLengthMm,
  aivEitMolecularWeightGPerMol,
  aivEitPressureBarAbsolute,
} from '../converters/vibration/aiv/aiv-eit-units.js';
import { generateAivInputTablesFromFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network-table-generator.js';
import { parseAivAssessmentCsv } from '../converters/vibration/aiv/assessment-csv.js';
import { parseAivSourceCsv } from '../converters/vibration/aiv/source-csv.js';
import { parseAivSourceAssessmentCsv } from '../converters/vibration/aiv/source-assessment-csv.js';
import { serializeVibrationCsvRows } from '../converters/vibration/tabular/csv.js';
import { createAivSmallFlareMockNetwork } from '../tabs/vibration-aiv-mock-flare-network.js';

const authority = Object.freeze({ screeningAuthority: 'AUTHORIZED', designAuthority: false });

function fixture() {
  const sources = [
    {
      sourceCanonicalId: 'RV-101', caseId: 'RELIEF-COMBINED', sourceDeviceType: 'RELIEF_VALVE', phase: 'GAS',
      massFlow: { value: 7.307743040001822, unit: 'kg/s' },
      upstreamPressure: { value: 5, unit: 'MPa', basis: 'ABSOLUTE' },
      downstreamPressure: { value: 1, unit: 'MPa', basis: 'ABSOLUTE' },
      upstreamTemperature: { value: 300, unit: 'K' }, molecularWeight: { value: 20, unit: 'g/mol' },
      lowNoiseTrim: { state: 'NONE' },
    },
    {
      sourceCanonicalId: 'RV-102', caseId: 'RELIEF-COMBINED', sourceDeviceType: 'RELIEF_VALVE', phase: 'GAS',
      massFlow: { value: 3.6625475182774654, unit: 'kg/s' },
      upstreamPressure: { value: 5, unit: 'MPa', basis: 'ABSOLUTE' },
      downstreamPressure: { value: 1, unit: 'MPa', basis: 'ABSOLUTE' },
      upstreamTemperature: { value: 300, unit: 'K' }, molecularWeight: { value: 20, unit: 'g/mol' },
      lowNoiseTrim: { state: 'NONE' },
    },
  ];
  const assessments = [{
    assessmentCanonicalId: 'AIV-ASSESS-HDR-001', assessmentType: 'WELDED_TEE',
    mainOutsideDiameter: { value: 219.1, unit: 'mm' }, mainInsideDiameter: { value: 202.74, unit: 'mm' },
    mainWallThickness: { value: 8.18, unit: 'mm' }, branchOutsideDiameter: { value: 114.3, unit: 'mm' },
    branchWallThickness: { value: 6.02, unit: 'mm' }, material: 'Carbon Steel',
  }];
  const relationships = [
    { sourceCanonicalId: 'RV-101', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED', physicalDistance: { value: 38, unit: 'm' }, distanceSource: 'AIV_FLARE_NETWORK_PATH_SUM', distanceSourceRevision: '1', simultaneousSourceGroup: 'FLARE-GROUP-1' },
    { sourceCanonicalId: 'RV-102', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED', physicalDistance: { value: 41, unit: 'm' }, distanceSource: 'AIV_FLARE_NETWORK_PATH_SUM', distanceSourceRevision: '1', simultaneousSourceGroup: 'FLARE-GROUP-1' },
  ];
  const result = {
    schema: 'AivCalculatorResult.v1', qualificationMode: 'screening', screeningResultScope: 'ASSESSMENT',
    lineCaseSummaryAuthoritativeForScreening: false, authority,
    sourceResults: [
      { sourceCanonicalId: 'RV-101', caseId: 'RELIEF-COMBINED', effectiveSourcePwlDb: 160 },
      { sourceCanonicalId: 'RV-102', caseId: 'RELIEF-COMBINED', effectiveSourcePwlDb: 154 },
    ],
    assessmentResults: [{
      assessmentCanonicalId: 'AIV-ASSESS-HDR-001', line: '8IN-FLARE-HEADER', caseId: 'RELIEF-COMBINED',
      contributingSourceCanonicalIds: ['RV-101', 'RV-102'], combinedPointPwlDb: 149.56302572849327,
      sourceContributionsAtPoint: [
        { sourceCanonicalId: 'RV-101', pointPwlDb: 148.75406925125776 },
        { sourceCanonicalId: 'RV-102', pointPwlDb: 141.86623261319917 },
      ], lof: 0.29,
    }],
    lineCaseSummaries: [{ caseId: 'RELIEF-COMBINED', assessmentCanonicalIds: ['AIV-ASSESS-HDR-001'], lof: 1.48, authoritativeForScreening: false }],
  };
  return {
    schema: 'AivScreeningExportPackage.v1', result,
    inputs: { sources, assessments, relationships, topology: null },
    flareNetworkEvidence: { pathEvidence: [
      { sourceCanonicalId: 'RV-101', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED', physicalDistanceM: 38, distanceAuthority: 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH_SUM', segmentIds: ['RV101-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN'] },
      { sourceCanonicalId: 'RV-102', assessmentCanonicalId: 'AIV-ASSESS-HDR-001', caseId: 'RELIEF-COMBINED', physicalDistanceM: 41, distanceAuthority: 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH_SUM', segmentIds: ['RV102-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN'] },
    ] },
  };
}

function mockScreeningPackage() {
  const generated = generateAivInputTablesFromFlareNetwork(createAivSmallFlareMockNetwork());
  const csv = (table) => serializeVibrationCsvRows([table.header, ...table.rows]);
  const sources = parseAivSourceCsv(csv(generated.tables.sources));
  const assessments = parseAivAssessmentCsv(csv(generated.tables.assessments));
  const relationships = parseAivSourceAssessmentCsv(csv(generated.tables.relationships));
  const result = calculateAiv({
    sources, assessments, relationships,
    exchange: { elements: [{ canonicalId: 'AIV-ASSESS-HDR-001', line: '8IN-FLARE-HEADER' }] },
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
    qualificationMode: 'screening',
  });
  return {
    schema: 'AivScreeningExportPackage.v1',
    result,
    inputs: { sources, assessments, relationships, topology: null },
    flareNetworkEvidence: { pathEvidence: generated.pathEvidence },
  };
}

test('exports v5 .eit with assessment LOF authoritative and line trace non-authoritative', () => {
  const built = buildAivEitExport({ screeningPackage: fixture(), title: 'Small Flare' });
  assert.equal(built.schema, 'EnergyInstituteEit.v5');
  assert.equal(built.document.options.version, 5);
  assert.equal(built.document.lines.length, 1);
  const line = built.document.lines[0];
  assert.equal(line.aiv, '0.29');
  assert.equal(line.maxLof, '0.29');
  assert.equal(line.aivConfiguredLineCaseTraceLof, 1.48);
  assert.equal(line.aivConfiguredLineCaseTraceAuthoritative, false);
  assert.equal(line.pwl, '160');
  assert.equal(line.aiv_data.includes('1.48'), false);
});

test('aiv_data stays legacy stringified array while retaining modern trace', () => {
  const line = buildAivEitExport({ screeningPackage: fixture() }).document.lines[0];
  assert.equal(typeof line.aiv_data, 'string');
  const data = JSON.parse(line.aiv_data);
  assert.equal(data.length, 2);
  assert.deepEqual(data[0].segmentIds, ['RV101-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN']);
  assert.equal(data[0].distance, 38);
  assert.equal(data[1].distance, 41);
  assert.equal(data[0].combinedPointPwl, 149.56302572849327);
  assert.equal(data[0].sourcePwl, 160);
  assert.equal(data[1].sourcePwl, 154);
});

test('legacy units are kg/h, bar absolute and deg C', () => {
  const built = buildAivEitExport({ screeningPackage: fixture() });
  const first = JSON.parse(built.document.lines[0].aiv_data)[0];
  assert.ok(Math.abs(Number(first.mfr) - 26307.87494400656) < 1e-9);
  assert.equal(first.usp, '50');
  assert.equal(first.dsp, '10');
  assert.ok(Math.abs(Number(first.ust) - 26.85) < 1e-12);
  assert.equal(built.document.streams[0].p, '50');
});

test('pipes and streams retain modern canonical IDs additively', () => {
  const built = buildAivEitExport({ screeningPackage: fixture() });
  assert.equal(built.document.pipes[0].assessmentCanonicalId, 'AIV-ASSESS-HDR-001');
  assert.equal(built.document.streams[0].sourceCanonicalId, 'RV-101');
  assert.equal(built.document.streams[1].sourceCanonicalId, 'RV-102');
});

test('serialization emits JSON file payload without wrapper schema', () => {
  const text = serializeAivEitExport({ screeningPackage: fixture() });
  const parsed = JSON.parse(text);
  assert.equal(parsed.options.version, 5);
  assert.equal(parsed.lines[0].aiv, '0.29');
  assert.equal(Object.hasOwn(parsed, 'schema'), false);
});

test('controlled mock flare serializes through the production EIT writer with path identity intact', () => {
  const document = JSON.parse(serializeAivEitExport({
    screeningPackage: mockScreeningPackage(),
    title: 'Small Flare 2RV Mock',
  }));
  assert.equal(document.options.version, 5);
  assert.equal(document.lines.length, 1);
  assert.equal(document.lines[0].aiv, '0.29');
  assert.equal(document.lines[0].maxLof, '0.29');
  const data = JSON.parse(document.lines[0].aiv_data);
  assert.deepEqual(data.map((item) => item.sourceCanonicalId), ['RV-101', 'RV-102']);
  assert.deepEqual(data.map((item) => item.distance), [38, 41]);
  assert.deepEqual(data[0].segmentIds, ['RV101-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN']);
  assert.deepEqual(data[1].segmentIds, ['RV102-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN']);
  assert.equal(document.streams[0].sourceCanonicalId, 'RV-101');
  assert.equal(document.streams[1].sourceCanonicalId, 'RV-102');
  assert.equal(document.pipes[0].assessmentCanonicalId, 'AIV-ASSESS-HDR-001');
});

test('controlled mock flare round-trips through production EIT export and import without identity or distance drift', () => {
  const text = serializeAivEitExport({
    screeningPackage: mockScreeningPackage(),
    title: 'Small Flare 2RV Mock',
  });
  const imported = parseAivEitImport(text, { sourceName: 'aiv-small-flare-2rv-mock.eit' });
  assert.deepEqual(imported.counts, {
    documentLines: 1,
    documentPipes: 1,
    documentStreams: 2,
    aivLines: 1,
    sources: 2,
    assessments: 1,
    relationships: 2,
    derivedInsideDiameters: 0,
  });
  assert.equal(imported.importedResults[0].importedResultAuthority, 'REVIEW_REQUIRED');
  assert.equal(imported.importedResults[0].currentScreeningAuthority, false);
  assert.equal(imported.importedResults[0].importedResultKind, 'PRIOR_ASSESSMENT_SCREENING_TRACE');
  const evidence = imported.evidence.detailEvidence;
  assert.deepEqual(evidence.map((item) => item.sourceCanonicalId), ['RV-101', 'RV-102']);
  assert.deepEqual(evidence.map((item) => item.assessmentCanonicalId), ['AIV-ASSESS-HDR-001', 'AIV-ASSESS-HDR-001']);
  assert.deepEqual(evidence.map((item) => item.caseId), ['RELIEF-COMBINED', 'RELIEF-COMBINED']);
  assert.deepEqual(evidence.map((item) => item.originalDetail.distance), [38, 41]);
  assert.deepEqual(evidence[0].segmentIds, ['RV101-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN']);
  assert.deepEqual(evidence[1].segmentIds, ['RV102-BRANCH', 'SUBHEADER-4IN', 'HEADER-8IN']);
  assert.equal(imported.topology.authority.svgPixelsAuthoritativeForDistance, false);
});

test('fails closed if line/case summary is incorrectly authoritative', () => {
  const value = fixture();
  value.result.lineCaseSummaryAuthoritativeForScreening = true;
  assert.throws(() => buildAivEitExport({ screeningPackage: value }), /AIV_EIT_AUTHORITY_SCOPE_INVALID/);
});

test('compatibility geometry and molecular weight normalize to mm and g/mol', () => {
  assert.ok(Math.abs(aivEitLengthMm({ value: 0.2191, unit: 'm' }) - 219.1) < 1e-12);
  assert.equal(aivEitMolecularWeightGPerMol({ value: 20, unit: 'g/mol' }), 20);
  assert.equal(aivEitMolecularWeightGPerMol({ value: 20, unit: 'kg/kmol' }), 20);
  assert.equal(aivEitMolecularWeightGPerMol({ value: 0.02, unit: 'kg/mol' }), 20);
});

test('gauge pressure fails closed without explicit reference-pressure evidence', () => {
  const source = fixture().inputs.sources[0];
  source.upstreamPressure = { value: 4, unit: 'MPa', basis: 'GAUGE' };
  assert.throws(() => aivEitPressureBarAbsolute(source, 'upstreamPressure'), /reference-pressure evidence/);
  source.referencePressure = { value: 1, unit: 'bar' };
  source.referencePressureSource = 'Project ambient basis';
  source.referencePressureSourceRevision = '1';
  assert.equal(aivEitPressureBarAbsolute(source, 'upstreamPressure'), 41);
});