export const FIT_SOURCE_BASIS_EVIDENCE_SCHEMA = 'FitSourceBasisEvidence.v1';

export const FIT_SOURCE_BASIS_EVIDENCE = Object.freeze({
  schema: FIT_SOURCE_BASIS_EVIDENCE_SCHEMA,
  calculationId: 'VIB.FIV.FLOW_TURBULENCE',
  method: Object.freeze({
    publisher: 'Energy Institute',
    publication: 'Guidelines for the avoidance of vibration induced fatigue failure in process pipework',
    edition: '2nd Edition, January 2008',
    isbn: '9780852934630',
    technicalModule: 'T2.2 Flow Induced Turbulence',
    productMethodBasis: 'ADOPTED_EI_T2_2_REFERENCE',
  }),
  officialErrata: Object.freeze({
    status: 'REVIEWED_NOT_APPLICABLE_TO_FIT_T2_2',
    publisherStatement: 'Official errata affect pages 61 and 68 and are incorporated into the current EI PDF.',
    corrections: Object.freeze([
      Object.freeze({ page: 61, flowchart: 'T2-5', disposition: 'AIV_FEED_CORRECTION_NOT_FIT_T2_2' }),
      Object.freeze({ page: 68, flowchart: 'T2-8', disposition: 'VALVE_TRANSIENT_PEAK_FORCE_CORRECTION_NOT_FIT_T2_2' }),
    ]),
  }),
  benchmarkBasis: Object.freeze({
    publishedVectorAuthority: 'EI_WORKED_EXAMPLE_PDF',
    ownerQualificationAnchor: 'CONTROLLED_WORKED_EXAMPLE_DOCX',
    ownerQualificationPolicy: 'WORKED_EXAMPLE_BENCHMARK_SUFFICIENT',
    qualificationExample: 'EI-D4-FIT-PRODUCED-WATER-10IN',
    docxRole: 'REVISED_PROJECT_SCENARIO_EVIDENCE',
    retainedWorkbookRole: 'MIGRATION_PARITY_EVIDENCE_ONLY',
  }),
  projectBasis: Object.freeze({
    productReferenceMethod: 'CONFIRMED',
    externalProjectOrClientAdoption: 'PROJECT_SPECIFIC_CONFIRMATION_REQUIRED',
    note: 'Using the product FIT reference method does not itself prove a client or project procedure has adopted it.',
  }),
  authority: Object.freeze({
    qualificationState: 'SCREENING',
    engineeringAuthority: 'SCREENING',
    screeningAuthority: 'AUTHORIZED_BOUNDED',
    designAuthority: false,
    fullMultiMechanismScreeningAuthority: false,
  }),
});
