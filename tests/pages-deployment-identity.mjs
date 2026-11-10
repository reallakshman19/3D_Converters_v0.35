/** Release identity must come from published Pages bytes, not a test constant. */
import assert from 'node:assert/strict';

const SHA=/^[0-9a-f]{40}$/;
export const DEPLOYMENT_SCHEMA='xml-cii-production-deployment/v1';

export function verifyDeploymentIdentity(identity, expectedSha) {
  assert.ok(typeof expectedSha==='string' && SHA.test(expectedSha),
    'PAGES_EXPECTED_SHA must be a full, lowercase, 40-character commit SHA');
  assert.equal(identity?.schema, DEPLOYMENT_SCHEMA,
    'Published deployment manifest is absent or has the wrong schema');
  assert.equal(identity?.repository, 'reallakshman19/3D_Converters_v0.35');
  assert.ok(typeof identity?.commitSha==='string' && SHA.test(identity.commitSha),
    'Published deployment SHA is missing or malformed');
  assert.ok(typeof identity?.workflowRunId==='string' &&
    /^\d+$/.test(identity.workflowRunId),
    'Published workflow run identity is missing or invalid');
  assert.equal(identity.commitSha, expectedSha,
    'Live Pages artifact does not contain the expected release commit');
  return {
    status:'PASS_PUBLISHED_ARTIFACT_SHA',
    verifiedDeployedCommit:identity.commitSha,
    expectedDeployedCommit:expectedSha,
    deploymentWorkflowRunId:identity.workflowRunId,
    evidence:'LIVE_SAME_ORIGIN_RELEASE_IDENTITY_JSON',
  };
}
