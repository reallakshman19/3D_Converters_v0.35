export const RVM_FACET_GROUP_DECODE_SCHEMA = 'RvmFacetGroupDecode.v1';

export function validateRvmFacetGroupEvidence(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') return invalid('facet group evidence must be an object');
  if (evidence.schema && evidence.schema !== RVM_FACET_GROUP_DECODE_SCHEMA) errors.push(`schema must be ${RVM_FACET_GROUP_DECODE_SCHEMA}`);
  if (evidence.decoded !== true) errors.push('decoded must be true');
  if (evidence.representation !== 'native-facet-group') errors.push('representation must be native-facet-group');
  for (const key of ['polygonCount', 'contourCount', 'vertexCount', 'normalCount', 'faceCount']) requireFinite(evidence[key], `facetGroup.${key}`, errors);
  if (!isBbox(evidence.bboxLocal)) errors.push('facetGroup.bboxLocal must be finite bbox');
  if (!isBbox(evidence.bboxWorld)) errors.push('facetGroup.bboxWorld must be finite bbox');
  if (!Array.isArray(evidence.vertices) || !evidence.vertices.every(isTriplet)) errors.push('facetGroup.vertices must be finite triplets');
  if (!Array.isArray(evidence.normals) || !evidence.normals.every(isTriplet)) errors.push('facetGroup.normals must be finite triplets');
  if (!Array.isArray(evidence.faces)) errors.push('facetGroup.faces must be an array');
  if (!Array.isArray(evidence.diagnostics)) errors.push('facetGroup.diagnostics must be an array');
  if (evidence.parserComplete === true) errors.push('facetGroup evidence must not claim parserComplete');
  if (evidence.visualParityClaimed === true) errors.push('facetGroup evidence must not claim visualParityClaimed');
  if (evidence.renderReady === true) errors.push('facetGroup evidence must not claim renderReady');
  return { valid: errors.length === 0, errors };
}

export function summarizeRvmFacetGroupEvidence(evidence) {
  return {
    schema: evidence?.schema || RVM_FACET_GROUP_DECODE_SCHEMA,
    decoded: evidence?.decoded === true,
    polygonCount: num(evidence?.polygonCount),
    contourCount: num(evidence?.contourCount),
    vertexCount: num(evidence?.vertexCount),
    normalCount: num(evidence?.normalCount),
    faceCount: num(evidence?.faceCount),
    diagnosticCount: Array.isArray(evidence?.diagnostics) ? evidence.diagnostics.length : 0,
  };
}

function requireFinite(value, label, errors) {
  if (!Number.isFinite(value)) errors.push(`${label} must be finite`);
}

function isTriplet(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function isBbox(value) {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5];
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
