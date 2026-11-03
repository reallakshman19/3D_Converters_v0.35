import { calculateSbcType1Reserved } from './type1/reserved.js';
import { calculateSbcType2Reserved } from './type2/reserved.js';
import { calculateSbcType3Reserved } from './type3/reserved.js';
import { calculateSbcType4Reserved } from './type4/reserved.js';
import { SBC_TYPE_IDS, SBC_VERTICAL_ISSUES } from './vertical-manifest.js';

const ROUTES = Object.freeze({
  TYPE_1: calculateSbcType1Reserved,
  TYPE_2: calculateSbcType2Reserved,
  TYPE_3: calculateSbcType3Reserved,
  TYPE_4: calculateSbcType4Reserved,
});

function normalizedType(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function calculateReservedSbc(input = {}) {
  const typeId = normalizedType(input.sbcType);
  const route = ROUTES[typeId];
  if (route) return route(input);
  return Object.freeze({
    ok: false,
    status: 'RESERVED',
    sbcType: null,
    executionAllowed: false,
    availableTypes: SBC_TYPE_IDS,
    problems: Object.freeze([Object.freeze({
      code: 'SBC_TYPE_SELECTION_REQUIRED',
      message: 'Select SBC Type 1, 2, 3, or 4 before implementation/qualification work can be routed.',
      qualificationIssue: SBC_VERTICAL_ISSUES.scaffold,
    })]),
  });
}
