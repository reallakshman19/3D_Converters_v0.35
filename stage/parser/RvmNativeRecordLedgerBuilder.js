import {
  createEmptyRvmNativeRecordLedger,
  validateRvmNativeRecordLedger,
} from '../contracts/RvmNativeRecordLedgerContract.js';
import { RVM_WIDE_RECORD_READER_SCHEMA, nativeKindForCode } from './RvmWideRecordReader.js';

export const RVM_NATIVE_RECORD_LEDGER_BUILDER_VERSION = '20260702-rvm-native-record-ledger-builder-v1';

export function buildRvmNativeRecordLedger(readerReport = {}, options = {}) {
  const ledger = createEmptyRvmNativeRecordLedger({
    ...readerReport.source,
    readerSchema: readerReport.schema || RVM_WIDE_RECORD_READER_SCHEMA,
    readerVersion: readerReport.readerVersion || '',
  });
  addRootNode(ledger, options);
  copyContainerNodes(ledger, readerReport.containerNodes || []);
  copyPrimitiveRecords(ledger, readerReport.primSlices || []);
  finalizeLedger(ledger, readerReport);
  return ledger;
}

export function validateBuiltRvmNativeRecordLedger(ledger) {
  return validateRvmNativeRecordLedger(ledger);
}

function addRootNode(ledger, options) {
  ledger.nodes.push({
    id: ledger.hierarchy.rootNodeId,
    parentId: null,
    name: options.rootName || 'RVM_BINARY_ROOT',
    path: '/',
    depth: 0,
    recordOffset: 0,
    recordEndOffset: numberOrZero(ledger.source.byteLength),
    childNodeIds: [],
    primitiveRecordIds: [],
  });
}

function copyContainerNodes(ledger, nodes) {
  const byId = new Map(ledger.nodes.map((node) => [node.id, node]));
  for (const source of nodes) {
    const node = toLedgerNode(source, ledger.hierarchy.rootNodeId);
    ledger.nodes.push(node);
    byId.set(node.id, node);
    const parent = byId.get(node.parentId) || byId.get(ledger.hierarchy.rootNodeId);
    if (parent && !parent.childNodeIds.includes(node.id)) parent.childNodeIds.push(node.id);
  }
}

function copyPrimitiveRecords(ledger, slices) {
  const byId = new Map(ledger.nodes.map((node) => [node.id, node]));
  for (const slice of slices) {
    const nodeId = slice.parentNodeId || ledger.hierarchy.rootNodeId;
    const primitive = toPrimitiveRecord(slice, nodeId);
    ledger.primitiveRecords.push(primitive);
    const node = byId.get(nodeId) || byId.get(ledger.hierarchy.rootNodeId);
    if (node && !node.primitiveRecordIds.includes(primitive.id)) node.primitiveRecordIds.push(primitive.id);
  }
}

function toLedgerNode(source, rootNodeId) {
  return {
    id: source.id,
    parentId: source.parentId || rootNodeId,
    name: source.name || source.id,
    path: source.path || '/',
    depth: numberOrZero(source.depth),
    recordOffset: numberOrZero(source.recordOffset),
    recordEndOffset: numberOrZero(source.recordEndOffset),
    childNodeIds: [...(source.childNodeIds || [])],
    primitiveRecordIds: [...(source.primitiveRecordIds || [])],
  };
}

function toPrimitiveRecord(slice, nodeId) {
  return {
    id: slice.id,
    nodeId,
    parentPath: slice.parentPath || '/',
    recordOffset: numberOrZero(slice.offset),
    recordEndOffset: numberOrZero(slice.endOffset),
    nativeCode: numberOrZero(slice.nativeCode),
    nativeKind: slice.nativeKind || nativeKindForCode(slice.nativeCode),
    byteLength: numberOrZero(slice.byteLength || (slice.endOffset - slice.offset)),
    decodeStatus: 'record-read',
    geometryDecoded: false,
    semanticSource: 'rvm-only',
    diagnostics: [...(slice.diagnostics || [])],
  };
}

function finalizeLedger(ledger, readerReport) {
  ledger.parser.parserComplete = false;
  ledger.parser.visualParityClaimed = false;
  ledger.hierarchy.nodeCount = ledger.nodes.length;
  ledger.hierarchy.maxDepth = numberOrZero(readerReport.hierarchy?.maxDepth);
  ledger.hierarchy.balanced = readerReport.hierarchy?.balanced === true;
  ledger.diagnostics.push(...(readerReport.diagnostics || []));
  ledger.warnings.push(...(readerReport.warnings || []));
  ledger.errors.push(...(readerReport.errors || []));
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
