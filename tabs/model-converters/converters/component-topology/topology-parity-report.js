/** Builds and serializes TopologyParityReport.v1. */
import { cleanText } from './topology-values.js';
import { deterministicHash, stampArtifactHash, TOPOLOGY_HASH_ALGORITHM } from './topology-deterministic-hash.js';
import { compareCanonicalToInputXml, compareCanonicalToSvgScene, compareInputXmlToSvgScene } from './topology-parity-comparisons.js';
import { canonicalRigidGroups, deferredRecords, GLOBAL_DECIMALS, DELTA_DECIMALS, mismatch } from './topology-parity-values.js';

export function buildTopologyParityReport(input) {
  const canonical = input.canonicalTopology ?? input.canonical;
  const parsed = input.parsedInputXmlTopology ?? input.parsedInputXml ?? input.inputXml;
  const scene = input.topologySvgScene ?? input.svgScene;
  const ledger = input.traceLedger ?? input.ledger ?? { records: [] };
  if (canonical?.schema !== 'CanonicalTopology.v1') throw new TypeError('Topology parity requires CanonicalTopology.v1.');
  if (parsed?.schema !== 'ParsedInputXmlTopology.v1') throw new TypeError('Topology parity requires ParsedInputXmlTopology.v1.');
  if (scene?.schema !== 'TopologySvgScene.v1') throw new TypeError('Topology parity requires TopologySvgScene.v1.');
  const raw = [
    ...compareCanonicalToInputXml(canonical, parsed, ledger),
    ...compareCanonicalToSvgScene(canonical, scene, ledger),
    ...compareInputXmlToSvgScene(parsed, scene),
  ];
  if (cleanText(canonical.canonicalTopologyHash) !== cleanText(parsed.canonicalTopologyHash)) raw.unshift(mismatch({
    category: 'STALE_HASH_INPUTXML', canonicalIdentity: canonical.canonicalTopologyHash, inputXmlIdentity: parsed.canonicalTopologyHash,
    expected: canonical.canonicalTopologyHash, actual: parsed.canonicalTopologyHash, recommendedOwnerModule: 'topology-inputxml-writer.js',
    message: 'InputXML canonical topology hash is missing or stale.' }));
  if (cleanText(canonical.canonicalTopologyHash) !== cleanText(scene.canonicalTopologyHash)) raw.unshift(mismatch({
    category: 'STALE_HASH_SVG', canonicalIdentity: canonical.canonicalTopologyHash, svgIdentity: scene.canonicalTopologyHash,
    expected: canonical.canonicalTopologyHash, actual: scene.canonicalTopologyHash, recommendedOwnerModule: 'topology-svg-scene-builder.js',
    message: 'SVG scene canonical topology hash is missing or stale.' }));
  for (const parserIssue of parsed.issues ?? []) raw.push(mismatch({
    category: `INPUTXML_PARSE_${parserIssue.category}`, inputXmlIdentity: parserIssue.inputXmlElementId ?? parserIssue.inputXmlChildId ?? null,
    expected: 'complete explicit topology identity', actual: parserIssue,
    recommendedOwnerModule: 'topology-inputxml-topology-parser.js', message: parserIssue.message }));
  const mismatches = Object.freeze(raw.map((row, index) => Object.freeze({ id: `TPM-${String(index + 1).padStart(6, '0')}`, ...row })));
  const count = (predicate) => mismatches.filter(predicate).length;
  const summary = Object.freeze({
    canonicalNodes: canonical.nodes?.length ?? 0, canonicalEdges: canonical.edges?.length ?? 0,
    inputXmlNodes: parsed.nodes?.length ?? 0, inputXmlElements: parsed.elements?.length ?? 0,
    svgNodes: scene.nodes?.length ?? 0, svgEdges: scene.edges?.length ?? 0,
    supports: canonical.supports?.length ?? 0, rigids: canonicalRigidGroups(canonical).size,
    junctions: canonical.junctions?.length ?? 0, deferredRecords: deferredRecords(ledger).length,
    topologyMismatchCount: mismatches.length,
    missingInInputXml: count((row) => row.category.includes('MISSING_IN_INPUTXML')),
    missingInSvg: count((row) => row.category.includes('MISSING_IN_SVG')),
    extraInInputXml: count((row) => row.category.includes('EXTRA_IN_INPUTXML')),
    extraInSvg: count((row) => row.category.includes('EXTRA_IN_SVG')),
    incidenceMismatch: count((row) => row.category.includes('INCIDENCE_MISMATCH')),
    coordinateMismatch: count((row) => row.category.includes('COORDINATE_MISMATCH')),
    supportMismatch: count((row) => row.category.includes('SUPPORT')),
    rigidMismatch: count((row) => row.category.includes('RIGID')),
    junctionMismatch: count((row) => row.category.includes('JUNCTION')),
    mismatches: mismatches.length,
  });
  const report = Object.freeze({
    schema: 'TopologyParityReport.v1', hashAlgorithm: TOPOLOGY_HASH_ALGORITHM,
    canonicalTopologyHash: canonical.canonicalTopologyHash || deterministicHash(canonical),
    inputXmlHash: parsed.inputXmlHash, parsedInputXmlTopologyHash: parsed.parsedInputXmlTopologyHash,
    svgSceneHash: scene.svgSceneHash, topologyTraceLedgerHash: ledger.topologyTraceLedgerHash || deterministicHash(ledger),
    normalization: Object.freeze({ coordinateUnit: 'mm', inputXmlGlobalCoordinateDecimals: GLOBAL_DECIMALS,
      inputXmlDeltaDecimals: DELTA_DECIMALS, svgWorldCoordinates: 'CanonicalTopology.v1 unprojected world coordinates',
      toleranceMm: 0, toleranceJustification: 'Exact equality after deterministic writer-precision normalization.' }),
    ok: mismatches.length === 0, status: mismatches.length === 0 ? 'PASS' : 'FAIL', summary,
    nodeComparison: Object.freeze({ canonical: summary.canonicalNodes, inputXml: summary.inputXmlNodes, svg: summary.svgNodes }),
    edgeComparison: Object.freeze({ canonical: summary.canonicalEdges, inputXml: summary.inputXmlElements, svg: summary.svgEdges }),
    supportComparison: Object.freeze({ canonical: summary.supports, mismatchCount: summary.supportMismatch }),
    rigidComparison: Object.freeze({ canonical: summary.rigids, mismatchCount: summary.rigidMismatch }),
    junctionComparison: Object.freeze({ canonical: summary.junctions, mismatchCount: summary.junctionMismatch }), mismatches,
  });
  return stampArtifactHash(report, 'topologyParityReportHash');
}

