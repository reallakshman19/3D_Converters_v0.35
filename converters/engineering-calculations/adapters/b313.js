import {
  calculateB313Thickness,
  evaluateB313ProvidedWall,
} from '../../b313-thickness/index.js';
import { calculateB313MaterialDesign } from '../../b313-material-factors/index.js';
import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import {
  composeEngineeringQualification,
  minimumDataQualification,
} from '../qualification.js';

const METHOD_REASON = 'B313_CODE_TEXT_ENGINEERING_REVIEW_REQUIRED';

const allowanceFields = [
  ['corrosionAllowance', 'Corrosion allowance'],
  ['mechanicalAllowance', 'Mechanical allowance'],
  ['erosionAllowance', 'Erosion allowance'],
  ['otherAllowance', 'Other allowance'],
].map(([key, label]) => ({
  key,
  label,
  type: 'number',
  quantity: 'length',
  canonicalUnit: 'mm',
  engineeringDefault: 0,
  min: 0,
}));

function failureFragment(result, qualification) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      result?.code || 'CALCULATION_FAILED',
      result?.message || 'B31.3 domain calculation failed.',
      result?.details ?? {},
    )],
    qualification,
    provenance: { domainCode: result?.code ?? null },
    evidence: { domainResult: result },
  };
}

function directQualification() {
  return composeEngineeringQualification({
    method: 'IMPLEMENTED',
    data: 'DRAFT',
    designAuthority: false,
    reasons: [METHOD_REASON, 'CALLER_SUPPLIED_ENGINEERING_FACTORS'],
  });
}

function materialQualification(result) {
  const factors = result?.materialFactors;
  const sources = Object.values(factors?.factorSources ?? {});
  const hasCallerOverride = sources.some((source) => source?.authority === 'CALLER_OVERRIDE');
  const statuses = sources.map((source) => source?.status).filter(Boolean);
  const data = hasCallerOverride ? 'DRAFT' : minimumDataQualification(statuses, 'DRAFT');
  const reasons = [METHOD_REASON];
  if (!factors?.designAuthority) reasons.push('MATERIAL_FACTOR_DATA_NOT_DESIGN_AUTHORITY');
  if (result?.pipeWall) reasons.push('PIPE_WALL_SELECTION_PROJECT_MASTER_BASIS');
  return composeEngineeringQualification({
    method: 'IMPLEMENTED',
    data,
    designAuthority: Boolean(factors?.designAuthority),
    reasons,
  });
}

function b313DomainInput(input) {
  return {
    ...input,
    designPressure: input.designPressure,
    pressureUnit: 'MPa',
    outsideDiameter: input.outsideDiameter,
    lengthUnit: 'mm',
    allowanceUnit: 'mm',
    allowableStress: input.allowableStress,
    stressUnit: 'MPa',
    providedThicknessUnit: 'mm',
  };
}

function thicknessOutputs(result) {
  return {
    pressureDesignThicknessMm: result.pressureDesignThicknessMm,
    requiredMinimumThicknessMm: result.requiredMinimumThicknessMm,
    requiredNominalThicknessMm: result.requiredNominalThicknessMm,
    totalAllowanceMm: result.totalAllowanceMm,
    ...(result.providedNominalThicknessMm !== undefined ? {
      providedNominalThicknessMm: result.providedNominalThicknessMm,
      minimumAsManufacturedThicknessMm: result.minimumAsManufacturedThicknessMm,
      marginMm: result.marginMm,
      utilization: result.utilization,
      pass: result.pass,
    } : {}),
  };
}

function providedWallCheck(result) {
  if (result.providedNominalThicknessMm === undefined) return [];
  return [{
    id: 'B313.PROVIDED_WALL.MINIMUM',
    label: 'Provided minimum wall vs required minimum wall',
    actual: result.minimumAsManufacturedThicknessMm,
    allowable: result.requiredMinimumThicknessMm,
    comparator: '>=',
    utilization: result.utilization,
    status: result.pass ? 'PASS' : 'FAIL',
    authority: 'IMPLEMENTED',
    basis: `${result.standard} ${result.edition} ${result.paragraph} ${result.equation}`,
  }];
}

