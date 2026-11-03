import { createAivInputTable } from './vibration-aiv-input-model.js';

export const AIV_UI_BENCHMARK_SOURCE = Object.freeze({
  benchmarkSetId: 'AIV.EI.D2.3.WORKED_EXAMPLE.v1',
  methodId: 'VIB.AIV.ACOUSTIC',
  readableSource: Object.freeze({
    repository: 'reallaksh19/3D_Converters',
    commit: '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    path: 'docs/Energy-Institute-AVIFF---Worked-Examples.md',
    gitBlob: '9f22d92eba8bdf3b67adc25a4c77a7f7d7211da8',
  }),
  workedExampleSource: Object.freeze({
    repository: 'reallaksh19/Common',
    commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
    path: 'Energy-Institute-AVIFF---Worked-Examples.doc.docx',
    gitBlob: 'ceee15ed5f7f320045d5f3979024e2e8664613f2',
    locator: 'D.2.3 High Frequency Acoustic Excitation',
  }),
  authority: Object.freeze({
    benchmarkInputReference: true,
    numericalExecutionAuthorized: false,
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  }),
});

const SOURCE_ROWS = Object.freeze([
  Object.freeze([
    'AIV-D23-RELIEF-SOURCE', 'D2.3-RELIEF', 'RELIEF_VALVE', 'RELIEVING', 'GAS',
    '53482', 'kg/h',
    '98', 'bar', 'GAUGE',
    '0', 'bar', 'GAUGE',
    '1', 'bar', 'EI D.2.3 displayed gauge-to-absolute pressure conversion', 'fb549185b9b27edc2379734240320a85c5bef9f6',
    '137', 'degC', '21.75', 'g/mol',
    'NONE', '', '', '', '',
    'NON_SONIC', 'EI D.2.3 controlled worked example', '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    'D2.3-RELIEF-SOURCE', 'CONTROLLED_BENCHMARK', 'QUALIFICATION_REFERENCE',
  ]),
  Object.freeze([
    'AIV-D23-RECYCLE-SOURCE', 'D2.3-RECYCLE', 'CONTROL_VALVE', 'OPEN', 'GAS',
    '53482', 'kg/h',
    '87', 'bar', 'GAUGE',
    '25', 'bar', 'GAUGE',
    '1', 'bar', 'EI D.2.3 displayed gauge-to-absolute pressure conversion', 'fb549185b9b27edc2379734240320a85c5bef9f6',
    '136.7', 'degC', '21.75', 'g/mol',
    'MANUFACTURER_REDUCTION', '30', 'dB', 'EI D.2.3 reported manufacturer low-noise trim reduction', '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    'NON_SONIC', 'EI D.2.3 controlled worked example', '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    'D2.3-RECYCLE-SOURCE', 'CONTROLLED_BENCHMARK', 'QUALIFICATION_REFERENCE',
  ]),
]);

const ASSESSMENT_ROWS = Object.freeze([
  Object.freeze([
    'AIV-D23-WELDOLET-01', 'WELDOLET',
    '168.3', 'mm', '154', 'mm', '7.11', 'mm',
    '60.3', 'mm', '', '',
    'Carbon Steel', 'NO',
    'EI D.2.3 first discontinuity', '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    'D2.3-WELDOLET-01', 'CONTROLLED_BENCHMARK', 'QUALIFICATION_REFERENCE',
  ]),
]);

const RELATIONSHIP_ROWS = Object.freeze([
  Object.freeze([
    'AIV-D23-RELIEF-SOURCE', 'AIV-D23-WELDOLET-01', 'D2.3-RELIEF',
    '0.8', 'm', 'EI D.2.3 source-to-first-discontinuity distance', '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    '', 'APPLICABLE',
    'EI D.2.3 source-to-assessment relationship', '8f243592d73ccf4790d9e308a311003ce7d8f5bb',
    'D2.3-RELIEF-WELDOLET-01', 'CONTROLLED_BENCHMARK', 'QUALIFICATION_REFERENCE',
  ]),
]);

