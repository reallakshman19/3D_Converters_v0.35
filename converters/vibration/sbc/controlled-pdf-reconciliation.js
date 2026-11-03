export const SBC_CONTROLLED_PDF_RECONCILIATION_STATUS =
  'BLOCKED_PDF_PAGE_REVIEW_NOT_RUN_ENVIRONMENT';

const structuredReference = (path, blob, role) => Object.freeze({
  repository: 'reallaksh19/Advanced_Analysis',
  commit: '16d1e58f728e72b04b761c02dce682aa189779f2',
  path,
  blob,
  role,
  independentEngineeringSource: false,
});

export const SBC_CONTROLLED_PDF_RECONCILIATION = Object.freeze({
  schema: 'SbcControlledPdfReconciliation.v1',
  calculationId: 'VIB.SBC.SMALL_BORE',
  status: SBC_CONTROLLED_PDF_RECONCILIATION_STATUS,
  controlledPdf: Object.freeze({
    repository: 'reallaksh19/Common',
    commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
    path: 'EI - AVIFF Guidelines 2nd Edition.pdf',
    blob: '9d3eccc56429411e17c07a579bdebbd13cb0bdc5',
    identityVerified: true,
  }),
  controlledPdfPageReview: Object.freeze({
    status: 'NOT_RUN_ENVIRONMENT_BLOCKED',
    binaryContentAvailableToReviewer: false,
    screenshotReviewPerformed: false,
    governingRulesReconciled: false,
  }),
  structuredReferences: Object.freeze([
    structuredReference(
      'docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md',
      'c050cd90802c27241c510c6f0ac43bfaf7a89e9d',
      'APPENDIX_D_WORKED_EXAMPLE_TRANSCRIPTION',
    ),
    structuredReference(
      'docs/EI data/P0_SBC_Master_Data.md',
      '5312c9e2cf86af9e940ba722fcbee64702aeccd3',
      'T3_REFERENCE_TRANSCRIPTION_WITH_CURVE_QUARANTINE',
    ),
    structuredReference(
      'docs/EI data/EI_AVIFF_Complete_Master_Register.md',
      '51bca43473be8018d4ce48fb440ee4d7bd0abc82',
      'COMPILED_REFERENCE_REGISTER_NOT_INDEPENDENT_SOURCE',
    ),
    structuredReference(
      'docs/EI data/woodEI.md',
      '24ecf4cba407effad5bd2a5cc39db592fe7c67fe',
      'WORKED_REPORT_OUTPUT_REFERENCE_NOT_GOVERNING_SOURCE',
    ),
  ]),
  typeSelection: Object.freeze({
    governingArtifact: 'FLOWCHART_T3_1',
    governingArtifactTranscriptionLocated: false,
    controlledPdfReconciled: false,
    completeFourWayRuleStatus: 'NOT_ESTABLISHED',
    automaticClassificationAllowed: false,
  }),
  numericalUnitConversionPolicy: Object.freeze({
    status: 'NOT_FROZEN',
    acceptedRuntimeUnitsFrozen: false,
    conversionConstantsFrozen: false,
    normalizationExecutionAllowed: false,
  }),
  independentEngineeringReview: Object.freeze({
    status: 'NOT_ESTABLISHED',
    controlledPdfReviewRequired: true,
    independentReviewerRequired: true,
  }),
  authority: Object.freeze({
    engineeringQualificationEstablished: false,
    numericalExecutionAllowed: false,
    benchmarkExecutionAllowed: false,
    lifecyclePromotionAllowed: false,
  }),
  blockers: Object.freeze([
    'SBC_CONTROLLED_PDF_PAGE_REVIEW_NOT_RUN',
    'SBC_FLOWCHART_T3_1_TYPE_SELECTION_NOT_RECONCILED',
    'SBC_NUMERICAL_UNIT_CONVERSION_POLICY_NOT_FROZEN',
    'SBC_INDEPENDENT_ENGINEERING_REVIEW_NOT_ESTABLISHED',
  ]),
});

export function getSbcControlledPdfReconciliation() {
  return SBC_CONTROLLED_PDF_RECONCILIATION;
}
