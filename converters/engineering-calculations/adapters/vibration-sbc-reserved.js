import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import { calculateReservedSbc } from '../../vibration/sbc/reserved-kernel.js';
import {
  SBC_MAIN_LINE_INPUT_REQUIREMENT,
  SBC_PUBLIC_CALCULATION_ID,
  SBC_TYPE_IDS,
  SBC_TYPE_IMPLEMENTATION_SLOTS,
  SBC_VERTICAL_ISSUES,
  SBC_VERTICAL_LIFECYCLE,
  SBC_VERTICAL_MANIFEST_VERSION,
} from '../../vibration/sbc/vertical-manifest.js';

function reservedQualification() {
  return composeEngineeringQualification({
    method: 'BLOCKED',
    data: 'DRAFT',
    designAuthority: false,
    reasons: [
      'SBC_LIFECYCLE_RESERVED',
      `SCAFFOLD_ISSUE_${SBC_VERTICAL_ISSUES.scaffold}_OPEN`,
      'TYPE_1_TO_4_QUALIFICATION_REQUIRED',
    ],
  });
}

function calculate(input = {}) {
  const reserved = calculateReservedSbc(input);
  return Object.freeze({
    ok: false,
    errors: Object.freeze([createEngineeringCalculationError(
      'ENGINEERING_METHOD_BLOCKED',
      `${SBC_PUBLIC_CALCULATION_ID} is RESERVED; numerical execution is blocked until the qualified Type 1–4 vertical is promoted explicitly.`,
      {
        lifecycleState: SBC_VERTICAL_LIFECYCLE.state,
        qualificationIssue: SBC_VERTICAL_ISSUES.scaffold,
        familyIssue: SBC_VERTICAL_ISSUES.family,
        type3EvidenceIssue: SBC_VERTICAL_ISSUES.type3Evidence,
        requestedType: reserved.sbcType ?? input.sbcType ?? null,
        nextImplementationSeam: reserved.nextImplementationSeam ?? null,
      },
    )]),
    qualification: reservedQualification(),
    applicability: Object.freeze({
      applicable: false,
      limitations: Object.freeze([
        'SBC numerical execution is not authorized while lifecycle=RESERVED.',
        'SBC requires a qualified EI main-line assessment; FIT-only authority is insufficient.',
        'Type 1, 2, 3, and 4 must be qualified as explicit branches before complete SBC activation.',
      ]),
    }),
    provenance: Object.freeze({
      scaffoldIssue: SBC_VERTICAL_ISSUES.scaffold,
      manifestVersion: SBC_VERTICAL_MANIFEST_VERSION,
    }),
    evidence: Object.freeze({ reservedScaffold: reserved }),
    warnings: Object.freeze([Object.freeze({
      code: 'RESERVED_PLACEHOLDER_NOT_ENGINEERING_AUTHORITY',
      message: 'This API/UI slot is a fill-in-the-blanks implementation scaffold, not an engineering result.',
    })]),
  });
}

export const VIBRATION_SBC_RESERVED_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: SBC_PUBLIC_CALCULATION_ID,
  family: 'VIB',
  name: 'Small-Bore Connection Vibration Screening',
  shortName: 'Small-Bore Connection Vibration',
  methodRevision: 'reserved-sbc-type1-4-scaffold-v1',
  purpose: 'Reserve the SBC API/UI vertical and expose Type 1–4 implementation requirements without authorizing numerical execution.',
  authority: Object.freeze({
    calculationState: 'BLOCKED',
    qualificationState: 'BLOCKED',
    codeCompliance: false,
  }),
  lifecycle: SBC_VERTICAL_LIFECYCLE,
  applicability: Object.freeze({
    description: 'SBC connection assessment slot reserved pending qualified EI Type 1–4 implementation.',
    limitations: Object.freeze([
      'No numerical SBC engineering kernel is registered for public execution.',
      `Implementation scaffold: issue #${SBC_VERTICAL_ISSUES.scaffold}; family qualification gate: issue #${SBC_VERTICAL_ISSUES.family}.`,
      `Type-3 evidence/source work remains separately governed by issue #${SBC_VERTICAL_ISSUES.type3Evidence}.`,
      'Type-3 candidate/source-reconciliation code remains non-authoritative evidence.',
    ]),
  }),
  inputs: Object.freeze([
    Object.freeze({ key: 'sbcType', label: 'SBC type', type: 'enum', values: SBC_TYPE_IDS }),
    Object.freeze({ key: 'connectionId', label: 'SBC connection ID', type: 'string' }),
  ]),
  outputs: Object.freeze([]),
  qualificationIssue: SBC_VERTICAL_ISSUES.scaffold,
  ui: Object.freeze({
    visible: true,
    executionModes: Object.freeze([]),
    minimumQualificationToShow: 'IMPLEMENTED',
    lifecycleState: SBC_VERTICAL_LIFECYCLE.state,
    blockedReason: `RESERVED — implement/qualify via issue #${SBC_VERTICAL_ISSUES.scaffold}; family gate #${SBC_VERTICAL_ISSUES.family}.`,
    implementationIssue: SBC_VERTICAL_ISSUES.scaffold,
    type3EvidenceIssue: SBC_VERTICAL_ISSUES.type3Evidence,
    typeSlots: SBC_TYPE_IMPLEMENTATION_SLOTS,
    mainLineInputRequirement: SBC_MAIN_LINE_INPUT_REQUIREMENT,
  }),
  calculate,
});
