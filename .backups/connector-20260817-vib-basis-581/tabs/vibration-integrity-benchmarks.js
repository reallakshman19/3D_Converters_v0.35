import { createVibrationIntegrityInputTable } from './vibration-integrity-input-model.js';

export const VIBRATION_FIT_UI_BENCHMARK_SOURCE = Object.freeze({
  benchmarkSetId: 'FIT-EI-WORKED-EXAMPLES-V1',
  repository: 'reallaksh19/Common',
  commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
  path: 'EI - AVIFF Guidelines 2nd Edition_Examples.pdf',
  gitBlob: '3e2517d0df527a051084fc02e69cb7afa31f8d47',
  digitizedRepository: 'reallaksh19/Advanced_Analysis',
  digitizedCommit: '04328852dced9f5c4827da8afe8a82aeb8b1a1d3',
  digitizedPath: 'docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md',
  digitizedGitBlob: 'c050cd90802c27241c510c6f0ac43bfaf7a89e9d',
  digitizedAuthority: 'CORROBORATING_TRANSCRIPTION_ONLY',
  qualificationCommit: '7bfead910f6bca91b10748ead009e40f20c82219',
  qualificationPath: 'Energy-Institute-AVIFF---Worked-Examples.doc.docx',
  qualificationGitBlob: 'ceee15ed5f7f320045d5f3979024e2e8664613f2',
  qualificationPolicy: 'WORKED_EXAMPLE_BENCHMARK_SUFFICIENT',
  independentVibrationEngineerReviewRequired: false,
  edition: '2nd Edition, January 2008',
  technicalModule: 'T2.2 Flow Induced Turbulence',
  tolerancePolicyId: 'FIT-EI-PUBLISHED-RECONCILIATION-V1',
});

const CASES = Object.freeze([
  Object.freeze({
    id: 'EI-D2-FIT-RECYCLE-SUCTION-6IN',
    label: 'EI D2 · Recycle suction · 6 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5',
    input: Object.freeze({ phase: 'GAS', od: 0.1683, wt: 0.00711, id: 0.1541, span: 6.4, massFlow: 14.856111111111112, density: 18, viscosity: 0.00002 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.276, standardLofTolerance: 0.0012, referenceBand: 'LOF_LT_0_3', standardFvPa: 18022 }),
  }),
  Object.freeze({
    id: 'EI-D2-FIT-STREAM-4-SUPPLY-COOLER-14IN',
    label: 'EI D2 · Stream 4 · Supply to cooler · 14 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5; Stream 4',
    input: Object.freeze({ phase: 'GAS', od: 0.3556, wt: 0.00953, id: 0.33654, span: 9.9, massFlow: 16.488333333333333, density: 18, viscosity: 0.00002 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.014, standardLofTolerance: 0.0007, referenceBand: 'LOF_LT_0_3', standardFvPa: 19061 }),
  }),
  Object.freeze({
    id: 'EI-D2-FIT-STREAM-5-SUCTION-SCRUBBER-14IN',
    label: 'EI D2 · Stream 5 · Supply to suction scrubber · 14 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5; Stream 5',
    input: Object.freeze({ phase: 'GAS', od: 0.3556, wt: 0.00953, id: 0.33654, span: 9.9, massFlow: 16.488333333333333, density: 26, viscosity: 0.00001 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.007, standardLofTolerance: 0.0006, referenceBand: 'LOF_LT_0_3', standardFvPa: 19061 }),
  }),
  Object.freeze({
    id: 'EI-D2-FIT-STREAM-6-COMPRESSOR-SUCTION-14IN',
    label: 'EI D2 · Stream 6 · Compressor suction · 14 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5; Stream 6',
    input: Object.freeze({ phase: 'GAS', od: 0.3556, wt: 0.00953, id: 0.33654, span: 9.9, massFlow: 14.856111111111112, density: 23, viscosity: 0.00001 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.006, standardLofTolerance: 0.0009, referenceBand: 'LOF_LT_0_3', standardFvPa: 19061 }),
  }),
  Object.freeze({
    id: 'EI-D2-FIT-STREAM-7-COMPRESSOR-DISCHARGE-8IN',
    label: 'EI D2 · Stream 7 · Compressor discharge · 8 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5; Stream 7',
    input: Object.freeze({ phase: 'GAS', od: 0.2191, wt: 0.01826, id: 0.18258, span: 7.3, massFlow: 14.856111111111112, density: 62, viscosity: 0.00002 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.019, standardLofTolerance: 0.0006, referenceBand: 'LOF_LT_0_3', standardFvPa: 38483 }),
  }),
  Object.freeze({
    id: 'EI-D2-FIT-RECYCLE-DISCHARGE-8IN',
    label: 'EI D2 · Recycle discharge · 8 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5; Recycle line (compressor discharge)',
    input: Object.freeze({ phase: 'GAS', od: 0.2191, wt: 0.01826, id: 0.18258, span: 7.3, massFlow: 14.856111111111112, density: 62, viscosity: 0.00002 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.019, standardLofTolerance: 0.0006, referenceBand: 'LOF_LT_0_3', standardFvPa: 38483 }),
  }),
  Object.freeze({
    id: 'EI-D2-FIT-RELIEF-UPSTREAM-4IN',
    label: 'EI D2 · Relief upstream · 4 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5',
    input: Object.freeze({ phase: 'GAS', od: 0.1143, wt: 0.0111, id: 0.0921, span: 5.2, massFlow: 14.856111111111112, density: 62, viscosity: 0.00002 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.338, standardLofTolerance: 0.0018, referenceBand: 'LOF_0_3_TO_LT_0_5', standardFvPa: 33433 }),
  }),
  Object.freeze({
    id: 'EI-D2-FIT-RELIEF-DOWNSTREAM-6IN',
    label: 'EI D2 · Relief downstream · 6 in gas',
    sourceLocation: 'Appendix D, Example D2, D.2.1 Steps 1-5',
    input: Object.freeze({ phase: 'GAS', od: 0.1683, wt: 0.00711, id: 0.1541, span: 6.4, massFlow: 14.856111111111112, density: 4, viscosity: 0.00001 }),
    published: Object.freeze({ supportStiffness: 'MEDIUM_STIFF', standardLof: 0.881, standardLofTolerance: 0.0011, referenceBand: 'LOF_0_5_TO_LT_1', standardFvPa: 18022 }),
  }),
  Object.freeze({
    id: 'EI-D4-FIT-SEPARATOR-INLET-20IN',
    label: 'EI D4 · Separator inlet · 20 in multiphase',
    sourceLocation: 'Appendix D, Example D4, D.4.1 Steps 1-5',
    input: Object.freeze({ phase: 'MULTIPHASE', od: 0.508, wt: 0.009525, span: 5, density: 136, velocity: 9.3 }),
    published: Object.freeze({ supportStiffness: 'STIFF', standardLof: 0.26, standardLofTolerance: 0.0054, referenceBand: 'LOF_LT_0_3', standardFvPa: 45175 }),
  }),
  Object.freeze({
    id: 'EI-D4-FIT-PRODUCED-WATER-10IN',
    label: 'EI D4 · Produced water · 10 in liquid',
    sourceLocation: 'Appendix D, Example D4, D.4.1 Steps 1-5',
    input: Object.freeze({ phase: 'LIQUID', od: 0.273, wt: 0.009271, span: 18, density: 988, velocity: 2.9 }),
    published: Object.freeze({ supportStiffness: 'FLEXIBLE', supportCategory: 'FLEXIBLE_LARGE', standardLof: 3.15, standardLofTolerance: 0.007, referenceBand: 'LOF_GE_1', standardFvPa: 2636 }),
  }),
]);

