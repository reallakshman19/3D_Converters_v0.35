export const AIV_PROMOTION_READINESS_SCHEMA = 'AivQualificationPromotionReadiness.v1';

export const AIV_PROMOTION_GATE_STATUS = Object.freeze({
  SATISFIED: 'SATISFIED',
  UNSATISFIED: 'UNSATISFIED',
  INVALID_EVIDENCE: 'INVALID_EVIDENCE',
});

export const AIV_PROMOTION_GATE_DEFINITIONS = Object.freeze([
  Object.freeze({
    gateId: 'CONTROLLED_T2_7_HUMAN_RECONCILIATION',
    artifactKey: 't27Reconciliation',
    verificationSchema: 'AivT27ReconciliationVerification.v1',
    prerequisiteForAuthorityReview: true,
  }),
  Object.freeze({
    gateId: 'RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC',
    artifactKey: 'd23Flm1Reconciliation',
    verificationSchema: 'AivD23Flm1ReconciliationVerification.v1',
    prerequisiteForAuthorityReview: true,
  }),
  Object.freeze({
    gateId: 'RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE',
    artifactKey: 'workedExampleResultScope',
    verificationSchema: 'AivWorkedExampleResultScopeReviewVerification.v1',
    prerequisiteForAuthorityReview: true,
  }),
  Object.freeze({
    gateId: 'INDEPENDENT_SONIC_SFF6_BENCHMARK',
    artifactKey: 'independentBenchmarks',
    verificationSchema: 'AivIndependentBenchmarkReviewVerification.v1',
    prerequisiteForAuthorityReview: true,
  }),
  Object.freeze({
    gateId: 'INDEPENDENT_MULTI_SOURCE_BENCHMARK',
    artifactKey: 'independentBenchmarks',
    verificationSchema: 'AivIndependentBenchmarkReviewVerification.v1',
    prerequisiteForAuthorityReview: true,
  }),
  Object.freeze({
    gateId: 'RETAINED_WORKBOOK_RECONCILIATION',
    artifactKey: 'workbookReconciliation',
    verificationSchema: 'AivWorkbookReconciliationVerification.v1',
    prerequisiteForAuthorityReview: true,
  }),
  Object.freeze({
    gateId: 'INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW',
    artifactKey: null,
    verificationSchema: 'AivIndependentVibrationEngineerPromotionReview.v1',
    prerequisiteForAuthorityReview: false,
    finalHumanAuthorityGate: true,
  }),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function invalid(gate, code, message, evidence = null) {
  return {
    ...gate,
    status: AIV_PROMOTION_GATE_STATUS.INVALID_EVIDENCE,
    evidenceSha256: evidence?.artifactSha256 ?? null,
    verificationSchemaObserved: evidence?.verification?.schema ?? null,
    issue: { code, message },
  };
}

function missing(gate) {
  return {
    ...gate,
    status: AIV_PROMOTION_GATE_STATUS.UNSATISFIED,
    evidenceSha256: null,
    verificationSchemaObserved: null,
    issue: {
      code: gate.finalHumanAuthorityGate
        ? 'AIV_INDEPENDENT_ENGINEER_PROMOTION_REVIEW_REQUIRED'
        : 'AIV_PROMOTION_EVIDENCE_REQUIRED',
      message: gate.finalHumanAuthorityGate
        ? 'Independent vibration-engineer promotion review remains a separate human authority gate.'
        : `Verification evidence is required for ${gate.gateId}.`,
    },
  };
}

function baseVerificationCheck(gate, evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return invalid(gate, 'AIV_PROMOTION_EVIDENCE_RECORD_INVALID', `${gate.gateId} requires an evidence record with artifactSha256 and verification.`);
  }
  if (!sha256Value(evidence.artifactSha256)) {
    return invalid(gate, 'AIV_PROMOTION_EVIDENCE_HASH_REQUIRED', `${gate.gateId} requires a SHA-256 hash of the verification artifact bytes.`, evidence);
  }
  const verification = evidence.verification;
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    return invalid(gate, 'AIV_PROMOTION_VERIFICATION_OBJECT_REQUIRED', `${gate.gateId} requires a structured verification artifact.`, evidence);
  }
  if (verification.schema !== gate.verificationSchema || verification.methodId !== 'VIB.AIV.ACOUSTIC') {
    return invalid(
      gate,
      'AIV_PROMOTION_VERIFICATION_SCHEMA_INVALID',
      `${gate.gateId} requires ${gate.verificationSchema} for VIB.AIV.ACOUSTIC.`,
      evidence,
    );
  }
  if (verification.productionEquationAuthorized !== false) {
    return invalid(gate, 'AIV_PROMOTION_EVIDENCE_AUTHORITY_INVALID', `${gate.gateId} verification must explicitly retain productionEquationAuthorized=false.`, evidence);
  }
  return null;
}