export function topologyParityMismatchesCsv(report) {
  const headers = ['Mismatch ID', 'Severity', 'Category', 'Canonical ID', 'InputXML ID', 'SVG ID', 'Expected', 'Actual', 'Source entities', 'Source paths', 'Recommended owner'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = (report.mismatches ?? []).map((row) => [row.id, row.severity, row.category,
    typeof row.canonicalIdentity === 'string' ? row.canonicalIdentity : JSON.stringify(row.canonicalIdentity),
    typeof row.inputXmlIdentity === 'string' ? row.inputXmlIdentity : JSON.stringify(row.inputXmlIdentity),
    typeof row.svgIdentity === 'string' ? row.svgIdentity : JSON.stringify(row.svgIdentity),
    JSON.stringify(row.expected), JSON.stringify(row.actual), (row.sourceEntities ?? []).join('|'),
    (row.sourcePaths ?? []).join('|'), row.recommendedOwnerModule]);
  return `${[headers, ...rows].map((row) => row.map(quote).join(',')).join('\n')}\n`;
}

export class TopologyParityError extends Error {
  constructor(report) {
    super(`Topology parity failed with ${report.summary?.topologyMismatchCount ?? report.mismatches?.length ?? 'unknown'} mismatch(es).`);
    this.name = 'TopologyParityError';
    this.report = report;
  }
}
