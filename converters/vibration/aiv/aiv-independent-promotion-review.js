import { AIV_PROMOTION_READINESS_SCHEMA } from './aiv-promotion-readiness.js';

export const AIV_INDEPENDENT_PROMOTION_REVIEW_SCHEMA = 'AivIndependentVibrationEngineerPromotionReview.v1';
export const AIV_INDEPENDENT_PROMOTION_REVIEW_VERIFICATION_SCHEMA = 'AivIndependentVibrationEngineerPromotionReviewVerification.v1';

export const AIV_INDEPENDENT_PROMOTION_RECOMMENDATIONS = Object.freeze([
  'RECOMMEND_BENCHMARK_ONLY_PROMOTION',
  'REWORK_REQUIRED',
  'REJECT_PROMOTION',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function reviewError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.name = 'AivIndependentPromotionReviewError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function prerequisiteGates(plan) {
  return (plan.gates ?? []).filter((gate) => gate.prerequisiteForAuthorityReview === true);
}

function finalReviewGate(plan) {
  return (plan.gates ?? []).find((gate) => gate.finalHumanAuthorityGate === true) ?? null;
}

export function assertAivPromotionReadinessForIndependentReview(plan) {
  if (plan?.schema !== AIV_PROMOTION_READINESS_SCHEMA || plan?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw reviewError('AIV_INDEPENDENT_REVIEW_PROMOTION_SCHEMA_INVALID', `Expected ${AIV_PROMOTION_READINESS_SCHEMA} for VIB.AIV.ACOUSTIC.`);
  }
  if (plan.status !== 'READY_FOR_INDEPENDENT_AUTHORITY_REVIEW' || plan.eligibleForAuthorityReview !== true) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_PREREQUISITES_INCOMPLETE', 'Independent review package requires all promotion prerequisites to be satisfied.');
  }
  if (plan.authorityPromotionAuthorized !== false || plan.independentVibrationEngineerReviewRequired !== true) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_PROMOTION_BOUNDARY_INVALID', 'Promotion readiness must remain advisory and require independent vibration-engineer review.');
  }
  const authority = plan.authority ?? {};
  if (authority.calculationState !== 'BLOCKED'
    || authority.qualificationState !== 'BLOCKED'
    || authority.engineeringAuthority !== 'NONE'
    || authority.productionEquationAuthorized !== false
    || authority.screeningAuthority !== 'NOT_AUTHORIZED'
    || authority.designAuthority !== false) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_AUTHORITY_INVALID', 'Promotion-readiness input must retain the blocked AIV authority boundary.');
  }
  const prerequisites = prerequisiteGates(plan);
  if (prerequisites.length !== 6 || prerequisites.some((gate) => gate.status !== 'SATISFIED')) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_GATE_SET_INVALID', 'Exactly six satisfied prerequisite gates are required.');
  }
  for (const gate of prerequisites) {
    if (!sha256Value(gate.evidenceSha256) || gate.verificationSchemaObserved !== gate.verificationSchema) {
      throw reviewError('AIV_INDEPENDENT_REVIEW_GATE_EVIDENCE_INVALID', `${gate.gateId} must retain its verified artifact SHA-256 and schema identity.`);
    }
  }
  const finalGate = finalReviewGate(plan);
  if (!finalGate || finalGate.gateId !== 'INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW' || finalGate.status !== 'UNSATISFIED') {
    throw reviewError('AIV_INDEPENDENT_REVIEW_FINAL_GATE_INVALID', 'The independent vibration-engineer gate must remain separate and unsatisfied before handoff.');
  }
  return plan;
}

function evidenceSnapshot(plan) {
  return prerequisiteGates(plan).map((gate) => ({
    gateId: gate.gateId,
    artifactSha256: gate.evidenceSha256,
    verificationSchema: gate.verificationSchemaObserved,
  }));
}

export function createAivIndependentPromotionReviewTemplate(planInput, options = {}) {
  const plan = assertAivPromotionReadinessForIndependentReview(planInput);
  if (!sha256Value(options.promotionReadinessArtifactSha256)) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_PLAN_HASH_REQUIRED', 'Independent review template requires the SHA-256 of the exact promotion-readiness artifact bytes.');
  }
  return deepFreeze({
    schema: AIV_INDEPENDENT_PROMOTION_REVIEW_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    source: {
      promotionReadinessSchema: plan.schema,
      promotionReadinessArtifactSha256: options.promotionReadinessArtifactSha256,
      prerequisiteEvidence: evidenceSnapshot(plan),
    },
    review: {
      state: 'PENDING',
      reviewerType: null,
      reviewer: null,
      reviewerOrganization: null,
      reviewerRole: null,
      reviewDate: null,
      recommendation: null,
      recommendedAuthorityTarget: null,
      rationale: null,
      conditions: [],
    },
    attestations: {
      independentFromImplementation: null,
      controlledSourceEvidenceReviewed: null,
      qualificationEvidenceReviewed: null,
      benchmarkLimitationsAccepted: null,
      screeningAndDesignRemainUnauthorized: null,
    },
    authority: {
      authorityTransitionApplied: false,
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
  });
}

