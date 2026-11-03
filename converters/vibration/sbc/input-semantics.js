export const SBC_INPUT_SEMANTIC_TRACE_STATUS = 'REFERENCE_SEMANTICS_POPULATED_PDF_REVIEW_PENDING';

const reference = (traceId, fieldPath, sourceLocator, semantic, nativeUnit = null) => Object.freeze({
  traceId,
  fieldPath,
  sourceId: 'SBC-SRC-002',
  sourceLocator,
  semantic,
  nativeUnit,
  useAllowed: 'INPUT_SEMANTIC_REFERENCE_ONLY',
  engineeringQualificationEstablished: false,
  numericalMethodUseAllowed: false,
  engineeringDefaultAllowed: false,
});

export const SBC_INPUT_SEMANTIC_TRACE_RECORDS = Object.freeze({
  MINIMUM_NOMINAL_DIAMETER: reference(
    'SBC-UNIT-001',
    'geometry.minimumNominalDiameter',
    'Appendix D D5-D8; P0 T3 tables/figures use nominal diameter in inches',
    'Minimum SBC nominal bore/diameter stated for the assessed connection.',
    'in_NB',
  ),
  OVERALL_BRANCH_LENGTH: reference(
    'SBC-UNIT-002',
    'geometry.overallBranchLength',
    'Appendix D D5; transcription PDF page 39',
    'True branch length from the parent-pipe wall to the end of the valve; D5 includes lagging depth in this length.',
    'mm',
  ),
  BRANCH_LEGS: reference(
    'SBC-UNIT-003',
    'geometry.branchLegs',
    'Appendix D D6; transcription PDF page 42',
    'Separate branch-leg lengths for the two same-main-line connections; do not collapse the two legs into one hidden value.',
    'mm',
  ),
  FIRST_SPAN: reference(
    'SBC-UNIT-004',
    'geometry.firstSpan',
    'Appendix D D7; transcription PDF page 44',
    'Span from the parent connection to the first resting support.',
    'mm',
  ),
  SUBSEQUENT_SPANS: reference(
    'SBC-UNIT-005',
    'geometry.subsequentSpans',
    'Appendix D D7; transcription PDF pages 44-47',
    'Subsequent supported span evidence is retained distinctly from the first span, including mass/no-mass span context.',
    'mm',
  ),
  END_LEGS: reference(
    'SBC-UNIT-006',
    'geometry.endLegs',
    'Appendix D D8; transcription PDF pages 49-50',
    'Separate end-leg lengths at the two parent-pipe connections.',
    'mm',
  ),
  BRIDGE_SPAN: reference(
    'SBC-UNIT-007',
    'geometry.bridgeSpan',
    'Appendix D D8; transcription PDF page 50',
    'Overall span between the two parent-side legs; D8 demonstrates summing its two example end-leg lengths, but no general derivation rule is frozen here.',
    'mm',
  ),
  FITTINGS: reference(
    'SBC-UNIT-008',
    'attachments.fittings',
    'Appendix D D5-D8; P0 Table T3-1 reference',
    'Fitting type/configuration is explicit categorical engineering evidence; no fitting factor is supplied by this trace.',
    null,
  ),
  VALVES: reference(
    'SBC-UNIT-009',
    'attachments.valves',
    'Appendix D D5-D8',
    'Valve evidence retains count and, where known, rating/category; no omitted valve or rating may be silently defaulted.',
    null,
  ),
  LOCATION_CONTEXT: reference(
    'SBC-UNIT-010',
    'locationContext',
    'Appendix D D5-D8; Type-3 location logic referenced by P0 Flowchart T3-9 synthesis',
    'Parent-line location/support context is project evidence and remains separate from any unqualified location score.',
    null,
  ),
  FIRST_SPAN_SUPPORT: reference(
    'SBC-UNIT-011',
    'supportTopology.firstSpanSupport',
    'Appendix D D7; transcription PDF page 44',
    'First resting support identity/location is explicit evidence for the first-span boundary.',
    null,
  ),
  RETURNS_TO_SAME_MAIN_LINE: reference(
    'SBC-UNIT-012',
    'topology.returnsToSameMainLine',
    'Appendix D D6; transcription PDF page 41',
    'Type-2 example explicitly exits and re-enters the same main line; this is confirmation evidence, not an automatic classifier.',
    null,
  ),
  BRIDGES_DISTINCT_MAIN_LINES: reference(
    'SBC-UNIT-013',
    'topology.bridgesDistinctMainLines',
    'Appendix D D8; transcription PDF page 48',
    'Type-4 example spans between two separate parent pipes; this is confirmation evidence, not an automatic classifier.',
    null,
  ),
});

export function getSbcInputSemanticTrace(fieldPath) {
  return Object.values(SBC_INPUT_SEMANTIC_TRACE_RECORDS)
    .find((record) => record.fieldPath === fieldPath) ?? null;
}
