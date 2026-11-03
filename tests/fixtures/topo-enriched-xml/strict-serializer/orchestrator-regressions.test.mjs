import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSemanticHash } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import {
  buildPsiSerializationPlan,
  computeOccurrencePlanHash,
  verifyPsiSerializationPlan,
} from '../../../../tabs/stagedjson-to-enrichxml/psi-serialization-plan.js';
import { projectStrictPsiNodeContent } from '../../../../tabs/stagedjson-to-enrichxml/psi-strict-node-projector.js';

const passValidation = () => ({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });

test('reducer alpha-angle fallback preserves approved HPOS and TPOS precedence', () => {
  const content = projectStrictPsiNodeContent({
    occurrence: {
      occurrenceId: 'WO-REDU',
      sourceEntityId: 'SE-REDU',
      sourceBranch: '/LINE-A/B1',
      canonicalMainLine: '/LINE-A',
      componentProjectionId: 'CP-REDU',
      projectionRole: 'LEAVE',
      endpoint: 2,
      psiComponentType: 'REDU',
      coordinateRole: 'BEST',
      disposition: 'EMITTED',
      coordinateEvidence: { point: { x: 100, y: 0, z: 0 } },
    },
    sourceRecord: {
      sourceEntityId: 'SE-REDU',
      componentType: 'REDU',
      ref: 'REF-REDU',
      attrs: {
        HPOS: { x: 0, y: 0, z: 0 },
        TPOS: { x: 100, y: 0, z: 0 },
        ABORE: 100,
        LBORE: 80,
      },
      enrichedAttributes: {
        nominalBoreMm: 100,
        pipeOdMm: 114.3,
        wallThicknessMm: 6.02,
        corrosionAllowanceMm: 1.5,
        insulationThicknessMm: 25,
      },
    },
  });

  assert.equal(Number.isFinite(content.alphaAngle), true);
  assert.ok(content.alphaAngle > 0);
});

test('supplied serialization plan must exactly match rebuilt validation evidence', async () => {
  const occurrence = {
    occurrenceId: 'WO-PIPE-ARRIVE',
    sourceEntityId: 'SE-PIPE',
    sourceBranch: '/LINE-A/B1',
    canonicalMainLine: '/LINE-A',
    componentProjectionId: 'CP-PIPE',
    projectionRole: 'ARRIVE',
    endpoint: 1,
    psiComponentType: 'PIPE',
    coordinateRole: 'APOS',
    disposition: 'EMITTED',
    logicalNodeId: 'LN-PIPE',
    coordinateEvidence: { selectedRole: 'APOS', sourceField: 'attrs.APOS', available: true, point: { x: 0, y: 0, z: 0 } },
  };
  const occurrencePlan = {
    schema: 'PsiWriterOccurrencePlan.v1',
    projectId: 'PROJECT-TE004-REVIEW',
    zoneId: 'ZONE-TE004-REVIEW',
    sourceInventoryHash: 'sha256:source',
    logicalTopologyHash: 'sha256:topology',
    sequencePlanHash: 'sha256:sequence',
    occurrences: [occurrence],
    componentProjection: [{
      componentProjectionId: 'CP-PIPE',
      sourceEntityId: 'SE-PIPE',
      sourceBranch: '/LINE-A/B1',
      canonicalMainLine: '/LINE-A',
      rawComponentType: 'PIPE',
      normalizedComponentType: 'PIPE',
      occurrenceIds: ['WO-PIPE-ARRIVE'],
    }],
    validation: passValidation(),
  };
  occurrencePlan.occurrencePlanHash = await computeOccurrencePlanHash(occurrencePlan);

  const nodePlan = {
    schema: 'TopoNodePlan.v1',
    projectId: occurrencePlan.projectId,
    zoneId: occurrencePlan.zoneId,
    sourceInventoryHash: occurrencePlan.sourceInventoryHash,
    logicalTopologyHash: occurrencePlan.logicalTopologyHash,
    sequencePlanHash: occurrencePlan.sequencePlanHash,
    baseRegistrySnapshotHash: 'sha256:registry',
    configHash: 'sha256:config',
    logicalNodes: [{ logicalNodeId: 'LN-PIPE' }],
    emittedOccurrences: [{
      occurrenceId: 'WO-PIPE-ARRIVE',
      logicalNodeId: 'LN-PIPE',
      componentProjectionId: 'CP-PIPE',
      engineeringNodeNumber: 100,
      sourceEntityId: 'SE-PIPE',
      sourceBranch: '/LINE-A/B1',
      canonicalMainLine: '/LINE-A',
      projectionRole: 'ARRIVE',
      endpoint: 1,
      psiComponentType: 'PIPE',
    }],
    reservedOccurrences: [],
    rawPortMappings: [],
    componentProjection: [{
      componentProjectionId: 'CP-PIPE',
      sourceEntityId: 'SE-PIPE',
      emittedOccurrenceIds: ['WO-PIPE-ARRIVE'],
      reservedOccurrenceIds: [],
    }],
    validation: passValidation(),
  };
  nodePlan.nodePlanHash = await computeSemanticHash(nodePlan, 'nodePlanHash');

  const expected = await buildPsiSerializationPlan({ occurrencePlan, nodePlan });
  const supplied = structuredClone(expected);
  supplied.validation = {
    status: 'BLOCKED',
    blockers: [{ code: 'TAMPERED_VALIDATION', evidence: {} }],
    reviewItems: [],
    warnings: [],
  };

  const verified = await verifyPsiSerializationPlan({ occurrencePlan, nodePlan, serializationPlan: supplied });
  assert.ok(verified.blockers.some((row) => (
    row.code === 'SERIALIZATION_PLAN_CONTRACT_INVALID'
      && row.evidence?.reason === 'SUPPLIED_PLAN_AGREEMENT_MISMATCH'
  )));
});
