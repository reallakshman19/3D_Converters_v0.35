import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, '..');
const SOURCE_ROOT = join(REPO_ROOT, 'tabs', 'stagedjson-to-enrichxml');
const DEFAULT_FIXTURE = join(
  REPO_ROOT,
  'tests',
  'fixtures',
  'topo-enriched-xml',
  'current-allocation',
  'characterization-input.json',
);

const RUNTIME_FILES = Object.freeze([
  'sj-audit.js',
  'sj-branch-identity.js',
  'sj-corrosion-resolver.js',
  'sj-enrichment-authority.js',
  'sj-enrichment-engine.js',
  'sj-node-contract.js',
  'sj-parser.js',
  'sj-point-resolver.js',
  'sj-psi-sequence-planner.js',
  'sj-rating-resolver.js',
  'sj-restraint-resolver.js',
  'sj-sequential-writer-shadow.js',
  'sj-type-mapper.js',
  'sj-wall-resolver.js',
  'sj-weight-db.js',
  'sj-weight-resolver.js',
  'sj-xml-writer-parity.js',
  'sj-xml-writer.js',
]);

export async function captureCurrentPsiOccurrences(options = {}) {
  const evaluatedAt = options.evaluatedAt || '2026-07-19T00:00:00.000Z';
  const stagedJson = clone(options.stagedJson || JSON.parse(readFileSync(DEFAULT_FIXTURE, 'utf8')));
  const tempRoot = mkdtempSync(join(tmpdir(), 'te001-current-psi-'));

  try {
    writeFileSync(join(tempRoot, 'package.json'), '{"type":"module"}\n');
    for (const file of RUNTIME_FILES) copyFileSync(join(SOURCE_ROOT, file), join(tempRoot, file));

    const [{ runEnrichment }, parser, writer, nodeContract, typeMapper, pointResolver] = await Promise.all([
      import(pathToFileURL(join(tempRoot, 'sj-enrichment-engine.js')).href),
      import(pathToFileURL(join(tempRoot, 'sj-parser.js')).href),
      import(pathToFileURL(join(tempRoot, 'sj-xml-writer.js')).href),
      import(pathToFileURL(join(tempRoot, 'sj-node-contract.js')).href),
      import(pathToFileURL(join(tempRoot, 'sj-type-mapper.js')).href),
      import(pathToFileURL(join(tempRoot, 'sj-point-resolver.js')).href),
    ]);

    const directRecords = parser.parseStagedJson(clone(stagedJson), {});
    const beforeMutation = new Map(directRecords.map((record) => [recordKey(record), record.xmlNodeNum ?? null]));
    const directXml = writer.buildEnrichedXml(parser.groupByBranch(directRecords), {});
    const directNodes = parseXmlNodes(directXml);

    const canonical = runEnrichment({ stagedJsonText: clone(stagedJson), config: {} });
    const sequential = runEnrichment({
      stagedJsonText: clone(stagedJson),
      config: { psiWriterMode: 'sequential' },
    });

    const occurrences = directRecords.map((record) => describeRecord({
      record,
      directNodes,
      beforeMutation,
      nodeContract,
      typeMapper,
      pointResolver,
    }));

    const normalizedDirectXml = normalizeWriterMetadata(directXml);
    const normalizedCanonicalXml = normalizeWriterMetadata(canonical.canonicalXmlText);
    const normalizedSequentialXml = normalizeWriterMetadata(sequential.writerShadow.xmlText);

    const snapshot = {
      schema: 'PsiLegacyNodeAllocationSnapshot.v1',
      evaluatedAt,
      fixture: 'characterization-input.json',
      branches: {
        canonical: parseBranchNames(canonical.canonicalXmlText),
        sequential: parseBranchNames(sequential.writerShadow.xmlText),
      },
      occurrences,
      mutations: occurrences
        .filter((entry) => entry.mutation.changed)
        .map((entry) => ({
          recordId: entry.recordId,
          componentRefNo: entry.componentRefNo,
          before: entry.mutation.before,
          after: entry.mutation.after,
        })),
      canonicalSequentialDifferences: compareWriterAllocations(
        canonical.canonicalXmlText,
        sequential.writerShadow.xmlText,
      ),
      writerSelection: {
        canonicalEffectiveMode: canonical.writerSelection.effectiveMode,
        sequentialRequestedMode: sequential.writerSelection.requestedMode,
        sequentialEffectiveMode: sequential.writerSelection.effectiveMode,
        sequentialSelectionAllowed: sequential.writerShadow.parity.selectionGate.allowed,
        numberingEquivalent: sequential.writerShadow.parity.summary.numberingEquivalent,
      },
      nondeterminism: [{
        field: 'PipeStressExport.DateTime',
        source: 'sj-xml-writer.js internal new Date()',
        normalization: '<DateTime>[WRITER_CLOCK]</DateTime>',
        semanticDisposition: 'excluded from deterministic characterization hashes',
      }],
      normalizedXmlHashes: {
        direct: sha256(normalizedDirectXml),
        canonical: sha256(normalizedCanonicalXml),
        sequential: sha256(normalizedSequentialXml),
      },
      validation: {
        status: 'PASS',
        blockers: [],
        warnings: [
          'Writer-owned allocation is intentionally characterized, not corrected.',
          'Canonical and sequential allocations intentionally differ in this legacy baseline.',
          'Writer DateTime is normalized because production code reads the wall clock internally.',
        ],
      },
    };

    return deepFreeze(snapshot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function describeRecord({ record, directNodes, beforeMutation, nodeContract, typeMapper, pointResolver }) {
  const nodes = directNodes.filter((node) => node.componentRefNo === record.ref);
  const numberingSpan = currentNumberingSpan(record, nodeContract, typeMapper);
  return {
    recordId: recordKey(record),
    componentRefNo: record.ref,
    sourceName: record.name,
    rawType: record.rawType,
    componentType: record.componentType,
    sourceBranch: record.sourceBranchName,
    canonicalBranch: record.branchName,
    sourceOrder: record.path.join('/'),
    emittedOccurrenceCount: nodes.length,
    reservedSlotCount: Math.max(0, numberingSpan - nodes.length),
    numberingSpan,
    primaryNodeNumber: record.xmlNodeNum ?? null,
    emittedNodeNumbers: nodes.map((node) => node.nodeNumber),
    endpoints: nodes.map((node) => node.endpoint),
    emittedComponentTypes: nodes.map((node) => node.componentType),
    coordinateRoles: nodes.map((node) => coordinateRole(record.attrs, node.position, pointResolver)),
    mutation: {
      before: beforeMutation.get(recordKey(record)) ?? null,
      after: record.xmlNodeNum ?? null,
      changed: (beforeMutation.get(recordKey(record)) ?? null) !== (record.xmlNodeNum ?? null),
    },
  };
}

function currentNumberingSpan(record, nodeContract, typeMapper) {
  if (typeMapper.isSupportType(record.componentType)) return 1;
  if (nodeContract.isXmlBoundaryComponent(record.componentType)) {
    return nodeContract.projectBoundaryNodeContract(record, 10).numberingSpan;
  }
  return 1;
}

function coordinateRole(attrs, emittedPosition, pointResolver) {
  if (!emittedPosition) return 'NONE';
  const arrive = pointResolver.formatPosition(pointResolver.arrivePosition(attrs));
  const leave = pointResolver.formatPosition(pointResolver.leavePosition(attrs));
  const best = pointResolver.formatPosition(pointResolver.bestPosition(attrs));
  if (emittedPosition === arrive && emittedPosition === leave) return 'ARRIVE_AND_LEAVE';
  if (emittedPosition === arrive) return 'ARRIVE';
  if (emittedPosition === leave) return 'LEAVE';
  if (emittedPosition === best) return 'BEST';
  return 'OTHER';
}

function parseBranchNames(xmlText) {
  return [...String(xmlText).matchAll(/<Branchname>([\s\S]*?)<\/Branchname>/g)]
    .map((match) => decodeXml(match[1].trim()));
}

function parseXmlNodes(xmlText) {
  const nodes = [];
  for (const block of String(xmlText).match(/<Node>[\s\S]*?<\/Node>/g) || []) {
    nodes.push({
      nodeNumber: numberTag(block, 'NodeNumber'),
      endpoint: numberTag(block, 'Endpoint'),
      componentType: tagValue(block, 'ComponentType'),
      componentRefNo: tagValue(block, 'ComponentRefNo'),
      position: tagValue(block, 'Position'),
    });
  }
  return nodes;
}

function compareWriterAllocations(canonicalXml, sequentialXml) {
  const canonical = occurrenceMap(parseXmlNodes(canonicalXml));
  const sequential = occurrenceMap(parseXmlNodes(sequentialXml));
  const keys = [...new Set([...canonical.keys(), ...sequential.keys()])].sort();
  return keys.flatMap((semanticOccurrence) => {
    const left = canonical.get(semanticOccurrence);
    const right = sequential.get(semanticOccurrence);
    if (left?.nodeNumber === right?.nodeNumber) return [];
    return [{
      semanticOccurrence,
      canonicalNodeNumber: left?.nodeNumber ?? null,
      sequentialNodeNumber: right?.nodeNumber ?? null,
    }];
  });
}

function occurrenceMap(nodes) {
  const counts = new Map();
  const result = new Map();
  for (const node of nodes) {
    const signature = [node.componentRefNo, node.componentType, node.endpoint].join('|');
    const count = (counts.get(signature) || 0) + 1;
    counts.set(signature, count);
    result.set(`${signature}#${count}`, node);
  }
  return result;
}

function normalizeWriterMetadata(xmlText) {
  return String(xmlText).replace(/<DateTime>[\s\S]*?<\/DateTime>/, '<DateTime>[WRITER_CLOCK]</DateTime>');
}

function numberTag(block, tagName) {
  const value = Number(tagValue(block, tagName));
  return Number.isFinite(value) ? value : null;
}

function tagValue(block, tagName) {
  const match = String(block).match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return decodeXml(match?.[1]?.trim() || '');
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function recordKey(record) {
  return `${record.path.join('/')}|${record.ref || record.name}|${record.componentType}`;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = await captureCurrentPsiOccurrences();
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}
