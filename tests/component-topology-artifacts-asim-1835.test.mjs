/**
 * Real ASIM-1835 native CAESAR InputXML benchmark.
 * Input: the supplied managed-stage JSON. Output: exact topology, support,
 * restraint, rigid-body, attribute, globally unique node, and parity assertions.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildComponentTopologyArtifacts } from '../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import { runTopologyChecks } from '../tabs/model-converters/converters/component-topology/topology-geometry-diagnostics.js';

const fixturePath = process.env.ASIM_1835_SOURCE
  || 'C:/Users/reall/Downloads/ATTRIBUTE-AML_ASIM-1835_managed_stage_enriched_stage.json';

function attributeRows(xml) {
  return [...xml.matchAll(/<PIPINGELEMENT\b([^>]*)>/g)].map((match) => (
    Object.fromEntries([...match[1].matchAll(/([A-Z0-9_]+)="([^"]*)"/g)].map((row) => [row[1], row[2]]))
  ));
}

if (!existsSync(fixturePath)) {
  console.log(`component topology ASIM-1835 SKIPPED: fixture not found at ${fixturePath}`);
} else {
  const parsed = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const sourceText = JSON.stringify(parsed.objects ?? parsed);
  const artifacts = await buildComponentTopologyArtifacts(sourceText, {
    sourceName: 'ASIM-1835.json',
    jobName: 'ASIM-1835',
    toleranceMm: 0.1,
    supportProjectionToleranceMm: 50,
    enrichmentConfig: {},
  });
  assert.equal(artifacts.numberingShadowReport.status, 'PASS');
  assert.deepEqual(artifacts.numberingShadowReport.differences, []);
  assert.deepEqual(artifacts.metrics.engineering, { supports: 663, restraints: 828, rigids: 1652 });
  assert.deepEqual(artifacts.metrics.inputXml, { elements: 4434, restraints: 828, rigids: 1606, rigidBodies: 1652 });
  assert.equal(artifacts.metrics.canonical.nodes, 4406);
  assert.equal(artifacts.metrics.canonical.zeroLengthEdges, 0);
  assert.equal(artifacts.metrics.ledger.deferredSupports, 0);
  assert.equal(artifacts.buildIssues.filter((issue) => issue.blocking !== false).length, 0);
  assert.equal(artifacts.topologyParityReport.ok, true);
  for (const field of [
    'topologyMismatchCount', 'missingInInputXml', 'missingInSvg', 'extraInInputXml', 'extraInSvg',
    'incidenceMismatch', 'coordinateMismatch', 'supportMismatch', 'rigidMismatch', 'junctionMismatch',
  ]) assert.equal(artifacts.topologyParityReport.summary[field], 0, field);
  assert.equal(artifacts.parsedInputXmlTopology.issues.length, 0);
  const checkStarted = performance.now();
  const checker = runTopologyChecks(artifacts.canonicalTopology, {
    shortElementMm: 6, toleranceMm: 0.1, snapToleranceMm: 25,
    angleToleranceDeg: 5, originToleranceMm: 0.1, clearanceMm: 0,
  });
  const checkElapsedMs = performance.now() - checkStarted;
  assert.equal(checker.summary.countsByCode.EXPECTED_SHORT_INLINE_COMPONENT, 675);
  assert.equal(checker.summary.countsByCode.SHORT_ELEMENT, 7);
  assert.equal(checker.summary.countsByCode.SNAP_GAP ?? 0, 0);
  assert.equal(checker.summary.countsByCode.BEND_AT_JUNCTION ?? 0, 0);
  assert.equal(checker.summary.countsByCode.PIPE_BACKTRACK, 2);
  assert.equal(checker.summary.countsByCode.OVERLAPPING_ELEMENTS, 5);
  assert(checkElapsedMs < 1000, `Topology checker exceeded 1 second: ${checkElapsedMs.toFixed(1)} ms.`);
  const rows = attributeRows(artifacts.topologyInputXml);
  assert.equal(rows.length, 4434);
  for (const field of ['DIAMETER', 'WALL_THICK', 'INSUL_THICK', 'CORR_ALLOW', 'TEMP_EXP_C1', 'PRESSURE1', 'MATERIAL_NAME', 'LINE_ID']) {
    assert(rows.every((row) => Object.hasOwn(row, field)), `${field} must be present on every PIPINGELEMENT.`);
  }
  for (const field of ['CANONICAL_EDGE_ID', 'FROM_CANONICAL_NODE_ID', 'TO_CANONICAL_NODE_ID', 'SOURCE_ENTITY_IDS', 'SOURCE_PORT_IDS', 'BRANCH_IDS', 'TOPOLOGY_OPERATION', 'PROJECTION_CARDINALITY']) {
    assert(rows.every((row) => Object.hasOwn(row, field) && row[field]), `${field} must be present on every topology PIPINGELEMENT.`);
  }
  const materialByLine = new Map(), wallByLine = new Map();
  for (const row of rows) {
    const diameter = Number(row.DIAMETER), wall = Number(row.WALL_THICK);
    assert(diameter > 0, `Invalid native diameter on ${row.ID}.`);
    if (wall > 0) {
      assert(wall * 2 < diameter, `Invalid physical wall on ${row.ID}: ${wall}/${diameter}.`);
      wallByLine.set(row.LINE_ID, wall);
    } else assert(wallByLine.has(row.LINE_ID), `Unseeded wall context on ${row.ID} (${row.LINE_ID}).`);
    assert(Number(row.INSUL_THICK) >= 0 && Number(row.CORR_ALLOW) >= 0, `Invalid allowance on ${row.ID}.`);
    assert(Number(row.TEMP_EXP_C1) !== -1.0101 && Number(row.PRESSURE1) !== -1.0101, `Missing process context on ${row.ID}.`);
    assert(row.MATERIAL_NAME && row.LINE_ID, `Missing material name or line context on ${row.ID}.`);
    if (Number(row.MATERIAL_NUM) > 0) materialByLine.set(row.LINE_ID, row.MATERIAL_NUM);
    else assert(materialByLine.has(row.LINE_ID), `Unseeded material context on ${row.ID} (${row.LINE_ID}).`);
  }
  assert.equal([...artifacts.topologyInputXml.matchAll(/<RESTRAINT\b/g)].length, 828);
  assert.equal([...artifacts.topologyInputXml.matchAll(/<RIGID\b/g)].length, 1606);
  const inputNodeIds = artifacts.canonicalTopology.nodes.flatMap((node) => node.inputXmlNodeIds);
  assert.equal(new Set(inputNodeIds).size, inputNodeIds.length, 'InputXML node IDs must be globally unique.');
  const supportNodeByTag = new Map(artifacts.canonicalTopology.supports.map((support) => [support.tag, support.nodeId]));
  for (const [left, right] of [['PS-11179.4', 'PS-11179.5'], ['PS-11138', 'PS-11138.3'], ['PS-11302', 'PS-11302/SREF']]) {
    assert.equal(supportNodeByTag.get(left), supportNodeByTag.get(right), `${left}/${right} must share their projected carrier node.`);
  }
  assert(artifacts.traceLedger.records.filter((row) => row.sourceType === 'SUPPORT').every((row) => (
    row.primaryDisposition === 'EMIT_SUPPORT_ATTACHMENT'
    && row.inputXmlElementIds.length > 0
    && row.inputXmlChildIds.some((id) => id.startsWith('RESTRAINT:'))
  )));
  console.log(`component topology ASIM-1835 passed (${checkElapsedMs.toFixed(1)} ms checker)\n${JSON.stringify(artifacts.metrics, null, 2)}`);
}