export const AIV_D23_BENCHMARK_TOPOLOGY = Object.freeze({
  schema: 'VibrationTableExchange.v1',
  sourceSchema: 'AivControlledBenchmarkTopology.v1',
  sourceFormat: 'PARSED_EXCHANGE',
  completeExchange: true,
  integrityStatus: 'DECLARED_NOT_REVERIFIED',
  sourceFileName: 'EI D.2.3 controlled benchmark topology',
  authority: Object.freeze({
    canonicalHash: 'AIV-D23-BENCHMARK-CANONICAL-v1',
    projectionHash: 'AIV-D23-BENCHMARK-PROJECTION-v1',
    sourceHash: AIV_UI_BENCHMARK_SOURCE.readableSource.gitBlob,
    datasetId: AIV_UI_BENCHMARK_SOURCE.benchmarkSetId,
    datasetVersion: '1',
    sourceExportHash: AIV_UI_BENCHMARK_SOURCE.workedExampleSource.gitBlob,
  }),
  elements: Object.freeze([
    Object.freeze({ canonicalId: 'AIV-D23-RELIEF-SOURCE', tag: 'Relief', type: 'VALV', line: 'D2.3 Relief line', sourceStatus: 'CONTROLLED_BENCHMARK' }),
    Object.freeze({ canonicalId: 'AIV-D23-RELIEF-PIPE', tag: 'Relief downstream pipe', type: 'PIPE', line: 'D2.3 Relief line', sourceStatus: 'CONTROLLED_BENCHMARK' }),
    Object.freeze({ canonicalId: 'AIV-D23-WELDOLET-01', tag: '2-inch bypass weldolet', type: 'OLET', line: 'D2.3 Relief line', sourceStatus: 'CONTROLLED_BENCHMARK' }),
    Object.freeze({ canonicalId: 'AIV-D23-RECYCLE-SOURCE', tag: 'Recycle', type: 'VALV', line: 'D2.3 Recycle line', sourceStatus: 'CONTROLLED_BENCHMARK' }),
  ]),
  connections: Object.freeze([
    Object.freeze({ canonicalId: 'AIV-D23-RELIEF-SOURCE', nodeId: 'AIV-D23-N1' }),
    Object.freeze({ canonicalId: 'AIV-D23-RELIEF-PIPE', nodeId: 'AIV-D23-N1' }),
    Object.freeze({ canonicalId: 'AIV-D23-RELIEF-PIPE', nodeId: 'AIV-D23-N2' }),
    Object.freeze({ canonicalId: 'AIV-D23-WELDOLET-01', nodeId: 'AIV-D23-N2' }),
  ]),
});

export const AIV_D23_UI_BENCHMARK = Object.freeze({
  id: 'EI-D2.3-AIV',
  label: 'EI D.2.3 — High Frequency Acoustic Excitation',
  sourceLocation: 'D.2.3 High Frequency Acoustic Excitation',
  publishedReference: Object.freeze({
    reliefRawSourcePwlDb: 164.7,
    recycleRawSourcePwlDb: 159.4,
    recycleTrimReductionDb: 30,
    reliefPointPwlDb: 164.4,
    reliefFirstDiscontinuityLof: 0.29,
    publishedFlm1: 1.2133,
    flm1ReconciliationState: 'OPEN',
  }),
});

export function buildLoadedAivD23Benchmark() {
  const metadata = { benchmarkId: AIV_D23_UI_BENCHMARK.id, sourceName: AIV_D23_UI_BENCHMARK.label, sourceKind: 'CONTROLLED_BENCHMARK', dirty: false };
  return Object.freeze({
    benchmark: Object.freeze({ ...AIV_D23_UI_BENCHMARK, modified: false }),
    topology: AIV_D23_BENCHMARK_TOPOLOGY,
    tables: Object.freeze({
      sources: createAivInputTable('sources', SOURCE_ROWS, metadata),
      assessments: createAivInputTable('assessments', ASSESSMENT_ROWS, metadata),
      relationships: createAivInputTable('relationships', RELATIONSHIP_ROWS, metadata),
    }),
    files: Object.freeze({
      topology: Object.freeze({ name: 'EI D.2.3 benchmark topology', kind: 'AivControlledBenchmarkTopology.v1' }),
      sources: Object.freeze({ name: 'EI D.2.3 Sources', kind: 'AivSourceCsv.v2' }),
      assessments: Object.freeze({ name: 'EI D.2.3 Assessments', kind: 'AivAssessmentCsv.v1' }),
      relationships: Object.freeze({ name: 'EI D.2.3 Source→Assessment', kind: 'AivSourceAssessmentCsv.v1' }),
    }),
  });
}
