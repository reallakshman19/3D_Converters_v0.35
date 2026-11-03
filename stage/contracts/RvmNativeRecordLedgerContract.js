export const RVM_NATIVE_RECORD_LEDGER_SCHEMA = 'RvmNativeRecordLedger.v1';
export const RVM_NATIVE_RECORD_LEDGER_VERSION = '20260702-rvm-native-record-ledger-v1';

export function createEmptyRvmNativeRecordLedger(options = {}) {
  return {
    schema: RVM_NATIVE_RECORD_LEDGER_SCHEMA,
    ledgerVersion: RVM_NATIVE_RECORD_LEDGER_VERSION,
    source: { fileName: options.fileName || '', fileHash: options.fileHash || '', byteLength: numberOrZero(options.byteLength), sourceKind: 'rvm-binary' },
    parser: { readerSchema: options.readerSchema || '', readerVersion: options.readerVersion || '', parserComplete: false, visualParityClaimed: false },
    hierarchy: { rootNodeId: options.rootNodeId || 'rvm-node-root', nodeCount: 0, maxDepth: 0, balanced: false },
    nodes: [],
    primitiveRecords: [],
    diagnostics: [],
    warnings: [],
    errors: [],
  };
}

export function validateRvmNativeRecordLedger(ledger) {
  const errors = [];
  if (!ledger || typeof ledger !== 'object') return invalid('ledger must be an object');
  validateLedgerShape(ledger, errors);
  const nodeIds = new Set();
  for (const node of ledger.nodes || []) validateLedgerNode(node, nodeIds, errors);
  for (const primitive of ledger.primitiveRecords || []) validatePrimitiveRecord(primitive, nodeIds, errors);
  if (ledger.hierarchy?.nodeCount !== (ledger.nodes || []).length) errors.push('hierarchy.nodeCount must match nodes.length');
  return { valid: errors.length === 0, errors };
}

export function summarizeRvmNativeRecordLedger(ledger) {
  return {
    schema: ledger?.schema || RVM_NATIVE_RECORD_LEDGER_SCHEMA,
    ledgerVersion: ledger?.ledgerVersion || RVM_NATIVE_RECORD_LEDGER_VERSION,
    sourceKind: ledger?.source?.sourceKind || '',
    byteLength: numberOrZero(ledger?.source?.byteLength),
    parserComplete: ledger?.parser?.parserComplete === true,
    visualParityClaimed: ledger?.parser?.visualParityClaimed === true,
    balanced: ledger?.hierarchy?.balanced === true,
    maxDepth: numberOrZero(ledger?.hierarchy?.maxDepth),
    nodeCount: Array.isArray(ledger?.nodes) ? ledger.nodes.length : 0,
    primitiveRecordCount: Array.isArray(ledger?.primitiveRecords) ? ledger.primitiveRecords.length : 0,
    primitiveCodes: countBy(ledger?.primitiveRecords || [], 'nativeCode'),
    warningCount: Array.isArray(ledger?.warnings) ? ledger.warnings.length : 0,
    errorCount: Array.isArray(ledger?.errors) ? ledger.errors.length : 0,
  };
}

function validateLedgerShape(ledger, errors) {
  if (ledger.schema !== RVM_NATIVE_RECORD_LEDGER_SCHEMA) errors.push(`schema must be ${RVM_NATIVE_RECORD_LEDGER_SCHEMA}`);
  if (ledger.source?.sourceKind !== 'rvm-binary') errors.push('source.sourceKind must be rvm-binary');
  if (ledger.parser?.parserComplete !== false) errors.push('parser.parserComplete must remain false');
  if (ledger.parser?.visualParityClaimed !== false) errors.push('parser.visualParityClaimed must remain false');
  for (const key of ['nodes', 'primitiveRecords', 'diagnostics', 'warnings', 'errors']) if (!Array.isArray(ledger[key])) errors.push(`${key} must be an array`);
  if (!ledger.hierarchy || typeof ledger.hierarchy !== 'object') errors.push('hierarchy object is required');
}

function validateLedgerNode(node, nodeIds, errors) {
  if (!node || typeof node !== 'object') return errors.push('node must be an object');
  requireString(node.id, 'node.id', errors);
  if (node.id && nodeIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
  if (node.id) nodeIds.add(node.id);
  for (const key of ['name', 'path']) requireString(node[key], `node.${key}`, errors);
  for (const key of ['depth', 'recordOffset', 'recordEndOffset']) requireFinite(node[key], `node.${key}`, errors);
  for (const key of ['childNodeIds', 'primitiveRecordIds']) if (!Array.isArray(node[key])) errors.push(`node.${key} must be an array`);
}

function validatePrimitiveRecord(primitive, nodeIds, errors) {
  if (!primitive || typeof primitive !== 'object') return errors.push('primitiveRecord must be an object');
  requireString(primitive.id, 'primitiveRecord.id', errors);
  requireString(primitive.nodeId, 'primitiveRecord.nodeId', errors);
  if (primitive.nodeId && !nodeIds.has(primitive.nodeId)) errors.push(`primitiveRecord nodeId is unknown: ${primitive.nodeId}`);
  for (const key of ['parentPath', 'nativeKind', 'decodeStatus', 'semanticSource']) requireString(primitive[key], `primitiveRecord.${key}`, errors);
  for (const key of ['recordOffset', 'recordEndOffset', 'nativeCode', 'byteLength']) requireFinite(primitive[key], `primitiveRecord.${key}`, errors);
  if (primitive.decodeStatus !== 'record-read') errors.push('primitiveRecord.decodeStatus must be record-read');
  if (primitive.geometryDecoded !== false) errors.push('primitiveRecord.geometryDecoded must remain false');
  if (primitive.semanticSource !== 'rvm-only') errors.push('primitiveRecord.semanticSource must be rvm-only');
  if (!Array.isArray(primitive.diagnostics)) errors.push('primitiveRecord.diagnostics must be an array');
}

function requireString(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} must be a non-empty string`);
}

function requireFinite(value, label, errors) {
  if (!Number.isFinite(value)) errors.push(`${label} must be finite`);
}

function countBy(items, key) {
  return items.reduce((out, item) => {
    const text = String(item?.[key] ?? '');
    if (text) out[text] = (out[text] || 0) + 1;
    return out;
  }, {});
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function invalid(message) { return { valid: false, errors: [message] }; }
