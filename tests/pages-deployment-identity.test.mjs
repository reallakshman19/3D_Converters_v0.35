import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDeploymentIdentity,DEPLOYMENT_SCHEMA}
  from './pages-deployment-identity.mjs';

const sha='a'.repeat(40);
const proof={schema:DEPLOYMENT_SCHEMA,
  repository:'reallakshman19/3D_Converters_v0.35',
  commitSha:sha,workflowRunId:'42847303668'};

test('Pages release identity accepts only exact published SHA',()=>{
  assert.deepEqual(verifyDeploymentIdentity(proof,sha),{
    status:'PASS_PUBLISHED_ARTIFACT_SHA',verifiedDeployedCommit:sha,
    expectedDeployedCommit:sha,deploymentWorkflowRunId:'42847303668',
    evidence:'LIVE_SAME_ORIGIN_RELEASE_IDENTITY_JSON'});
});
test('release mismatch is not attributed to the currently tested branch',()=>{
  assert.throws(()=>verifyDeploymentIdentity(proof,'b'.repeat(40)),
    /does not contain the expected release commit/);
});
test('missing, malformed or fabricated release attestation refuses qualification',()=>{
  assert.throws(()=>verifyDeploymentIdentity(null,sha),/wrong schema/);
  assert.throws(()=>verifyDeploymentIdentity({...proof,commitSha:'unknown'},sha),/malformed/);
  assert.throws(()=>verifyDeploymentIdentity({...proof,workflowRunId:'none'},sha),/invalid/);
  assert.throws(()=>verifyDeploymentIdentity({...proof,repository:'other/repo'},sha));
  assert.throws(()=>verifyDeploymentIdentity(proof,'short'),/40-character/);
});
