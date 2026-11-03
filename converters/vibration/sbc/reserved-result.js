import {
  SBC_ASSESSMENT_UNIT_TYPE,
  SBC_VERTICAL_ISSUES,
  getSbcTypeImplementationSlot,
} from './vertical-manifest.js';

function scopeId(input) {
  const value = String(input?.scopeId ?? input?.connectionId ?? '').trim();
  return value || null;
}

export function createReservedSbcTypeResult(typeId, input = {}) {
  const slot = getSbcTypeImplementationSlot(typeId);
  if (!slot) throw new TypeError(`Unknown reserved SBC type: ${typeId}`);
  return Object.freeze({
    ok: false,
    status: 'RESERVED',
    assessmentUnitType: SBC_ASSESSMENT_UNIT_TYPE,
    sbcType: slot.typeId,
    scopeId: scopeId(input),
    lifecycle: slot.lifecycle,
    executionAllowed: false,
    problems: Object.freeze([Object.freeze({
      code: 'SBC_TYPE_RESERVED_NOT_QUALIFIED',
      message: `${slot.typeId} is reserved for implementation but is not qualified for numerical execution.`,
      qualificationIssue: SBC_VERTICAL_ISSUES.scaffold,
      owningIssues: slot.owningIssues,
    })]),
    benchmarkRequirements: slot.benchmarkRequirements,
    blockedBy: slot.blockedBy,
    nextImplementationSeam: slot.nextImplementationSeam,
  });
}
