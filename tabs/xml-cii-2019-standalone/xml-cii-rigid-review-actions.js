import { collectXmlCiiDtxrRatingEvidence } from '../../converters/xml-cii2019-core/dtxr-rating-resolver.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function planNearestRigidWeightSuggestions(rows = []) {
  const updates = {};
  let preserved = 0;
  let missing = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = text(row?.key);
    if (!key) continue;
    if (positiveNumber(row?.currentWeight) !== null) {
      preserved += 1;
      continue;
    }
    const nearest = positiveNumber(row?.candidates?.[0]?.suggestedWeight ?? row?.candidates?.[0]?.weight);
    if (nearest === null) {
      missing += 1;
      continue;
    }
    updates[key] = nearest;
  }
  return {
    status: Object.keys(updates).length ? 'READY_TO_APPLY' : 'NO_UPDATES',
    updates,
    appliedCount: Object.keys(updates).length,
    preservedCount: preserved,
    missingCount: missing,
  };
}

export function planRigidDtxrRatingOverrides(rows = []) {
  const updates = {};
  const conflicts = [];
  const missing = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = text(row?.key);
    if (!key) continue;
    const evidence = collectXmlCiiDtxrRatingEvidence([
      { value: row?.dtxr, source: 'dtxr-cell' },
      { value: row?.dtxrTitle, source: 'dtxr-title' },
      { value: row?.dtxrRating, source: 'dtxr-explicit' },
    ]);
    if (evidence.conflict) {
      conflicts.push({ key, ratings: evidence.ratings });
      continue;
    }
    if (!evidence.rating) {
      missing.push(key);
      continue;
    }
    updates[key] = evidence.rating;
  }
  return {
    status: Object.keys(updates).length ? 'READY_TO_APPLY' : (conflicts.length ? 'BLOCKED' : 'NO_UPDATES'),
    updates,
    appliedCount: Object.keys(updates).length,
    conflictCount: conflicts.length,
    missingCount: missing.length,
    conflicts,
    missing,
  };
}
