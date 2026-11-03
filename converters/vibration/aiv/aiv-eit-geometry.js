import { aivEitLengthMm } from './aiv-eit-units.js';

function numberText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError('AIV .eit export requires finite numerical result.');
  return String(n);
}

export function buildAivEitPipe(assessment, pipeId) {
  const branchOd = assessment.branchOutsideDiameter
    ? numberText(aivEitLengthMm(assessment.branchOutsideDiameter, 'Branch Outside Diameter'))
    : null;
  const branchWt = assessment.branchWallThickness
    ? numberText(aivEitLengthMm(assessment.branchWallThickness, 'Branch Wall Thickness'))
    : null;
  return {
    nb: '',
    sch: '',
    od: numberText(aivEitLengthMm(assessment.mainOutsideDiameter, 'Main Outside Diameter')),
    wt: numberText(aivEitLengthMm(assessment.mainWallThickness, 'Main Wall Thickness')),
    mat: String(assessment.material ?? ''),
    spec: '',
    pi: pipeId,
    id: numberText(aivEitLengthMm(assessment.mainInsideDiameter, 'Main Inside Diameter')),
    ...(branchOd === null ? {} : { branchOd }),
    ...(branchWt === null ? {} : { branchWt }),
    assessmentCanonicalId: assessment.assessmentCanonicalId,
    assessmentType: assessment.assessmentType,
    duplexState: assessment.duplexState ?? null,
  };
}
