export function buildLossContract({ objectId, sourceFormat, targetFormat, fidelityClass, rawPreserved, normalizedPreserved, reconstructedFields = [], droppedFields = [], warnings = [] }) {
  return {
    objectId,
    sourceFormat,
    targetFormat,
    fidelityClass,
    rawPreserved,
    normalizedPreserved,
    reconstructedFields,
    droppedFields,
    warnings,
  };
}
