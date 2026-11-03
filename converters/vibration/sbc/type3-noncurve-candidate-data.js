export const SBC_T3_NONCURVE_CANDIDATE_SET_ID = 'EI_AVIFF.T3.SBC.NON_CURVE_MASTERS.v1';

export const SBC_T3_NONCURVE_CONTROLLED_SOURCE = Object.freeze({
  repository: 'reallaksh19/Common',
  commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
  path: 'EI - AVIFF Guidelines 2nd Edition.pdf',
  gitBlobSha1: '9d3eccc56429411e17c07a579bdebbd13cb0bdc5',
  sizeBytes: 10348594,
});

export const SBC_T3_WORKED_EXAMPLE_CONTROLLED_SOURCE = Object.freeze({
  repository: 'reallaksh19/Common',
  commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
  path: 'EI - AVIFF Guidelines 2nd Edition_Examples.pdf',
  gitBlobSha1: '3e2517d0df527a051084fc02e69cb7afa31f8d47',
  sourceLocator: 'Appendix D worked examples D5-D7',
});

export const SBC_T3_CANDIDATE_AUTHORITY = Object.freeze({
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  masterDataAuthority: false,
});

export const SBC_T3_CANDIDATE_GOVERNANCE = Object.freeze({
  publicationState: 'CANDIDATE',
  qualificationStatus: 'NOT_QUALIFIED',
  masterValuesPublished: false,
});

const NONCURVE_RECORD = 'ValidationRecords/VibrationMasters/ei-aviff-t3-sbc-non-curve-candidate-v1.json';
const COMBINATION_RECORD = 'ValidationRecords/VibrationMasters/advanced-analysis-sbc-p0-qualification-v1.json';

const row = (rowId, dimension, key, score) => Object.freeze({ rowId, dimension, key, score });

export const SBC_T3_GEOMETRY_SCORE_ROWS = Object.freeze([
  row('T3-GEO-001', 'FITTING_TYPE', 'SHORT_CONTOURED_BODY', 0.4),
  row('T3-GEO-002', 'FITTING_TYPE', 'CONTOURED_BODY', 0.6),
  row('T3-GEO-003', 'FITTING_TYPE', 'FORGED_REDUCING_TEE', 0.6),
  row('T3-GEO-004', 'FITTING_TYPE', 'WELDED_TEE', 0.6),
  row('T3-GEO-005', 'FITTING_TYPE', 'WELDOLET', 0.9),
  row('T3-GEO-006', 'FITTING_TYPE', 'THREADOLET_FULLY_BACK_WELDED', 0.9),
  row('T3-GEO-007', 'FITTING_TYPE', 'SCREWED_FULLY_BACK_WELDED', 0.9),
  row('T3-GEO-008', 'FITTING_TYPE', 'THREADOLET', 0.95),
  row('T3-GEO-009', 'FITTING_TYPE', 'SCREWED', 0.95),
  row('T3-GEO-010', 'FITTING_TYPE', 'SOCKOLET', 1.0),
  row('T3-GEO-011', 'FITTING_TYPE', 'THREADOLET_PARTIALLY_BACK_WELDED', 1.1),
  row('T3-GEO-012', 'FITTING_TYPE', 'SCREWED_PARTIALLY_BACK_WELDED', 1.1),
  row('T3-GEO-013', 'FITTING_TYPE', 'SET_ON', 1.3),
  row('T3-GEO-014', 'FITTING_TYPE', 'SET_IN', 1.3),
  row('T3-GEO-015', 'FITTING_TYPE', 'SET_THRU', 1.3),
  row('T3-GEO-016', 'BRANCH_LENGTH_MM', 'LE_200_MM', 0.1),
  row('T3-GEO-017', 'BRANCH_LENGTH_MM', 'GT_200_LE_400_MM', 0.3),
  row('T3-GEO-018', 'BRANCH_LENGTH_MM', 'GT_400_LE_600_MM', 0.7),
  row('T3-GEO-019', 'BRANCH_LENGTH_MM', 'GT_600_MM', 0.9),
  row('T3-GEO-020', 'VALVE_FLANGE_BELOW_ANSI_900', 'FLANGE_ONLY', 0.2),
  row('T3-GEO-021', 'VALVE_FLANGE_BELOW_ANSI_900', 'ONE_VALVE_OR_INTEGRAL_DBB', 0.5),
  row('T3-GEO-022', 'VALVE_FLANGE_BELOW_ANSI_900', 'TWO_OR_MORE_VALVES', 0.9),
  row('T3-GEO-023', 'VALVE_FLANGE_ANSI_900_OR_GREATER', 'FLANGE_ONLY', 0.5),
  row('T3-GEO-024', 'VALVE_FLANGE_ANSI_900_OR_GREATER', 'ONE_OR_MORE_VALVES', 0.9),
  row('T3-GEO-025', 'PARENT_PIPE_SCHEDULE', '10S', 0.9),
  row('T3-GEO-026', 'PARENT_PIPE_SCHEDULE', '20', 0.8),
  row('T3-GEO-027', 'PARENT_PIPE_SCHEDULE', '40', 0.7),
  row('T3-GEO-028', 'PARENT_PIPE_SCHEDULE', '80', 0.5),
  row('T3-GEO-029', 'PARENT_PIPE_SCHEDULE', '160', 0.3),
  row('T3-GEO-030', 'PARENT_PIPE_SCHEDULE', 'GT_160', 0.3),
  row('T3-GEO-031', 'SBC_MIN_DIAMETER_IN', '0.5', 0.9),
  row('T3-GEO-032', 'SBC_MIN_DIAMETER_IN', '0.75', 0.8),
  row('T3-GEO-033', 'SBC_MIN_DIAMETER_IN', '1', 0.7),
  row('T3-GEO-034', 'SBC_MIN_DIAMETER_IN', '1.5', 0.6),
  row('T3-GEO-035', 'SBC_MIN_DIAMETER_IN', '2', 0.5),
]);

