export const AIV_EI_ERRATA_EVIDENCE_SCHEMA = 'AivEiErrataEvidence.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const AIV_EI_OFFICIAL_ERRATA_SOURCE = deepFreeze({
  sourceId: 'AIV-SRC-EI-OFFICIAL-ERRATA',
  publisher: 'Energy Institute',
  publication: 'Guidelines for the avoidance of vibration induced fatigue failure in process pipework',
  edition: '2nd',
  errataLocator: 'Official sample pages, Errata 1, Pg 61: Feed in from Flowchart T2-5',
  affectedPages: [61, 68],
  aivRelevantPage: 61,
  sourceClass: 'OFFICIAL_PUBLISHER_ERRATA',
  verifiedDate: '2026-08-12',
  productionAuthority: false,
});

export const AIV_T2_6_ERRATA_FEED_EQUATION = deepFreeze({
  traceId: 'AIV-EQ-T2-6-FEED-ERRATA-001',
  sourceId: AIV_EI_OFFICIAL_ERRATA_SOURCE.sourceId,
  locator: AIV_EI_OFFICIAL_ERRATA_SOURCE.errataLocator,
  dependentVariable: 'log10N',
  independentVariable: 'B',
  expressionStructure: 'c0 + cLog10B*log10(B) + cInvSqrtB/sqrt(B) + cInvBPower/B^0.1',
  coefficients: {
    c0: 470711.5155,
    cLog10B: -63075.1242,
    cInvSqrtB: 183685.4368,
    cInvBPower: -575094.3273,
  },
  qualificationState: 'OFFICIAL_ERRATA_EQUATION_CAPTURED',
  implementationAuthorized: false,
  controlledCommonPdfParityRequired: true,
});

export const AIV_EI_ERRATA_EVIDENCE = deepFreeze({
  schema: AIV_EI_ERRATA_EVIDENCE_SCHEMA,
  source: AIV_EI_OFFICIAL_ERRATA_SOURCE,
  equations: [AIV_T2_6_ERRATA_FEED_EQUATION],
  notes: [
    'This is qualification evidence captured from the official publisher errata; it is not the production AIV kernel.',
    'Parity against the pinned Common main-guidance PDF remains required before numerical implementation authority changes.',
  ],
});
