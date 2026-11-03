// Generate deterministic review-only decisions from a validated mapping worklist.
// Mapping IDs reuse content-derived work item IDs; invalid inputs have no random fallback.
function mappingEntryId(workItemId) {
  if (typeof workItemId !== 'string' || !workItemId) {
    throw new TypeError('A content-derived workItemId is required.');
  }
  return `draft-${workItemId}`;
}

const HEURISTIC_KEYWORDS = {
  'ELBOW': 'ELBOW',
  'ELBO': 'ELBOW',
  'BEND': 'ELBOW',
  'TEE': 'TEE',
  'REDUCER': 'REDUCER',
  'REDU': 'REDUCER',
  'FLANGE': 'FLANGE',
  'FLAN': 'FLANGE',
  'VALVE': 'VALVE',
  'VALV': 'VALVE',
  'PIPE': 'PIPE',
  'TUBE': 'PIPE',
  'CYLINDER': 'PIPE',
};

function inferComponentType(name) {
  if (!name) return null;
  const normalized = name.toUpperCase();
  for (const [keyword, type] of Object.entries(HEURISTIC_KEYWORDS)) {
    // Check for exact word boundaries or prefixing
    if (new RegExp(`\\b${keyword}\\b`).test(normalized) || normalized.startsWith(keyword)) {
      return type;
    }
  }
  return null;
}

export function generateDraftDecisions(worklist) {
  const decisions = [];
  
  for (const item of worklist.workItems) {
    const name = item.nameEvidence?.displayName || item.nameEvidence?.domSourceName || '';
    const inferredType = inferComponentType(name);
    
    if (inferredType) {
      decisions.push({
        mappingEntryId: mappingEntryId(item.workItemId),
        workItemId: item.workItemId,
        scopeDisposition: 'promote',
        componentType: inferredType,
        logicalComponentId: 'PLACEHOLDER', // Filled by user/reviewer
        sourceModelObjectId: item.sourceModelObjectId,
        sourceOccurrenceId: item.sourceOccurrenceId,
        sourceGeometryObjectIds: [...item.sourceGeometryObjectIds],
        ports: 'PLACEHOLDER', // Port assignments cannot be guessed purely by name
      });
    } else {
      decisions.push({
        mappingEntryId: mappingEntryId(item.workItemId),
        workItemId: item.workItemId,
        scopeDisposition: 'exclude-with-reason',
        reason: 'Heuristic: Unclassified component name',
      });
    }
  }

  return {
    schema: 'FbxDraftDecisionSet.v1',
    worklistId: worklist.worklistId,
    decisions,
  };
}