function completionCheck(gateId, verification) {
  if (gateId === 'CONTROLLED_T2_7_HUMAN_RECONCILIATION') {
    return verification.reconciliationComplete === true && verification.reviewedTraceCount === 9;
  }
  if (gateId === 'RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC') {
    return verification.reconciliationComplete === true
      && Number.isFinite(verification.benchmarkExpectedFlm1)
      && Number.isFinite(verification.benchmarkToleranceAbs);
  }
  if (gateId === 'RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE') {
    return verification.reviewComplete === true
      && verification.scopeSeparationAccepted === true
      && verification.lineAggregationImplementationAuthorized === false;
  }
  if (gateId === 'INDEPENDENT_SONIC_SFF6_BENCHMARK') {
    return verification.reviewComplete === true && verification.sonicSff6BenchmarkAccepted === true;
  }
  if (gateId === 'INDEPENDENT_MULTI_SOURCE_BENCHMARK') {
    return verification.reviewComplete === true && verification.multiSourceBenchmarksAccepted === true;
  }
  if (gateId === 'RETAINED_WORKBOOK_RECONCILIATION') {
    return verification.reconciliationComplete === true
      && verification.workbookFormulasRemainMigrationEvidenceOnly === true;
  }
  return false;
}

function evaluatePrerequisite(gate, evidence) {
  if (evidence === undefined || evidence === null) return missing(gate);
  const invalidBase = baseVerificationCheck(gate, evidence);
  if (invalidBase) return invalidBase;
  if (!completionCheck(gate.gateId, evidence.verification)) {
    return invalid(
      gate,
      'AIV_PROMOTION_VERIFICATION_INCOMPLETE',
      `${gate.gateId} verification does not demonstrate the required completed human/benchmark reconciliation.`,
      evidence,
    );
  }
  return {
    ...gate,
    status: AIV_PROMOTION_GATE_STATUS.SATISFIED,
    evidenceSha256: evidence.artifactSha256,
    verificationSchemaObserved: evidence.verification.schema,
    issue: null,
  };
}

export function buildAivQualificationPromotionReadiness(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('AIV promotion readiness input must be an object of verification evidence records.');
  }
  const gates = AIV_PROMOTION_GATE_DEFINITIONS.map((gate) => {
    if (gate.finalHumanAuthorityGate) return missing(gate);
    return evaluatePrerequisite(gate, input[gate.artifactKey]);
  });
  const prerequisites = gates.filter((gate) => gate.prerequisiteForAuthorityReview);
  const eligibleForAuthorityReview = prerequisites.every((gate) => gate.status === AIV_PROMOTION_GATE_STATUS.SATISFIED);
  const invalidEvidenceCount = prerequisites.filter((gate) => gate.status === AIV_PROMOTION_GATE_STATUS.INVALID_EVIDENCE).length;
  const unsatisfiedCount = prerequisites.filter((gate) => gate.status === AIV_PROMOTION_GATE_STATUS.UNSATISFIED).length;
  return deepFreeze({
    schema: AIV_PROMOTION_READINESS_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    status: invalidEvidenceCount
      ? 'INVALID_EVIDENCE'
      : eligibleForAuthorityReview ? 'READY_FOR_INDEPENDENT_AUTHORITY_REVIEW' : 'PROMOTION_PREREQUISITES_INCOMPLETE',
    gates,
    counts: {
      prerequisiteGates: prerequisites.length,
      satisfied: prerequisites.filter((gate) => gate.status === AIV_PROMOTION_GATE_STATUS.SATISFIED).length,
      unsatisfied: unsatisfiedCount,
      invalidEvidence: invalidEvidenceCount,
    },
    eligibleForAuthorityReview,
    independentVibrationEngineerReviewRequired: true,
    authorityPromotionAuthorized: false,
    authority: {
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    notes: [
      'Promotion readiness consumes verification artifacts plus their SHA-256 identities; bare booleans are not accepted as evidence.',
      'READY_FOR_INDEPENDENT_AUTHORITY_REVIEW means prerequisite evidence is complete, not that equations, screening, or design authority are authorized.',
      'Independent vibration-engineer promotion review remains a separate final human authority gate.',
    ],
  });
}
