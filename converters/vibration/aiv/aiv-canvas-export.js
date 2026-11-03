import { AIV_SCREENING_EXPORT_SCHEMA } from './aiv-screening-export.js';

export const AIV_CANVAS_SCREENING_EXPORT_SCHEMA = 'AivCanvasScreeningExportPackage.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function optionalPresentation({ canvasLayout, canvasFilters, canvasProjection, svgSnapshot }) {
  const presentation = {
    presentationOnly: true,
    requiredForEngineeringInterpretation: false,
  };
  if (canvasLayout) presentation.layout = canvasLayout;
  if (canvasFilters) presentation.filters = canvasFilters;
  if (canvasProjection) presentation.projection = canvasProjection;
  if (typeof svgSnapshot === 'string' && svgSnapshot.trim()) presentation.svgSnapshot = svgSnapshot;
  return Object.keys(presentation).length > 2 ? presentation : null;
}

export function buildAivCanvasScreeningExportPackage({
  engineeringScreeningPackage,
  canvasLayout = null,
  canvasFilters = null,
  canvasProjection = null,
  svgSnapshot = null,
} = {}) {
  if (engineeringScreeningPackage?.schema !== AIV_SCREENING_EXPORT_SCHEMA) {
    throw new TypeError('AIV canvas export requires an AivScreeningExportPackage.v1 engineering package.');
  }
  const canvasPresentation = optionalPresentation({
    canvasLayout,
    canvasFilters,
    canvasProjection,
    svgSnapshot,
  });
  return deepFreeze({
    schema: AIV_CANVAS_SCREENING_EXPORT_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    resultScope: engineeringScreeningPackage.resultScope,
    engineeringAuthoritySource: 'engineeringScreeningPackage',
    engineeringScreeningPackage,
    canvasPresentation,
    screeningAuthority: engineeringScreeningPackage.screeningAuthority,
    designAuthority: false,
  });
}
