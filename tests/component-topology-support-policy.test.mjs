/**
 * Focused support projection policy regression.
 * Non-restraint opening/penetration attachments remain traceable but do not
 * fabricate CAESAR restraints. Explicit stress supports retain the 50 mm gate
 * unless a producer-owned component reference identifies the carrier edge.
 */

import assert from 'node:assert/strict';
import { buildComponentTopologyArtifacts } from '../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import { classifySupportProjection } from '../tabs/model-converters/converters/component-topology/topology-support-policy.js';
import {
  SUPPORT_PROJECTION_TOLERANCE_MM,
  TOPOLOGY_TOLERANCE_MM,
} from '../tabs/model-converters/converters/component-topology/topology-values.js';

const point = (x, y, z) => ({ x, y, z });

function sourceFixture(supportAttributes) {
  return JSON.stringify([{
    name: '/TEST-100/B1',
    type: 'BRANCH',
    attributes: {
      NAME: '/TEST-100/B1', OWNER: '/TEST-100', HBOR: '100mm', TBOR: '100mm',
      HPOS: point(0, 0, 0), TPOS: point(1000, 0, 0),
    },
    children: [
      {
        name: 'PIPE =PIPE/1', type: 'PIPE',
        attributes: {
          TYPE: 'PIPE', NAME: '=PIPE/1', REF: '=PIPE/1', OWNER: '/TEST-100/B1',
          APOS: point(0, 0, 0), LPOS: point(1000, 0, 0),
          ABORE: '100mm', LBORE: '100mm', DTXR: 'PIPE',
        },
      },
      {
        name: 'SUPPORT =TEST/1', type: 'SUPPORT',
        enrichedAttributes: {
          schema: 'stagedjson-cii2019-enriched-attributes/v1',
          componentType: 'SUPPORT', status: 'resolved', needsReview: false,
        },
        attributes: {
          TYPE: 'ATTA', OWNER: '/TEST-100/B1', NAME: '=TEST/1', REF: '=TEST/1',
          SUPPORT_TAG: '=TEST/1', POS: point(5000, 0, 0), APOS: point(5000, 0, 0), LPOS: point(5000, 0, 0),
          ...supportAttributes,
        },
      },
    ],
  }]);
}

const deferredPolicy = classifySupportProjection({
  DTXR: 'ATTA FOR FLOOR OPENING',
  ISONOTE: 'FENCE PENETRATION',
});
assert.equal(deferredPolicy.disposition, 'DEFER_SUPPORT');
assert.equal(deferredPolicy.authority, 'NON_RESTRAINT_ATTACHMENT_DESCRIPTION');

const explicitPolicy = classifySupportProjection({
  DTXR: 'ATTA FOR FLOOR OPENING',
  ISONOTE: 'FENCE PENETRATION',
  CMPSUPTYPE: 'REST',
});
assert.equal(explicitPolicy.disposition, 'EMIT_SUPPORT_ATTACHMENT');
assert.equal(explicitPolicy.authority, 'ATTRIBUTE:CMPSUPTYPE');

const deferred = await buildComponentTopologyArtifacts(sourceFixture({
  DTXR: 'ATTA FOR FLOOR OPENING',
  ISONOTE: 'FENCE PENETRATION',
}), {
  sourceName: 'support-deferred.json',
  jobName: 'Support Deferred',
  toleranceMm: TOPOLOGY_TOLERANCE_MM,
  supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
  enrichmentConfig: {},
});
const deferredRecord = deferred.traceLedger.records.find((row) => row.sourceRef === '=TEST/1');
assert(deferredRecord, 'deferred support ledger record must exist');
assert.equal(deferredRecord.primaryDisposition, 'DEFER_SUPPORT');
assert.equal(deferredRecord.projectionCardinality, 'DEFERRED');
assert.equal(deferredRecord.lossClassification, 'DEFERRED_NON_RESTRAINT_ATTACHMENT');
assert.equal(deferredRecord.status, 'ACCEPTED');
assert.deepEqual(deferredRecord.canonicalNodeIds, []);
assert.deepEqual(deferredRecord.inputXmlElementIds, []);
assert.deepEqual(deferredRecord.inputXmlChildIds, []);
assert.equal(deferred.metrics.ledger.deferredSupports, 1);
assert.equal(deferred.metrics.canonical.supports, 0);
assert.equal(deferred.metrics.inputXml.restraints, 0);