function assertEvidenceSnapshot(plan, review) {
  const expected = evidenceSnapshot(plan);
  const observed = review?.source?.prerequisiteEvidence;
  if (!Array.isArray(observed) || observed.length !== expected.length) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_EVIDENCE_SET_INVALID', 'Independent review must retain the complete prerequisite evidence snapshot.');
  }
  expected.forEach((item, index) => {
    const actual = observed[index];
    if (actual?.gateId !== item.gateId || actual?.artifactSha256 !== item.artifactSha256 || actual?.verificationSchema !== item.verificationSchema) {
      throw reviewError('AIV_INDEPENDENT_REVIEW_EVIDENCE_MISMATCH', `${item.gateId} review evidence identity changed.`);
    }
  });
}

export function assertAivIndependentPromotionReviewComplete(planInput, review, options = {}) {
  const plan = assertAivPromotionReadinessForIndependentReview(planInput);
  if (review?.schema !== AIV_INDEPENDENT_PROMOTION_REVIEW_SCHEMA || review?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw reviewError('AIV_INDEPENDENT_REVIEW_SCHEMA_INVALID', `Expected ${AIV_INDEPENDENT_PROMOTION_REVIEW_SCHEMA}.`);
  }
  if (!sha256Value(options.promotionReadinessArtifactSha256)
    || review?.source?.promotionReadinessArtifactSha256 !== options.promotionReadinessArtifactSha256
    || review?.source?.promotionReadinessSchema !== plan.schema) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_PLAN_MISMATCH', 'Review is not bound to the supplied promotion-readiness artifact bytes.');
  }
  assertEvidenceSnapshot(plan, review);
  const authority = review.authority ?? {};
  if (authority.authorityTransitionApplied !== false
    || authority.calculationState !== 'BLOCKED'
    || authority.qualificationState !== 'BLOCKED'
    || authority.engineeringAuthority !== 'NONE'
    || authority.productionEquationAuthorized !== false
    || authority.screeningAuthority !== 'NOT_AUTHORIZED'
    || authority.designAuthority !== false) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_AUTHORITY_MUTATION_FORBIDDEN', 'Independent review artifact cannot itself apply an AIV authority transition.');
  }
  const human = review.review ?? {};
  if (human.state !== 'REVIEWED'
    || human.reviewerType !== 'HUMAN_VIBRATION_ENGINEER'
    || !nonBlank(human.reviewer)
    || !nonBlank(human.reviewerOrganization)
    || !nonBlank(human.reviewerRole)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(human.reviewDate ?? ''))) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_HUMAN_REQUIRED', 'A named HUMAN_VIBRATION_ENGINEER review with organization, role and ISO date is required.');
  }
  if (!AIV_INDEPENDENT_PROMOTION_RECOMMENDATIONS.includes(human.recommendation)) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_RECOMMENDATION_REQUIRED', `Recommendation must be one of: ${AIV_INDEPENDENT_PROMOTION_RECOMMENDATIONS.join(', ')}.`);
  }
  const recommendsPromotion = human.recommendation === 'RECOMMEND_BENCHMARK_ONLY_PROMOTION';
  if ((recommendsPromotion && human.recommendedAuthorityTarget !== 'BENCHMARK_ONLY')
    || (!recommendsPromotion && human.recommendedAuthorityTarget !== null)) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_TARGET_INVALID', 'BENCHMARK_ONLY may be named only with an explicit promotion recommendation.');
  }
  if (!nonBlank(human.rationale) || !Array.isArray(human.conditions)) {
    throw reviewError('AIV_INDEPENDENT_REVIEW_RATIONALE_REQUIRED', 'Independent review requires rationale and a conditions array.');
  }
  const attestations = review.attestations ?? {};
  for (const key of [
    'independentFromImplementation',
    'controlledSourceEvidenceReviewed',
    'qualificationEvidenceReviewed',
    'benchmarkLimitationsAccepted',
    'screeningAndDesignRemainUnauthorized',
  ]) {
    if (attestations[key] !== true) throw reviewError('AIV_INDEPENDENT_REVIEW_ATTESTATION_REQUIRED', `${key} must be explicitly accepted by the human reviewer.`);
  }
  return deepFreeze({
    schema: AIV_INDEPENDENT_PROMOTION_REVIEW_VERIFICATION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    reviewComplete: true,
    recommendation: human.recommendation,
    recommendedAuthorityTarget: human.recommendedAuthorityTarget,
    prerequisiteEvidenceCount: prerequisiteGates(plan).length,
    authorityTransitionApplied: false,
    productionEquationAuthorized: false,
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
    nextAction: recommendsPromotion
      ? 'SEPARATE_REVIEWED_AUTHORITY_TRANSITION_CHANGE_REQUIRED'
      : 'NO_AUTHORITY_TRANSITION',
  });
}
