// Publish the immutable predecessor admission proven by governed build and parser evidence.
// All four independent gates must pass; no owner-waiver fallback grants release eligibility.
import { deepFreeze } from './canonical-json.js';
import { buildFbxPredecessorCertification } from './predecessor-certification.js';

export const FBX_RUNTIME_004_PREDECESSOR_CERTIFICATION = deepFreeze(
  buildFbxPredecessorCertification({
    evidence: {
      governedWasmBuild: 'passed',
      provenanceReconciliation: 'passed',
      reproducibility: 'passed',
      parserParity: 'passed',
    },
    ownerWaiver: {
      authorized: false,
      rationale: null,
    },
  }),
);
