// Verify exact COMPLETE/BLOCKED/OWNER-WAIVED predecessor admission semantics.
import assert from 'node:assert/strict';
import {
  FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES,
  FbxPredecessorCertificationError,
  assertFbxPredecessorContinuationAuthorized,
  assertFbxPredecessorReleaseEligible,
  buildFbxPredecessorCertification,
  isFbxPredecessorContinuationAuthorized,
  isFbxPredecessorEvidencePassing,
  isFbxPredecessorReleaseEligible,
  validateFbxPredecessorCertification,
} from '../../tabs/model-converters/converters/fbx/predecessor-certification.js';
import {
  FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION,
} from '../../tabs/model-converters/converters/fbx/runtime-004-admission.js';

assert.equal(FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION.status, 'COMPLETE');
assert.equal(isFbxPredecessorEvidencePassing(FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION), true);
assert.equal(isFbxPredecessorContinuationAuthorized(FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION), true);
assert.equal(isFbxPredecessorReleaseEligible(FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION), true);
assert.deepEqual(FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION.ownerWaiver, {
  authorized: false,
  rationale: null,
});
assert.deepEqual(FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION.evidence, {
  governedWasmBuild: 'passed',
  provenanceReconciliation: 'passed',
  reproducibility: 'passed',
  parserParity: 'passed',
});
assert.deepEqual(FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION.admission, {
  evidencePassing: true,
  continuationAuthorized: true,
  releaseEligible: true,
});

const passed = {
  governedWasmBuild: 'passed',
  provenanceReconciliation: 'passed',
  reproducibility: 'passed',
  parserParity: 'passed',
};

const complete = buildFbxPredecessorCertification({ evidence: passed });
assert.equal(complete.status, 'COMPLETE');
assert.equal(isFbxPredecessorEvidencePassing(complete), true);
assert.equal(isFbxPredecessorContinuationAuthorized(complete), true);
assert.equal(isFbxPredecessorReleaseEligible(complete), true);
assert.equal(assertFbxPredecessorReleaseEligible(complete), complete);
assert.ok(Object.isFrozen(complete));
assert.ok(Object.isFrozen(complete.evidence));

const incomplete = { ...passed, governedWasmBuild: 'missing' };
const blocked = buildFbxPredecessorCertification({ evidence: incomplete });
assert.equal(blocked.status, 'BLOCKED');
assert.equal(isFbxPredecessorEvidencePassing(blocked), false);
assert.equal(isFbxPredecessorContinuationAuthorized(blocked), false);
assert.equal(isFbxPredecessorReleaseEligible(blocked), false);
assert.throws(
  () => assertFbxPredecessorContinuationAuthorized(blocked),
  (error) => error instanceof FbxPredecessorCertificationError
    && error.code === FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.CONTINUATION_BLOCKED,
);

const waived = buildFbxPredecessorCertification({
  evidence: incomplete,
  ownerWaiver: {
    authorized: true,
    rationale: 'Owner directs implementation to continue while predecessor evidence remains open.',
  },
});
assert.equal(waived.status, 'OWNER-WAIVED');
assert.equal(isFbxPredecessorEvidencePassing(waived), false);
assert.equal(isFbxPredecessorContinuationAuthorized(waived), true);
assert.equal(isFbxPredecessorReleaseEligible(waived), false);
assert.equal(assertFbxPredecessorContinuationAuthorized(waived), waived);
assert.throws(
  () => assertFbxPredecessorReleaseEligible(waived),
  (error) => error.code === FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.RELEASE_BLOCKED
    && /not passing/.test(error.message),
);

const forgedStatus = structuredClone(waived);
forgedStatus.status = 'COMPLETE';
assert.throws(
  () => validateFbxPredecessorCertification(forgedStatus),
  (error) => error.code === FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID,
);

const forgedAdmission = structuredClone(waived);
forgedAdmission.admission.evidencePassing = true;
forgedAdmission.admission.releaseEligible = true;
assert.throws(
  () => validateFbxPredecessorCertification(forgedAdmission),
  (error) => error.code === FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID,
);

assert.throws(
  () => buildFbxPredecessorCertification({
    evidence: incomplete,
    ownerWaiver: { authorized: true, rationale: '   ' },
  }),
  (error) => error.code === FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID,
);

assert.throws(
  () => buildFbxPredecessorCertification({
    evidence: passed,
    ownerWaiver: { authorized: true, rationale: 'Unnecessary waiver.' },
  }),
  (error) => error.code === FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID,
);

const extraField = structuredClone(blocked);
extraField.evidence.untracked = 'passed';
assert.throws(
  () => validateFbxPredecessorCertification(extraField),
  (error) => error.code === FBX_PREDECESSOR_CERTIFICATION_ERROR_CODES.INVALID,
);

console.log('test-predecessor-certification: PASS');
