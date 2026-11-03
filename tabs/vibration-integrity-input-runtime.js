import { parseVibrationTableExchangeXlsx } from '../converters/vibration/exchange/parse.js';
import { VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT } from '../converters/vibration/facility/fit-tables.js';
import { buildVibrationFitUiBenchmarkCase, VIBRATION_FIT_UI_BENCHMARK_CASES } from './vibration-integrity-benchmarks.js';
import {
  assertVibrationTopologyProjectionIntegrity,
  buildVibrationSourceFileFingerprint,
  buildVibrationTopologyProjectionFingerprint,
} from './vibration-integrity-input-integrity.js';
import {
  createEmptyVibrationIntegrityInputTable,
  createTopologyInputTableFromExchange,
  parseVibrationIntegrityInputCsv,
  serializeVibrationIntegrityInputTable,
} from './vibration-integrity-input-model.js';

function topologyFormat(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.xlsx')) return VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.XLSX;
  if (lower.endsWith('.csv')) return VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.CSV_ELEMENTS_ONLY;
  throw new Error('3D EDIT table export must be .xlsx or .csv.');
}

function cloneBinary(data) {
  if (data instanceof ArrayBuffer) return data.slice(0);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  }
  return data;
}

function cloneFile(file) {
  if (!file) return null;
  return Object.freeze({ ...file, ...(file.data === undefined ? {} : { data: cloneBinary(file.data) }) });
}

export function createVibrationIntegrityInputRuntimeState() {
  return {
    files: { topology: null, operating: null, enrichment: null, dataBlockers: null },
    tables: {
      topology: createEmptyVibrationIntegrityInputTable('topology'),
      operating: createEmptyVibrationIntegrityInputTable('operating'),
      enrichment: createEmptyVibrationIntegrityInputTable('enrichment'),
      dataBlockers: createEmptyVibrationIntegrityInputTable('dataBlockers'),
    },
    benchmark: {
      selectedId: VIBRATION_FIT_UI_BENCHMARK_CASES[0]?.id ?? '',
      loaded: null,
      detachedFromSource: false,
    },
    allowLimitedExchange: false,
  };
}

export function captureVibrationIntegrityExecutionState(state) {
  return Object.freeze({
    files: Object.freeze({
      topology: cloneFile(state.files?.topology),
      operating: cloneFile(state.files?.operating),
      enrichment: cloneFile(state.files?.enrichment),
      dataBlockers: cloneFile(state.files?.dataBlockers),
    }),
    tables: Object.freeze({ ...state.tables }),
    benchmark: Object.freeze({
      selectedId: state.benchmark?.selectedId ?? '',
      loaded: state.benchmark?.loaded ?? null,
      detachedFromSource: state.benchmark?.detachedFromSource === true,
    }),
    allowLimitedExchange: state.allowLimitedExchange === true,
  });
}

function serializeOptionalTable(table) {
  return table?.rows?.length ? serializeVibrationIntegrityInputTable(table) : '';
}

function editedTopologyFileName(file, table) {
  if (file?.format === VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.XLSX) {
    const base = String(file.name || 'vibration-topology').replace(/\.xlsx$/iu, '');
    return `${base}.edited-elements.csv`;
  }
  if (file?.name) return file.name;
  if (table.sourceName) return table.sourceName;
  return 'vibration-elements-working.csv';
}

async function preservedXlsxInput(file, table) {
  await assertVibrationTopologyProjectionIntegrity(file, table);
  return { format: file.format, data: file.data, sourceFileName: file.name };
}

export async function vibrationIntegrityTopologyExecutionInput(state) {
  const file = state.files.topology;
  const table = state.tables.topology;
  if (!table.rows.length) return null;
  const canUsePreservedXlsx = file?.format === VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.XLSX
    && table.originalCertifiedExchange === true
    && !table.authorityDowngraded;
  if (canUsePreservedXlsx) return preservedXlsxInput(file, table);
  return {
    format: VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.CSV_ELEMENTS_ONLY,
    data: serializeVibrationIntegrityInputTable(table),
    sourceFileName: editedTopologyFileName(file, table),
  };
}

export async function buildVibrationIntegrityFacilityTableInput(state) {
  return {
    topology: await vibrationIntegrityTopologyExecutionInput(state),
    operatingCaseCsv: serializeOptionalTable(state.tables.operating),
    enrichmentCsv: serializeOptionalTable(state.tables.enrichment),
    dataBlockerCsv: serializeOptionalTable(state.tables.dataBlockers),
  };
}

async function readTopologyFile(file) {
  const format = topologyFormat(file.name);
  if (format === VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.XLSX) {
    const data = await file.arrayBuffer();
    const exchange = parseVibrationTableExchangeXlsx(data, { sourceFileName: file.name });
    const table = createTopologyInputTableFromExchange(exchange, { sourceName: file.name });
    const [projection, sourceFile] = await Promise.all([
      buildVibrationTopologyProjectionFingerprint(table),
      buildVibrationSourceFileFingerprint(data),
    ]);
    return {
      file: {
        name: file.name,
        format,
        data,
        kind: 'Complete five-sheet XLSX · editable Elements view',
        projectionSchema: projection.schema,
        projectionHash: projection.projectionHash,
        fileHashSchema: sourceFile.schema,
        fileHash: sourceFile.fileHash,
      },
      table,
    };
  }
  const text = await file.text();
  return {
    file: { name: file.name, format, kind: 'Elements-only CSV · limited provenance' },
    table: parseVibrationIntegrityInputCsv('topology', text, { sourceName: file.name, sourceKind: format }),
  };
}

async function readCsvFile(file, kind) {
  const text = await file.text();
  const contracts = {
    operating: 'VibrationOperatingCaseCsv.v1',
    enrichment: 'VibrationEnrichmentCsv.v1',
    dataBlockers: 'VibrationFitDataBlockerCsv.v1',
  };
  return {
    file: { name: file.name, kind: contracts[kind] ?? 'CSV' },
    table: parseVibrationIntegrityInputCsv(kind, text, { sourceName: file.name, sourceKind: 'CSV' }),
  };
}

export function readVibrationIntegrityInputFile(target, file) {
  return target === 'topology' ? readTopologyFile(file) : readCsvFile(file, target);
}

export function buildLoadedVibrationIntegrityBenchmark(id) {
  const loaded = buildVibrationFitUiBenchmarkCase(id);
  return {
    loaded,
    tables: { ...loaded.tables, dataBlockers: createEmptyVibrationIntegrityInputTable('dataBlockers') },
    files: {
      topology: {
        name: `${loaded.id}.csv`,
        format: VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.CSV_ELEMENTS_ONLY,
        kind: 'EI benchmark Elements working table',
      },
      operating: { name: `${loaded.id}-operating.csv`, kind: 'EI benchmark operating table' },
      enrichment: { name: `${loaded.id}-enrichment.csv`, kind: 'EI benchmark enrichment table' },
      dataBlockers: null,
    },
    allowLimitedExchange: true,
  };
}