function thicknessDefinition(deps) {
  return {
    contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
    id: 'PIPE.B313.THICKNESS',
    family: 'PIPE',
    name: 'ASME B31.3 Straight-Pipe Thickness',
    shortName: 'B31.3 Thickness',
    methodRevision: '304.1.2-eq3a-v1',
    purpose: 'Calculate pressure-design, minimum and ordered nominal wall thickness for the implemented B31.3 straight-pipe internal-pressure scope.',
    authority: { calculationState: 'IMPLEMENTED', qualificationState: 'IMPLEMENTED', codeCompliance: false },
    applicability: { description: 'Straight metallic pipe, internal pressure, implemented B31.3 equation path.', limitations: ['Engineering code-text review required before design authority.'] },
    inputs: [
      { key: 'designPressure', label: 'Design pressure', type: 'number', required: true, quantity: 'pressure', canonicalUnit: 'MPa', pressureReference: 'gauge', minExclusive: 0 },
      { key: 'outsideDiameter', label: 'Outside diameter', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
      { key: 'allowableStress', label: 'Allowable stress', type: 'number', required: true, quantity: 'stress', canonicalUnit: 'MPa', minExclusive: 0 },
      { key: 'qualityFactorE', label: 'Quality factor E', type: 'number', required: true, quantity: 'dimensionless', canonicalUnit: null, minExclusive: 0, max: 1 },
      { key: 'weldStrengthReductionW', label: 'Weld strength reduction W', type: 'number', required: true, quantity: 'dimensionless', canonicalUnit: null, minExclusive: 0, max: 1 },
      { key: 'coefficientY', label: 'Coefficient Y', type: 'number', required: true, quantity: 'dimensionless', canonicalUnit: null, min: 0, max: 1 },
      ...allowanceFields,
      { key: 'negativeMillTolerance', label: 'Negative mill tolerance', type: 'object', required: true },
      { key: 'providedNominalThickness', label: 'Provided nominal wall', type: 'number', quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
    ],
    outputs: [
      { key: 'pressureDesignThicknessMm', label: 'Pressure-design thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
      { key: 'requiredMinimumThicknessMm', label: 'Required minimum thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
      { key: 'requiredNominalThicknessMm', label: 'Required nominal thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    ],
    calculate(input) {
      const domainInput = b313DomainInput(input);
      const result = input.providedNominalThickness !== undefined
        ? deps.evaluateProvidedWall(domainInput)
        : deps.calculateThickness(domainInput);
      const qualification = directQualification();
      if (!result?.ok) return failureFragment(result, qualification);
      return {
        ok: true,
        outputs: thicknessOutputs(result),
        intermediates: { allowances: result.allowances, manufacturingTolerance: result.manufacturingTolerance, equationTrace: result.equationTrace },
        checks: providedWallCheck(result),
        assessment: result.providedNominalThicknessMm === undefined ? null : { status: result.status, pass: result.pass, authority: 'IMPLEMENTED' },
        qualification,
        provenance: { domainApi: result.providedNominalThicknessMm === undefined ? 'calculateB313Thickness' : 'evaluateB313ProvidedWall', standard: result.standard, edition: result.edition, paragraph: result.paragraph, equation: result.equation },
        evidence: { domainResult: result },
        applicability: { applicable: true, limitations: result.applicability?.warnings ?? [] },
      };
    },
  };
}

function materialIdentity(input) {
  if (input.material) return input.material;
  return {
    ...(input.materialId ? { materialId: input.materialId } : {}),
    ...(input.materialFamily ? { family: input.materialFamily } : {}),
  };
}

function materialDefinition(deps) {
  return {
    contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
    id: 'PIPE.B313.MATERIAL_DESIGN',
    family: 'PIPE',
    name: 'ASME B31.3 Material Design + Wall Selection',
    shortName: 'B31.3 Material Design',
    methodRevision: 'material-factor-pipeline-v1',
    purpose: 'Resolve governed B31.3 material factors, calculate straight-pipe wall, and optionally select a commercial wall.',
    authority: { calculationState: 'IMPLEMENTED', qualificationState: 'IMPLEMENTED', codeCompliance: false },
    applicability: { description: 'Current governed material-factor master plus implemented straight-pipe thickness and pipe-wall selection paths.', limitations: ['Qualification depends on exact factor/master status and method review.'] },
    inputs: [
      { key: 'material', label: 'Material identity', type: 'object' },
      { key: 'materialId', label: 'Material ID', type: 'string' },
      { key: 'materialFamily', label: 'Material family', type: 'string' },
      { key: 'allowProjectFamilyDefault', label: 'Allow family default', type: 'boolean', engineeringDefault: false },
      { key: 'designTemperature', label: 'Design temperature', type: 'number', required: true, quantity: 'temperature', canonicalUnit: 'C' },
      { key: 'manufacturingRoute', label: 'Manufacturing route', type: 'string' },
      { key: 'designPressure', label: 'Design pressure', type: 'number', required: true, quantity: 'pressure', canonicalUnit: 'MPa', pressureReference: 'gauge', minExclusive: 0 },
      { key: 'outsideDiameter', label: 'Outside diameter', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
      ...allowanceFields,
      { key: 'negativeMillTolerance', label: 'Negative mill tolerance', type: 'object', required: true },
      { key: 'factorOverrides', label: 'Factor overrides', type: 'object' },
      { key: 'dn', label: 'DN', type: 'number', quantity: 'dimensionless', canonicalUnit: null, minExclusive: 0 },
      { key: 'nps', label: 'NPS', type: 'number', quantity: 'dimensionless', canonicalUnit: null, minExclusive: 0 },
      { key: 'dimensionStandard', label: 'Dimension standard', type: 'string' },
      { key: 'selectPipeWall', label: 'Select pipe wall', type: 'boolean', engineeringDefault: true },
    ],
    outputs: [
      { key: 'materialId', label: 'Resolved material ID', type: 'string' },
      { key: 'requiredNominalThicknessMm', label: 'Required nominal thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
      { key: 'selectedNominalWallMm', label: 'Selected nominal wall', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
      { key: 'selectedSchedule', label: 'Selected schedule', type: 'string' },
    ],
    validateInput(input) {
      if (input.material || input.materialId || input.materialFamily) return { ok: true, errors: [], warnings: [] };
      return { ok: false, errors: [createEngineeringCalculationError('INPUT_REQUIRED', 'A material, materialId, or materialFamily is required.', {}, 'material')] };
    },
    calculate(input, runtime) {
      const result = deps.calculateMaterialDesign({
        ...input,
        material: materialIdentity(input),
        designTemperature: input.designTemperature,
        temperatureUnit: 'C',
        designPressure: input.designPressure,
        pressureUnit: 'MPa',
        outsideDiameter: input.outsideDiameter,
        lengthUnit: 'mm',
        allowanceUnit: 'mm',
        qualificationMode: runtime.options.qualificationMode ?? 'strict',
      });
      const qualification = materialQualification(result);
      if (!result?.ok) return failureFragment(result, qualification);
      const wall = result.pipeWall?.selected ?? null;
      return {
        ok: true,
        outputs: {
          materialId: result.materialFactors.material.materialId,
          allowableStressMPa: result.materialFactors.factors.allowableStressMPa,
          qualityFactorE: result.materialFactors.factors.qualityFactorE,
          weldStrengthReductionW: result.materialFactors.factors.weldStrengthReductionW,
          coefficientY: result.materialFactors.factors.coefficientY,
          pressureDesignThicknessMm: result.calculation.pressureDesignThicknessMm,
          requiredMinimumThicknessMm: result.calculation.requiredMinimumThicknessMm,
          requiredNominalThicknessMm: result.calculation.requiredNominalThicknessMm,
          ...(wall ? { selectedNominalWallMm: wall.nominalWallMm, selectedSchedule: wall.schedule, equivalentSchedules: wall.equivalentSchedules } : {}),
        },
        intermediates: { materialFactors: result.materialFactors.factors, factorSources: result.materialFactors.factorSources },
        checks: [],
        assessment: null,
        qualification,
        provenance: { domainApi: 'calculateB313MaterialDesign', material: result.materialFactors.material, factorSources: result.materialFactors.factorSources, pipeWallSource: result.pipeWall?.source ?? null },
        evidence: { domainResult: result },
      };
    },
  };
}

export function createB313EngineeringCalculationDefinitions({
  calculateThickness = calculateB313Thickness,
  evaluateProvidedWall = evaluateB313ProvidedWall,
  calculateMaterialDesign = calculateB313MaterialDesign,
} = {}) {
  const deps = { calculateThickness, evaluateProvidedWall, calculateMaterialDesign };
  return Object.freeze([thicknessDefinition(deps), materialDefinition(deps)]);
}

export const B313_ENGINEERING_CALCULATION_DEFINITIONS = createB313EngineeringCalculationDefinitions();
