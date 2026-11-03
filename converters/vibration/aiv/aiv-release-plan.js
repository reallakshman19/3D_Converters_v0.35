export const AIV_RELEASE_PLAN_SCHEMA = 'AivReleasePlan.v2';
export const AIV_RELEASE_PHASES = Object.freeze(['BLOCKED', 'BENCHMARK_ONLY', 'SCREENING']);
export const AIV_RELEASE_GATE_STATUS = Object.freeze({
  SATISFIED: 'SATISFIED',
  PENDING: 'PENDING',
  INVALID_EVIDENCE: 'INVALID_EVIDENCE',
  BLOCKED_BY_PREVIOUS_PHASE: 'BLOCKED_BY_PREVIOUS_PHASE',
});

export const AIV_BLOCKED_AUTHORITY = Object.freeze({
  calculationState: 'BLOCKED',
  qualificationState: 'BLOCKED',
  engineeringAuthority: 'NONE',
  productionEquationAuthorized: false,
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

const BENCHMARK_GATES = Object.freeze([
  Object.freeze({ gateId: 'QUALIFICATION_MACHINE_PARITY', evidenceKey: 'qualificationParityManifest', schema: 'AivQualificationParityManifest.v1' }),
  Object.freeze({ gateId: 'ASSUMPTION_PROFILE_VALIDATION', evidenceKey: 'assumptionProfileValidation', schema: 'AivAssumptionProfileValidation.v1' }),
  Object.freeze({ gateId: 'BENCHMARK_KERNEL_QUALIFICATION', evidenceKey: 'benchmarkKernelQualification', schema: 'AivBenchmarkKernelQualification.v2' }),
  Object.freeze({ gateId: 'EXACT_HEAD_RELEASE_VALIDATION', evidenceKey: 'releaseValidation', schema: 'AivReleaseValidationReceipt.v1' }),
]);

const SCREENING_GATES = Object.freeze([
  Object.freeze({ gateId: 'PRODUCT_KERNEL_QUALIFICATION', evidenceKey: 'productKernelQualification', schema: 'AivProductKernelQualificationReceipt.v1' }),
  Object.freeze({ gateId: 'REAL_PATH_D23_PARITY', evidenceKey: 'productPathParity', schema: 'AivProductPathBenchmarkParityReceipt.v1' }),
  Object.freeze({ gateId: 'LINE_CASE_AGGREGATION_QUALIFICATION', evidenceKey: 'lineAggregationQualification', schema: 'AivLineAggregationQualificationReceipt.v1' }),
  Object.freeze({ gateId: 'SINGLE_BATCH_PARITY', evidenceKey: 'singleBatchParity', schema: 'AivSingleBatchParityReceipt.v1' }),
  Object.freeze({ gateId: 'SCREENING_DOMAIN_COVERAGE', evidenceKey: 'screeningDomainCoverage', schema: 'AivScreeningDomainCoverageReceipt.v1' }),
  Object.freeze({ gateId: 'ASSUMPTION_POLICY_VALIDATION', evidenceKey: 'assumptionProfileValidation', schema: 'AivAssumptionProfileValidation.v1' }),
  Object.freeze({ gateId: 'EXACT_HEAD_SCREENING_RELEASE_VALIDATION', evidenceKey: 'screeningReleaseValidation', schema: 'AivReleaseValidationReceipt.v1' }),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function evidenceArtifact(input) {
  if (!input) return null;
  if (input.verification && typeof input.verification === 'object') {
    return {
      document: input.verification,
      artifactSha256: input.artifactSha256 ?? null,
    };
  }
  return {
    document: input,
    artifactSha256: input.artifactSha256 ?? null,
  };
}

function assumptionValidationValid(doc) {
  return doc?.schema === 'AivAssumptionProfileValidation.v1'
    && doc.methodId === 'VIB.AIV.ACOUSTIC'
    && doc.status === 'PASS'
    && doc.valid === true
    && doc.humanEvidenceRequired === false
    && doc.assumptionsVisibleAndEditableRequired === true
    && doc.designAuthority === false;
}

function benchmarkEvidenceValid(gate, artifact) {
  const doc = artifact?.document;
  if (doc?.schema !== gate.schema || !sha256Value(artifact?.artifactSha256)) return false;
  if (gate.gateId === 'QUALIFICATION_MACHINE_PARITY') {
    return doc.status === 'MACHINE_PARITY_PASS'
      && doc.productionEquationAuthorized === false
      && doc.screeningAuthority === 'NOT_AUTHORIZED'
      && doc.designAuthority === false;
  }
  if (gate.gateId === 'ASSUMPTION_PROFILE_VALIDATION') {
    return assumptionValidationValid(doc);
  }
  if (gate.gateId === 'BENCHMARK_KERNEL_QUALIFICATION') {
    return doc.methodId === 'VIB.AIV.ACOUSTIC'
      && doc.releaseTarget === 'BENCHMARK_ONLY'
      && doc.status === 'PASS'
      && doc.releaseGateSatisfied === true
      && doc.humanEvidenceRequired === false
      && doc.counts?.totalStages === 10
      && doc.counts?.productPathQualifiedStages === 10
      && doc.authority?.authorityTransitionApplied === false
      && doc.authority?.productionEquationAuthorized === false
      && doc.authority?.screeningAuthority === 'NOT_AUTHORIZED'
      && doc.authority?.designAuthority === false;
  }
  if (gate.gateId === 'EXACT_HEAD_RELEASE_VALIDATION') {
    return doc.methodId === 'VIB.AIV.ACOUSTIC'
      && doc.releaseTarget === 'BENCHMARK_ONLY'
      && doc.status === 'PASS'
      && doc.exactHeadValidated === true;
  }
  return false;
}

function screeningEvidenceValid(gate, artifact) {
  const doc = artifact?.document;
  if (doc?.schema !== gate.schema || !sha256Value(artifact?.artifactSha256)) return false;
  if (gate.gateId === 'ASSUMPTION_POLICY_VALIDATION') return assumptionValidationValid(doc);
  if (gate.gateId === 'EXACT_HEAD_SCREENING_RELEASE_VALIDATION') {
    return doc.methodId === 'VIB.AIV.ACOUSTIC'
      && doc.releaseTarget === 'SCREENING'
      && doc.status === 'PASS'
      && doc.exactHeadValidated === true;
  }
  return doc.methodId === 'VIB.AIV.ACOUSTIC'
    && doc.status === 'PASS'
    && doc.designAuthority !== true;
}

function releaseGate(definition, evidence, validator, blockedByPreviousPhase = false) {
  if (blockedByPreviousPhase) {
    return {
      ...definition,
      status: AIV_RELEASE_GATE_STATUS.BLOCKED_BY_PREVIOUS_PHASE,
      artifactSha256: null,
      observedSchema: null,
    };
  }
  const artifact = evidenceArtifact(evidence?.[definition.evidenceKey]);
  if (!artifact) {
    return {
      ...definition,
      status: AIV_RELEASE_GATE_STATUS.PENDING,
      artifactSha256: null,
      observedSchema: null,
    };
  }
  const valid = validator(definition, artifact);
  return {
    ...definition,
    status: valid ? AIV_RELEASE_GATE_STATUS.SATISFIED : AIV_RELEASE_GATE_STATUS.INVALID_EVIDENCE,
    artifactSha256: artifact.artifactSha256 ?? null,
    observedSchema: artifact.document?.schema ?? null,
  };
}

function phaseStatus(gates, blockedByPreviousPhase = false) {
  if (blockedByPreviousPhase) return 'BLOCKED_BY_PREVIOUS_PHASE';
  if (gates.some((gate) => gate.status === AIV_RELEASE_GATE_STATUS.INVALID_EVIDENCE)) return 'INVALID_EVIDENCE';
  if (gates.every((gate) => gate.status === AIV_RELEASE_GATE_STATUS.SATISFIED)) return 'ELIGIBLE_FOR_AUTHORITY_TRANSITION';
  return 'NOT_READY';
}

function countStatuses(gates) {
  const counts = {
    total: gates.length,
    satisfied: 0,
    pending: 0,
    invalidEvidence: 0,
    blockedByPreviousPhase: 0,
  };
  for (const gate of gates) {
    if (gate.status === AIV_RELEASE_GATE_STATUS.SATISFIED) counts.satisfied += 1;
    else if (gate.status === AIV_RELEASE_GATE_STATUS.PENDING) counts.pending += 1;
    else if (gate.status === AIV_RELEASE_GATE_STATUS.INVALID_EVIDENCE) counts.invalidEvidence += 1;
    else if (gate.status === AIV_RELEASE_GATE_STATUS.BLOCKED_BY_PREVIOUS_PHASE) counts.blockedByPreviousPhase += 1;
  }
  return counts;
}

function normalizeCurrentPhase(value) {
  const phase = String(value ?? 'BLOCKED').trim().toUpperCase();
  if (!AIV_RELEASE_PHASES.includes(phase)) throw new RangeError(`Unsupported AIV release phase: ${value}`);
  return phase;
}

export function buildAivReleasePlan({
  currentPhase = 'BLOCKED',
  evidence = {},
} = {}) {
  const phase = normalizeCurrentPhase(currentPhase);
  const benchmarkGates = BENCHMARK_GATES.map((gate) => releaseGate(
    gate,
    evidence,
    benchmarkEvidenceValid,
    phase === 'SCREENING',
  ));
  const benchmarkStatus = phase === 'BENCHMARK_ONLY' || phase === 'SCREENING'
    ? 'RELEASED'
    : phaseStatus(benchmarkGates);

  const screeningBlocked = phase === 'BLOCKED';
  const screeningGates = SCREENING_GATES.map((gate) => releaseGate(
    gate,
    evidence,
    screeningEvidenceValid,
    screeningBlocked,
  ));
  const screeningStatus = phase === 'SCREENING'
    ? 'RELEASED'
    : phaseStatus(screeningGates, screeningBlocked);

  const nextTarget = phase === 'BLOCKED'
    ? 'BENCHMARK_ONLY'
    : phase === 'BENCHMARK_ONLY' ? 'SCREENING' : null;
  const nextPhase = nextTarget === 'BENCHMARK_ONLY'
    ? { target: nextTarget, status: benchmarkStatus, gates: benchmarkGates }
    : nextTarget === 'SCREENING'
      ? { target: nextTarget, status: screeningStatus, gates: screeningGates }
      : null;

  return deepFreeze({
    schema: AIV_RELEASE_PLAN_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    currentPhase: phase,
    nextTarget,
    releasePolicy: {
      allowedTransitions: [
        ['BLOCKED', 'BENCHMARK_ONLY'],
        ['BENCHMARK_ONLY', 'SCREENING'],
      ],
      directBlockedToScreeningForbidden: true,
      humanEvidenceRequired: false,
      missingEngineeringDataPolicy: 'ASSUME_FROM_VISIBLE_USER_CONFIGURABLE_PROFILE',
      authorityTransitionMustBeSeparateCodeChange: true,
      designAuthorityTarget: false,
      projectApprovedTarget: false,
      verifiedTarget: false,
      productionAuthorizedTarget: false,
    },
    benchmarkOnly: {
      targetAuthority: {
        calculationState: 'IMPLEMENTED',
        qualificationState: 'BENCHMARK_ONLY',
        engineeringAuthority: 'REFERENCE_ONLY',
        productionEquationAuthorized: true,
        screeningAuthority: 'NOT_AUTHORIZED',
        designAuthority: false,
      },
      executionBoundary: 'CONTROLLED_BENCHMARK_EXECUTION_ONLY',
      status: benchmarkStatus,
      eligibleForTransition: phase === 'BLOCKED'
        && benchmarkStatus === 'ELIGIBLE_FOR_AUTHORITY_TRANSITION',
      counts: countStatuses(benchmarkGates),
      gates: benchmarkGates,
    },
    screening: {
      targetAuthority: {
        calculationState: 'IMPLEMENTED',
        qualificationState: 'SCREENING',
        engineeringAuthority: 'SCREENING',
        productionEquationAuthorized: true,
        screeningAuthority: 'AUTHORIZED_WITHIN_APPLICABILITY',
        designAuthority: false,
      },
      executionBoundary: 'SCREENING_WITHIN_QUALIFIED_APPLICABILITY_ONLY',
      status: screeningStatus,
      eligibleForTransition: phase === 'BENCHMARK_ONLY'
        && screeningStatus === 'ELIGIBLE_FOR_AUTHORITY_TRANSITION',
      counts: countStatuses(screeningGates),
      gates: screeningGates,
    },
    nextPhase,
    currentAuthority: phase === 'BLOCKED' ? AIV_BLOCKED_AUTHORITY : null,
    authorityTransitionApplied: false,
    notes: [
      'Human evidence is never a release prerequisite.',
      'Missing engineering values are supplied by an explicit user-configurable assumption profile and must remain visible/exported.',
      'BENCHMARK_ONLY still requires complete 10-stage product-path parity plus exact-head execution evidence.',
      'SCREENING is a later machine-qualification phase; AIV design authority remains out of scope.',
    ],
  });
}