export const SBC_T3_LOCATION_SCORE_ROWS = Object.freeze([
  row('T3-LOC-001', 'LOCATION', 'VALVE', 0.9),
  row('T3-LOC-002', 'LOCATION', 'REDUCER', 0.9),
  row('T3-LOC-003', 'LOCATION', 'BEND', 0.9),
  row('T3-LOC-004', 'LOCATION', 'TEE', 0.9),
  row('T3-LOC-005', 'LOCATION', 'MID_SPAN', 0.7),
  row('T3-LOC-006', 'LOCATION', 'PARTIALLY_FIXED_SUPPORT', 0.6),
  row('T3-LOC-007', 'LOCATION', 'FIXED_SUPPORT', 0.1),
  row('T3-LOC-008', 'PARENT_PIPE_SCHEDULE', '10S', 0.9),
  row('T3-LOC-009', 'PARENT_PIPE_SCHEDULE', '20', 0.8),
  row('T3-LOC-010', 'PARENT_PIPE_SCHEDULE', '40', 0.7),
  row('T3-LOC-011', 'PARENT_PIPE_SCHEDULE', '80', 0.5),
  row('T3-LOC-012', 'PARENT_PIPE_SCHEDULE', '160', 0.3),
  row('T3-LOC-013', 'PARENT_PIPE_SCHEDULE', 'GT_160', 0.3),
]);

export const SBC_T3_NONCURVE_RULES = Object.freeze({
  geometryAggregation: 'ARITHMETIC_MEAN_OF_FIVE_SCORES',
  span: Object.freeze({ belowMinimumLof: 0.7, atOrAboveMinimumLof: 0.2 }),
  location: Object.freeze({
    unknownMainlineLofForAssessment: 1.0,
    lofWhenMainlineUnknown: 1.0,
    lofWhenMainlineAtLeast1: 1.0,
  }),
  mainlineMultiplier: 1.42,
});

function evidencePathFor(kind) {
  return kind === 'MAINLINE_MULTIPLIER' ? COMBINATION_RECORD : NONCURVE_RECORD;
}

function controlledSourceFor(kind) {
  return kind === 'MAINLINE_MULTIPLIER'
    ? SBC_T3_WORKED_EXAMPLE_CONTROLLED_SOURCE : SBC_T3_NONCURVE_CONTROLLED_SOURCE;
}

export function resolveSbcT3CandidateScore(kind, dimension, key) {
  const rows = kind === 'GEOMETRY' ? SBC_T3_GEOMETRY_SCORE_ROWS : SBC_T3_LOCATION_SCORE_ROWS;
  if (!['GEOMETRY', 'LOCATION'].includes(kind)) throw new TypeError('SBC_T3_SCORE_KIND_INVALID');
  const normalizedKey = String(key ?? '').trim().toUpperCase();
  const found = rows.find((item) => item.dimension === dimension && item.key === normalizedKey);
  if (!found) throw new Error('SBC_T3_CANDIDATE_SCORE_GRID_MISS');
  return Object.freeze({
    schema: 'SbcT3CandidateScoreResolution.v1',
    status: 'CANDIDATE_ONLY',
    row: found,
    candidateSetId: SBC_T3_NONCURVE_CANDIDATE_SET_ID,
    evidencePath: NONCURVE_RECORD,
    controlledSource: SBC_T3_NONCURVE_CONTROLLED_SOURCE,
    governance: SBC_T3_CANDIDATE_GOVERNANCE,
    authority: SBC_T3_CANDIDATE_AUTHORITY,
  });
}

export function resolveSbcT3CandidateRule(ruleId) {
  const values = {
    SPAN: SBC_T3_NONCURVE_RULES.span,
    LOCATION: SBC_T3_NONCURVE_RULES.location,
    MAINLINE_MULTIPLIER: SBC_T3_NONCURVE_RULES.mainlineMultiplier,
  };
  if (!(ruleId in values)) throw new Error('SBC_T3_CANDIDATE_RULE_UNKNOWN');
  return Object.freeze({
    schema: 'SbcT3CandidateRuleResolution.v1',
    status: 'CANDIDATE_ONLY', ruleId, value: values[ruleId],
    candidateSetId: SBC_T3_NONCURVE_CANDIDATE_SET_ID,
    evidencePath: evidencePathFor(ruleId),
    controlledSource: controlledSourceFor(ruleId),
    governance: SBC_T3_CANDIDATE_GOVERNANCE,
    authority: SBC_T3_CANDIDATE_AUTHORITY,
  });
}
