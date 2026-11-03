import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEngineering } from '../converters/engineering-calculations/index.js';
import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  resolveAivWorkingTablesWithAssumptions,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import {
  AIV_TOPOLOGY_INPUT_FORMAT,
  buildAivReadinessFromTables,
} from '../converters/vibration/aiv/aiv-readiness-tables.js';
import { serializeAivInputTable } from '../tabs/vibration-aiv-input-model.js';
import {
  AIV_SMALL_FLARE_MOCK_CASE,
  createAivSmallFlareMockNetwork,
} from '../tabs/vibration-aiv-mock-flare-network.js';
import { projectAivFlareNetworkIntoWorkspace } from '../tabs/vibration-aiv-flare-network-state.js';
import { buildAivEngineeringScreeningRequest } from '../tabs/vibration-aiv-screening-request.js';

function controlledMockReadiness() {
  const projected = projectAivFlareNetworkIntoWorkspace(createAivSmallFlareMockNetwork());
  const assumptionResolution = resolveAivWorkingTablesWithAssumptions(
    projected.tables,
    AIV_DEFAULT_ASSUMPTION_PROFILE,
  );
  const envelope = buildAivReadinessFromTables({
    topology: {
      format: AIV_TOPOLOGY_INPUT_FORMAT.FLARE_NETWORK,
      data: projected.topologyInput.data,
      sourceFileName: projected.topologyInput.sourceFileName,
    },
    sourceCsv: serializeAivInputTable(assumptionResolution.tables.sources),
    assessmentCsv: serializeAivInputTable(assumptionResolution.tables.assessments),
    sourceAssessmentCsv: serializeAivInputTable(assumptionResolution.tables.relationships),
  });
  return { envelope, assumptionResolution };
}

test('controlled two-RV mock executes the exact readiness-envelope to registered AIV screening bridge', () => {
  const { envelope } = controlledMockReadiness();
  assert.deepEqual(envelope.readiness.counts, {
    rows: 2,
    readyForQualification: 2,
    methodGap: 0,
    notReady: 0,
    notApplicable: 0,
  });

  const request = buildAivEngineeringScreeningRequest({
    readinessEnvelope: envelope,
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
  });
  const result = calculateEngineering(request);

  assert.equal(result.ok, true);
  assert.equal(result.calculationId, 'VIB.AIV.ACOUSTIC');
  assert.equal(result.outputs.screeningResultScope, 'ASSESSMENT');
  assert.equal(result.outputs.completeKernelStageCount, 10);
  assert.deepEqual(
    result.outputs.sourceResults.map((item) => [item.sourceCanonicalId, item.caseId]),
    [['RV-101', AIV_SMALL_FLARE_MOCK_CASE], ['RV-102', AIV_SMALL_FLARE_MOCK_CASE]],
  );
  assert.equal(result.outputs.assessmentResults.length, 1);
  assert.equal(result.outputs.assessmentResults[0].caseId, AIV_SMALL_FLARE_MOCK_CASE);
  assert.deepEqual(
    result.outputs.assessmentResults[0].contributingSourceCanonicalIds,
    ['RV-101', 'RV-102'],
  );
  assert.equal(result.outputs.lineCaseSummaries[0].authoritativeForScreening, false);
  assert.equal(result.assessment.designAuthority, false);
});

test('screening bridge fails closed on a null relationship record instead of dereferencing caseId', () => {
  const { envelope } = controlledMockReadiness();
  const brokenEnvelope = {
    ...envelope,
    sourceAssessments: [null, ...envelope.sourceAssessments.slice(1)],
  };
  assert.throws(
    () => buildAivEngineeringScreeningRequest({
      readinessEnvelope: brokenEnvelope,
      assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
    }),
    (error) => error?.code === 'AIV_SCREENING_REQUEST_RECORD_INVALID'
      && /Source→Assessment record 1/u.test(error.message),
  );
});
