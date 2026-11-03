export const SBC_SOURCE_TRACE_STATUS = 'REFERENCE_ROWS_POPULATED_NOT_ENGINEERING_QUALIFIED';

export const SBC_SOURCE_IDENTITIES = Object.freeze({
  EI_GUIDELINES_CONTROLLED_PDF: Object.freeze({
    sourceId: 'SBC-SRC-001',
    repository: 'reallaksh19/Common',
    commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
    path: 'EI - AVIFF Guidelines 2nd Edition.pdf',
    blob: '9d3eccc56429411e17c07a579bdebbd13cb0bdc5',
    role: 'CONTROLLED_SOURCE_IDENTITY',
    qualificationStatus: 'IDENTITY_PINNED_ENGINEERING_QUALIFICATION_NOT_ESTABLISHED',
  }),
  EI_APPENDIX_D_STRUCTURED_TRANSCRIPTION: Object.freeze({
    sourceId: 'SBC-SRC-002',
    repository: 'reallaksh19/Advanced_Analysis',
    commit: '76eb4bd075ce2e8e2442d02b2798df7be491fb4b',
    path: 'docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md',
    blob: 'c050cd90802c27241c510c6f0ac43bfaf7a89e9d',
    role: 'STRUCTURED_TRANSCRIPTION_REFERENCE',
    qualificationStatus: 'REFERENCE_ONLY_NOT_ENGINEERING_AUTHORITY',
    alsoVerifiedAtCommit: '16d1e58f728e72b04b761c02dce682aa189779f2',
    sameBlobAtVerifiedCommit: true,
  }),
  EI_T3_STRUCTURED_TRANSCRIPTION: Object.freeze({
    sourceId: 'SBC-SRC-003',
    repository: 'reallaksh19/Advanced_Analysis',
    commit: '76eb4bd075ce2e8e2442d02b2798df7be491fb4b',
    path: 'docs/EI data/P0_SBC_Master_Data.md',
    blob: '5312c9e2cf86af9e940ba722fcbee64702aeccd3',
    role: 'STRUCTURED_T3_REFERENCE_WITH_KNOWN_CURVE_CONFLICT',
    qualificationStatus: 'REFERENCE_ONLY_CURVE_VALUES_QUARANTINED',
    alsoVerifiedAtCommit: '16d1e58f728e72b04b761c02dce682aa189779f2',
    sameBlobAtVerifiedCommit: true,
  }),
});

const TYPE_TRACE = Object.freeze({
  TYPE_1: Object.freeze({
    traceId: 'SBC-TYPE-001',
    exampleId: 'EI_APPENDIX_D5',
    sourceId: 'SBC-SRC-002',
    sourceLocator: 'Appendix D / D.5; transcription PDF pages 38-40',
    flowchartReference: 'T3-2',
    structuralLabel: 'CANTILEVER_SINGLE_PARENT',
    useAllowed: 'STRUCTURAL_CONFIRMATION_ONLY',
  }),
  TYPE_2: Object.freeze({
    traceId: 'SBC-TYPE-002',
    exampleId: 'EI_APPENDIX_D6',
    sourceId: 'SBC-SRC-002',
    sourceLocator: 'Appendix D / D.6; transcription PDF pages 41-43',
    flowchartReference: 'T3-4',
    structuralLabel: 'LOOP_BYPASS_SAME_MAIN_LINE',
    useAllowed: 'STRUCTURAL_CONFIRMATION_ONLY',
  }),
  TYPE_3: Object.freeze({
    traceId: 'SBC-TYPE-003',
    exampleId: 'EI_APPENDIX_D7',
    sourceId: 'SBC-SRC-002',
    sourceLocator: 'Appendix D / D.7; transcription PDF pages 44-47',
    flowchartReference: 'T3-5',
    structuralLabel: 'SUPPORTED_FIRST_AND_SUBSEQUENT_SPANS',
    useAllowed: 'STRUCTURAL_CONFIRMATION_ONLY',
  }),
  TYPE_4: Object.freeze({
    traceId: 'SBC-TYPE-004',
    exampleId: 'EI_APPENDIX_D8',
    sourceId: 'SBC-SRC-002',
    sourceLocator: 'Appendix D / D.8; transcription PDF pages 48-51',
    flowchartReference: 'T3-8',
    structuralLabel: 'BRIDGE_DISTINCT_PARENT_LINES',
    useAllowed: 'STRUCTURAL_CONFIRMATION_ONLY',
  }),
});

export const SBC_TYPE_TRACE_RECORDS = TYPE_TRACE;

export const SBC_APPLICABILITY_TRACE_RECORDS = Object.freeze({
  FIRST_SPAN_WITH_MASS: Object.freeze({
    traceId: 'SBC-APP-001',
    sourceId: 'SBC-SRC-003',
    sourceLocator: 'Figure T3-1; printed page 82 / PDF page 90',
    scope: 'FIRST_SPAN_WITH_UNSUPPORTED_MASS',
    useAllowed: 'APPLICABILITY_LABEL_ONLY',
    numericalCurveUseAllowed: false,
  }),
  FIRST_SPAN_WITHOUT_MASS: Object.freeze({
    traceId: 'SBC-APP-002',
    sourceId: 'SBC-SRC-003',
    sourceLocator: 'Figure T3-2; printed page 83 / PDF page 91',
    scope: 'FIRST_SPAN_WITHOUT_UNSUPPORTED_MASS',
    useAllowed: 'APPLICABILITY_LABEL_ONLY',
    numericalCurveUseAllowed: false,
  }),
  SUBSEQUENT_SPAN_WITH_MASS: Object.freeze({
    traceId: 'SBC-APP-003',
    sourceId: 'SBC-SRC-003',
    sourceLocator: 'Figure T3-3; printed page 83 / PDF page 91',
    scope: 'SUBSEQUENT_SPAN_WITH_UNSUPPORTED_MASS',
    useAllowed: 'APPLICABILITY_LABEL_ONLY',
    numericalCurveUseAllowed: false,
  }),
  SUBSEQUENT_SPAN_WITHOUT_MASS: Object.freeze({
    traceId: 'SBC-APP-004',
    sourceId: 'SBC-SRC-003',
    sourceLocator: 'Figure T3-4; printed page 84 / PDF page 92',
    scope: 'SUBSEQUENT_SPAN_WITHOUT_UNSUPPORTED_MASS',
    useAllowed: 'APPLICABILITY_LABEL_ONLY',
    numericalCurveUseAllowed: false,
  }),
  DECK_OR_STEELWORK_FIRST_SUPPORT: Object.freeze({
    traceId: 'SBC-APP-005',
    sourceId: 'SBC-SRC-003',
    sourceLocator: 'Table T3-2; printed page 81 / PDF page 89',
    scope: 'FIRST_SPAN_CONNECTED_TO_DECK_OR_STEELWORK',
    useAllowed: 'APPLICABILITY_LABEL_ONLY',
    numericalTableUseAllowed: false,
  }),
  BETWEEN_TWO_MAIN_LINES: Object.freeze({
    traceId: 'SBC-APP-006',
    sourceId: 'SBC-SRC-003',
    sourceLocator: 'Table T3-3; printed page 82 / PDF page 90',
    scope: 'SBC_CONNECTED_BETWEEN_TWO_MAIN_LINES',
    useAllowed: 'APPLICABILITY_LABEL_ONLY',
    numericalTableUseAllowed: false,
  }),
});

export function getSbcTypeTraceRecord(typeId) {
  return SBC_TYPE_TRACE_RECORDS[String(typeId ?? '').trim().toUpperCase()] ?? null;
}
