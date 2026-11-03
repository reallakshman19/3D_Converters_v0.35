/**
 * Real 1885_NC native-engineering support and three-way topology parity gate.
 * Non-restraint opening/penetration attachments remain traceable as deferred
 * records, while referenced stress supports project to their carrier edges.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildComponentTopologyArtifacts } from '../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import {
  SUPPORT_PROJECTION_TOLERANCE_MM,
  TOPOLOGY_TOLERANCE_MM,
} from '../tabs/model-converters/converters/component-topology/topology-values.js';

const fixturePath = fileURLToPath(new URL('../Benchmarks/1885_NC/1885_NC.json', import.meta.url));
const enrichedFixturePath = process.env.TOPOLOGY_1885_ENRICHED_SOURCE
  || 'C:/Users/reall/Downloads/1885_NC_enriched_stage.json';
const distance = (left, right) => Math.hypot(
  left.x - right.x, left.y - right.y, left.z - right.z,
);

if (!existsSync(fixturePath)) {
  console.log(`component topology 1885_NC SKIPPED: fixture not found at ${fixturePath}`);
} else {
  const sourceText = readFileSync(fixturePath, 'utf8');
  const built = await buildComponentTopologyArtifacts(sourceText, {
    sourceName: '1885_NC.json',
    jobName: '1885_NC',
    toleranceMm: TOPOLOGY_TOLERANCE_MM,
    supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
    enrichmentConfig: {},
  });

  assert.deepEqual(built.metrics.source, {
    branches: 278,
    childRecords: 4320,
    routeComponents: 2939,
    supports: 1381,
    componentCounts: {
      'ELBO/BEND': 351, PIPE: 880, OLET: 58, SUPPORT: 1381, FLANGE: 571,
      GASK: 599, VALVE: 203, INST: 77, REDUCER: 52, TEE: 148,
    },
  });
  assert.equal(built.metrics.canonical.zeroLengthEdges, 0);
  assert.equal(built.metrics.ledger.blockedRecords, 0);
  assert.equal(built.metrics.ledger.deferredSupports, 92);
  assert.equal(built.metrics.canonical.supports, 580);
  assert.equal(built.metrics.inputXml.restraints, 758);
  assert.equal(built.numberingShadowReport.status, 'PASS');
  assert.deepEqual(built.numberingShadowReport.differences, []);

  const parity = built.topologyParityReport;
  assert.equal(parity.ok, true);
  assert.equal(parity.status, 'PASS');
  for (const field of [
    'topologyMismatchCount', 'missingInInputXml', 'missingInSvg', 'extraInInputXml', 'extraInSvg',
    'incidenceMismatch', 'coordinateMismatch', 'supportMismatch', 'rigidMismatch', 'junctionMismatch',
  ]) assert.equal(parity.summary[field], 0, field);
  assert.equal(built.parsedInputXmlTopology.issues.length, 0);
  assert.equal(built.topologySvgScene.canonicalTopologyHash, built.canonicalTopology.canonicalTopologyHash);
  assert.equal(built.parsedInputXmlTopology.canonicalTopologyHash, built.canonicalTopology.canonicalTopologyHash);

  const penetration = built.traceLedger.records.find((row) => row.sourceRef === '=1006649732/53464');
  assert(penetration, 'floor-opening attachment must retain one ledger record');
  assert.equal(penetration.primaryDisposition, 'DEFER_SUPPORT');
  assert.equal(penetration.projectionCardinality, 'DEFERRED');
  assert.equal(penetration.lossClassification, 'DEFERRED_NON_RESTRAINT_ATTACHMENT');
  assert.equal(penetration.status, 'ACCEPTED');
  assert.equal(penetration.evidence.supportProjectionAuthority, 'NON_RESTRAINT_ATTACHMENT_DESCRIPTION');
  assert.deepEqual(penetration.canonicalNodeIds, []);
  assert.deepEqual(penetration.inputXmlElementIds, []);
  assert.deepEqual(penetration.inputXmlChildIds, []);
  assert.equal(built.canonicalTopology.supports.some((row) => row.sourceEntityIds.includes(penetration.sourceEntityId)), false);
  assert.equal(built.parsedInputXmlTopology.restraints.some((row) => row.sourceEntityIds.includes(penetration.sourceEntityId)), false);
  const deferredMarker = built.topologySvgScene.deferredSupports.find((row) => row.sourceEntityId === penetration.sourceEntityId);
  assert(deferredMarker, 'deferred opening attachment must remain visible in TopologySvgScene.v1');
  assert.equal(deferredMarker.topologyBearing, false);
  assert.equal(deferredMarker.deferred, true);
  assert(deferredMarker.position, 'deferred opening attachment must retain its source position');

  const referenced = built.canonicalTopology.supports.find((support) => support.sourcePaths.includes('$[241].children[79]'));
  assert(referenced, 'PS02705.1 must project through its explicit carrier reference');
  assert(referenced.connectionResidual > SUPPORT_PROJECTION_TOLERANCE_MM, 'explicit carrier authority must permit a datum offset beyond the proximity gate');
  assert(Math.abs(distance(referenced.sourcePosition, referenced.attachmentPosition) - referenced.connectionResidual) < 1e-9);
  assert.deepEqual(referenced.position, referenced.attachmentPosition);
  assert.notDeepEqual(referenced.sourcePosition, referenced.attachmentPosition);
  assert.match(referenced.attachmentAuthority, /ATTACHED_COMPONENT_REF\/COMPRE:=1006649732\/54494/);
  const sceneSupport = built.topologySvgScene.supports.find((row) => row.canonicalSupportId === referenced.id);
  assert(sceneSupport, 'PS02705.1 must appear in TopologySvgScene.v1');
  assert.equal(sceneSupport.canonicalNodeId, referenced.nodeId);
  assert.deepEqual(sceneSupport.attachmentPosition, referenced.attachmentPosition);
  assert.equal(sceneSupport.tag, referenced.tag);
  assert.equal(sceneSupport.restraintCount, referenced.restraints.length);
  assert.deepEqual(sceneSupport.sourceEntityIds, referenced.sourceEntityIds);
  assert.equal(sceneSupport.attachmentAuthority, referenced.attachmentAuthority);
  assert.equal(sceneSupport.connectionResidual, referenced.connectionResidual);
  const parsedRestraints = built.parsedInputXmlTopology.restraints.filter((row) => row.supportId === referenced.id);
  assert.equal(parsedRestraints.length, referenced.restraints.length);
  assert(parsedRestraints.every((row) => row.canonicalNodeId === referenced.nodeId));
  assert(parsedRestraints.every((row) => row.tag === referenced.tag));
  assert(parsedRestraints.every((row) => row.attachmentAuthority === referenced.attachmentAuthority));
  assert(parsedRestraints.every((row) => row.connectionResidual === Number(referenced.connectionResidual.toFixed(6))));

  if (existsSync(enrichedFixturePath)) {
    const enriched = await buildComponentTopologyArtifacts(readFileSync(enrichedFixturePath, 'utf8'), {
      sourceName: '1885_NC_enriched_stage.json', jobName: '1885_NC enriched envelope',
      toleranceMm: TOPOLOGY_TOLERANCE_MM,
      supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
      enrichmentConfig: {},
    });
    const deferredRefs = enriched.traceLedger.records
      .filter((row) => row.primaryDisposition === 'DEFER_SUPPORT')
      .map((row) => row.sourceRef);
    assert.deepEqual(deferredRefs, ['=1006649732/53464', '=1006649732/53497', '=1006649732/54870']);
    assert.equal(enriched.metrics.ledger.deferredSupports, 3);
    assert.equal(enriched.metrics.canonical.supports, 668);
    assert(enriched.traceLedger.records.filter((row) => deferredRefs.includes(row.sourceRef)).every((row) => (
      row.evidence.supportProjectionAuthority === 'NON_RESTRAINT_ATTACHMENT_DESCRIPTION'
    )));
    assert.equal(enriched.topologyParityReport.ok, true);
  }

  console.log(`component topology 1885_NC passed: ${parity.summary.canonicalEdges} edges, three-way mismatch count ${parity.summary.topologyMismatchCount}.`);
}
