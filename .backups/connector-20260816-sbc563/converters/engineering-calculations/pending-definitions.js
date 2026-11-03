import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from './contracts.js';
import { composeEngineeringQualification } from './qualification.js';

const PENDING = Object.freeze([
  ['PIPE.EXTERNAL_PRESSURE.CHECK', 'PIPE', 'External Pressure Check', 428],
  ['PIPE.BRANCH.REINFORCEMENT', 'PIPE', 'Branch Reinforcement Assessment', 428],
  ['PIPE.SHELL_INDENTATION', 'PIPE', 'Pipe Shell / Local Loading Assessment', 428],
  ['VIB.SBC.SMALL_BORE', 'VIB', 'Small-Bore Connection Vibration Screening', 429],
  ['VIB.CAVITATION.FLASHING', 'VIB', 'Cavitation / Flashing Screening', 429],
  ['VIB.SURGE.MOMENTUM', 'VIB', 'Surge / Momentum Load Screening', 429],
  ['VIB.SLUG.TIME_HISTORY', 'VIB', 'Slug Load / Time-History Assessment', 429],
  ['RELIEF.GAS.REACTION_FORCE', 'RELIEF', 'Gas / Vapour Relief Reaction Force', 430],
  ['RELIEF.LIQUID.REACTION_FORCE', 'RELIEF', 'Liquid Relief Reaction Force', 430],
  ['SUPPORT.TRUNNION.LOCAL_STRESS', 'SUPPORT', 'Trunnion Local Stress Assessment', 431],
  ['SUPPORT.WELDED_SHOE.CHECK', 'SUPPORT', 'Welded Shoe Assessment', 431],
  ['EQUIP.API610.NOZZLE_LOADS', 'EQUIP', 'API 610 Nozzle Load Check', 432],
  ['EQUIP.API617.LOAD_CHECK', 'EQUIP', 'API 617 Load Check', 432],
  ['EQUIP.NEMA_SM23.LOAD_CHECK', 'EQUIP', 'NEMA SM23 Load Check', 432],
  ['FLANGE.LEAKAGE.CHECK', 'FLANGE', 'Flange Leakage Assessment', 433],
  ['FLANGE.GRE.CHECK', 'FLANGE', 'GRE Flange Assessment', 433],
  ['HAZARD.BLAST.SCREENING', 'HAZARD', 'Blast Screening', 434],
]);

function blockedCalculation(id, issueNumber) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      'ENGINEERING_METHOD_BLOCKED',
      `${id} is blocked pending engineering qualification issue #${issueNumber}.`,
      { qualificationIssue: issueNumber },
    )],
    qualification: composeEngineeringQualification({
      method: 'BLOCKED',
      data: 'DRAFT',
      designAuthority: false,
      reasons: [`QUALIFICATION_ISSUE_${issueNumber}_OPEN`],
    }),
  };
}

export function createPendingEngineeringCalculationDefinition([id, family, name, issueNumber]) {
  return {
    contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
    id,
    family,
    name,
    shortName: name,
    methodRevision: 'pending-qualification',
    purpose: `${name} placeholder for catalogue discovery only; numerical implementation is not authorized until qualification issue #${issueNumber} is answered.`,
    authority: {
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      codeCompliance: false,
    },
    applicability: {
      description: `Method boundary and engineering authority are pending issue #${issueNumber}.`,
      limitations: [
        'No numerical engineering kernel is registered.',
        `Qualification gate: GitHub issue #${issueNumber}.`,
      ],
    },
    inputs: [],
    outputs: [],
    qualificationIssue: issueNumber,
    ui: {
      visible: true,
      executionModes: [],
      minimumQualificationToShow: 'IMPLEMENTED',
      blockedReason: `Pending qualification issue #${issueNumber}`,
    },
    calculate() {
      return blockedCalculation(id, issueNumber);
    },
  };
}

export const PENDING_ENGINEERING_CALCULATION_DEFINITIONS = Object.freeze(
  PENDING.map(createPendingEngineeringCalculationDefinition),
);