export const VIBRATION_FIT_UI_BENCHMARK_CASES = Object.freeze(
  CASES.map(({ id, label, sourceLocation, published }) => Object.freeze({ id, label, sourceLocation, published })),
);

function benchmarkIdentity(caseData) {
  const short = caseData.id.replace(/^EI-/u, '');
  return Object.freeze({
    line: `BENCHMARK-${short}`,
    caseId: 'EI-REFERENCE',
    canonicalId: `BENCHMARK::${caseData.id}`,
  });
}

function topologyRows(caseData, identity) {
  return [[
    caseData.id,
    'PIPE',
    identity.line,
    '', '', '', '', '', '', '', '', '', '',
    'BENCHMARK_LOCAL',
    identity.canonicalId,
  ]];
}

function operatingRows(caseData, identity) {
  const input = caseData.input;
  return [[
    identity.line,
    identity.caseId,
    caseData.label,
    input.phase,
    input.massFlow ?? '',
    input.massFlow === undefined ? '' : 'kg/s',
    input.density,
    'kg/m3',
    '', '', '', '', '',
    input.viscosity ?? '',
    input.viscosity === undefined ? '' : 'Pa*s',
    input.velocity ?? '',
    input.velocity === undefined ? '' : 'm/s',
    'EI_AVIFF_2ED_APPENDIX_D',
    VIBRATION_FIT_UI_BENCHMARK_SOURCE.edition,
    caseData.id,
  ]];
}

function enrichmentRow(caseData, identity, property, value, valueType, unit = '') {
  return [
    identity.canonicalId,
    identity.line,
    '',
    property,
    value,
    valueType,
    unit,
    'EI_AVIFF_2ED_APPENDIX_D',
    VIBRATION_FIT_UI_BENCHMARK_SOURCE.edition,
    `${caseData.id}:${property}`,
    'BENCHMARK',
    '',
  ];
}

function enrichmentRows(caseData, identity) {
  const input = caseData.input;
  const rows = [
    enrichmentRow(caseData, identity, 'FIT_ASSESSMENT_POINT', true, 'BOOLEAN'),
    enrichmentRow(caseData, identity, 'OUTSIDE_DIAMETER', input.od, 'NUMBER', 'm'),
    enrichmentRow(caseData, identity, 'WALL_THICKNESS', input.wt, 'NUMBER', 'm'),
    enrichmentRow(caseData, identity, 'MAX_UNSUPPORTED_SPAN', input.span, 'NUMBER', 'm'),
  ];
  if (input.id !== undefined) {
    rows.push(enrichmentRow(caseData, identity, 'INSIDE_DIAMETER', input.id, 'NUMBER', 'm'));
  }
  return rows;
}

function buildTables(caseData, identity) {
  const source = { sourceName: `${caseData.id}.benchmark`, sourceKind: 'EI_BENCHMARK', dirty: false };
  return Object.freeze({
    topology: createVibrationIntegrityInputTable('topology', topologyRows(caseData, identity), source),
    operating: createVibrationIntegrityInputTable('operating', operatingRows(caseData, identity), source),
    enrichment: createVibrationIntegrityInputTable('enrichment', enrichmentRows(caseData, identity), source),
  });
}

export function buildVibrationFitUiBenchmarkCase(id) {
  const caseData = CASES.find((candidate) => candidate.id === id);
  if (!caseData) throw new RangeError(`Unknown FIT benchmark case ${id}.`);
  const identity = benchmarkIdentity(caseData);
  return Object.freeze({
    id: caseData.id,
    label: caseData.label,
    sourceLocation: caseData.sourceLocation,
    source: VIBRATION_FIT_UI_BENCHMARK_SOURCE,
    identity,
    published: caseData.published,
    modified: false,
    tables: buildTables(caseData, identity),
  });
}