await assert.rejects(
  buildComponentTopologyArtifacts(sourceFixture({
    DTXR: 'REST SUPPORT',
    CMPSUPTYPE: 'REST',
  }), {
    sourceName: 'support-off-route.json',
    jobName: 'Support Off Route',
    toleranceMm: TOPOLOGY_TOLERANCE_MM,
    supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
    enrichmentConfig: {},
  }),
  /Support =TEST\/1 is 4000\.000 mm from its owning branch; limit is 50\.000 mm\. \[SOURCE_SUPPORT_POSITION_OR_ROUTE_INVALID\]/,
);

const nearRoute = JSON.parse(sourceFixture({ DTXR: 'REST SUPPORT', CMPSUPTYPE: 'REST' }));
nearRoute[0].children[1].attributes.POS = point(500, 0, 0);
nearRoute[0].children[1].attributes.APOS = point(500, 0, 0);
nearRoute[0].children[1].attributes.LPOS = point(500, 0, 0);
const projected = await buildComponentTopologyArtifacts(JSON.stringify(nearRoute), {
  sourceName: 'support-projected.json',
  jobName: 'Support Projected',
  toleranceMm: TOPOLOGY_TOLERANCE_MM,
  supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
  enrichmentConfig: {},
});
const projectedRecord = projected.traceLedger.records.find((row) => row.sourceRef === '=TEST/1');
assert.equal(projectedRecord.primaryDisposition, 'EMIT_SUPPORT_ATTACHMENT');
assert.equal(projectedRecord.projectionCardinality, 'ONE_TO_MANY');
assert.equal(projected.metrics.canonical.supports, 1);
assert.equal(projected.metrics.inputXml.restraints, 1);

const referencedSource = JSON.parse(sourceFixture({
  DTXR: 'ATTA FOR FLOOR OPENING',
  ISONOTE: 'FENCE PENETRATION',
  ATTACHED_COMPONENT_REF: '=PIPE/1',
  COMPRE: '=PIPE/1',
}));
referencedSource[0].children[1].attributes.POS = point(500, 0, 200);
referencedSource[0].children[1].attributes.APOS = point(500, 0, 200);
referencedSource[0].children[1].attributes.LPOS = point(500, 0, 200);
const referenced = await buildComponentTopologyArtifacts(JSON.stringify(referencedSource), {
  sourceName: 'support-referenced.json',
  jobName: 'Support Referenced',
  toleranceMm: TOPOLOGY_TOLERANCE_MM,
  supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
  enrichmentConfig: {},
});
const referencedSupport = referenced.canonicalTopology.supports[0];
const referencedRecord = referenced.traceLedger.records.find((row) => row.sourceRef === '=TEST/1');
assert.equal(referencedRecord.primaryDisposition, 'EMIT_SUPPORT_ATTACHMENT');
assert.equal(referencedRecord.projectionCardinality, 'ONE_TO_MANY');
assert.equal(referencedSupport.sourcePosition.z, 200);
assert.equal(referencedSupport.position.z, 0);
assert.equal(referencedSupport.attachmentPosition.z, 0);
assert.equal(referencedSupport.connectionResidual, 200);
assert.match(referencedSupport.attachmentAuthority, /ATTACHED_COMPONENT_REF\/COMPRE:=PIPE\/1/);
assert.equal(referenced.metrics.canonical.supports, 1);
assert.equal(referenced.metrics.inputXml.restraints, 1);

console.log('component topology support policy passed.');
