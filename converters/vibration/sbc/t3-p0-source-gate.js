export const SBC_T3_P0_SOURCE = Object.freeze({
  repository: 'reallaksh19/Advanced_Analysis',
  commit: '6111ddbc0f27dd95b50a80c569a2c4daba3b3921',
  p0Path: 'docs/EI data/P0_SBC_Master_Data.md',
  p0BlobSha1: '5312c9e2cf86af9e940ba722fcbee64702aeccd3',
  examplesPath: 'docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md',
  examplesBlobSha1: 'c050cd90802c27241c510c6f0ac43bfaf7a89e9d',
});

export const SBC_T3_P0_AUTHORITY = Object.freeze({
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  masterDataAuthority: false,
});

const D7_CANDIDATE_THRESHOLDS = Object.freeze({
  'T3-1': Object.freeze({
    diameterIn: 1.5,
    base: Object.freeze({ spanM: 1.15, lof: 0.2 }),
    mid: Object.freeze({ spanM: 1.70, lof: 0.4 }),
    high: Object.freeze({ spanM: 2.90, lof: 0.6 }),
    above: 0.7,
  }),
  'T3-3': Object.freeze({
    diameterIn: 1.5,
    base: Object.freeze({ spanM: 0.85, lof: 0.2 }),
    mid: Object.freeze({ spanM: 1.30, lof: 0.4 }),
    high: Object.freeze({ spanM: 2.20, lof: 0.6 }),
    above: 0.7,
  }),
  'T3-4': Object.freeze({
    diameterIn: 1.5,
    base: Object.freeze({ spanM: 2.00, lof: 0.3 }),
    mid: Object.freeze({ spanM: 2.70, lof: 0.4 }),
    high: Object.freeze({ spanM: 4.10, lof: 0.6 }),
    above: 0.7,
  }),
});

export const SBC_T3_D7_ORACLES = Object.freeze([
  Object.freeze({
    id: 'D7-T3-1', figureId: 'T3-1', diameterIn: 1.5,
    spanM: 0.9 / 0.7, expectedLof: 0.2,
    basis: 'Worked Example D7 LOFGEOM(D)',
  }),
  Object.freeze({
    id: 'D7-T3-3', figureId: 'T3-3', diameterIn: 1.5,
    spanM: 2.3, expectedLof: 0.6,
    basis: 'Worked Example D7 LOFGEOM(F)',
  }),
  Object.freeze({
    id: 'D7-T3-4', figureId: 'T3-4', diameterIn: 1.5,
    spanM: 1.4, expectedLof: 0.2,
    basis: 'Worked Example D7 LOFGEOM(G)',
  }),
]);

function finiteNonNegative(value, name) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new TypeError(`${name} must be a finite non-negative number.`);
  }
  return numeric;
}

export function combineSbcLof(mainLineLof, multiplier, sbcModifier) {
  const main = finiteNonNegative(mainLineLof, 'mainLineLof');
  const factor = finiteNonNegative(multiplier, 'multiplier');
  const modifier = finiteNonNegative(sbcModifier, 'sbcModifier');
  return Math.min(main * factor, modifier);
}

export function evaluateSuppliedD7CurvePoint(figureId, diameterIn, spanM) {
  const curve = D7_CANDIDATE_THRESHOLDS[String(figureId)];
  if (!curve) throw new RangeError(`Unsupported supplied D7 curve ${figureId}.`);
  const diameter = finiteNonNegative(diameterIn, 'diameterIn');
  const span = finiteNonNegative(spanM, 'spanM');
  if (diameter !== curve.diameterIn) {
    throw new RangeError(`D7 source gate only qualifies ${curve.diameterIn} in for ${figureId}.`);
  }
  if (span <= curve.base.spanM) return curve.base.lof;
  if (span <= curve.mid.spanM) return curve.mid.lof;
  if (span <= curve.high.spanM) return curve.high.lof;
  return curve.above;
}

export function qualifySbcT3P0SuppliedCandidate() {
  const curveChecks = SBC_T3_D7_ORACLES.map((oracle) => {
    const actualLof = evaluateSuppliedD7CurvePoint(
      oracle.figureId, oracle.diameterIn, oracle.spanM,
    );
    return Object.freeze({
      ...oracle,
      actualLof,
      status: actualLof === oracle.expectedLof ? 'PASS' : 'FAIL',
    });
  });
  const failures = curveChecks.filter((check) => check.status === 'FAIL');
  return Object.freeze({
    schema: 'SbcT3P0SourceQualification.v1',
    source: SBC_T3_P0_SOURCE,
    tableParity: 'PASS_CROSS_REPO_CANDIDATE',
    finalCombinationRule: 'MIN_MAINLINE_ADJUSTED_AND_SBC_MODIFIER',
    narrativeProductFormula: 'REJECTED_CONFLICT_WITH_WORKED_EXAMPLES',
    curveQualification: failures.length ? 'FAIL' : 'PASS',
    curveChecks: Object.freeze(curveChecks),
    publicationState: failures.length ? 'BLOCKED_SOURCE_DATA_CONFLICT' : 'CANDIDATE_QUALIFIED',
    masterPublicationAuthorized: failures.length === 0,
    authority: SBC_T3_P0_AUTHORITY,
  });
}

export function assertSbcT3P0MasterPublicationQualified() {
  const qualification = qualifySbcT3P0SuppliedCandidate();
  if (!qualification.masterPublicationAuthorized) {
    const error = new Error('SBC T3 P0 supplied master candidate failed independent worked-example qualification.');
    error.code = 'SBC_T3_P0_MASTER_NOT_QUALIFIED';
    error.qualification = qualification;
    throw error;
  }
  return qualification;
}
