function compareText(left, right) {
  const a = left == null ? '' : String(left), b = right == null ? '' : String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, stableValue(value[key])]));
}

function sorted(values, fields) {
  return [...(values || [])].map(stableValue).sort((left, right) => {
    for (const field of fields) {
      const order = compareText(left?.[field], right?.[field]);
      if (order) return order;
    }
    return compareText(JSON.stringify(left), JSON.stringify(right));
  });
}

function canonicalSupportObservations(value = {}) {
  return Object.fromEntries(Object.keys(value).sort(compareText).map((field) => [field, {
    ...stableValue(value[field]), values: sorted(value[field]?.values, ['value']),
  }]));
}

function canonicalInventory(value) {
  return {
    ...stableValue(value),
    rawOuterTypes: sorted(value.rawOuterTypes, ['outerType']),
    rawAttributeTypes: sorted(value.rawAttributeTypes, ['attributeType']),
    rawAttributeRawTypes: sorted(value.rawAttributeRawTypes, ['rawType']),
    supportAttributeObservations: canonicalSupportObservations(value.supportAttributeObservations),
    ownerSiteObservations: sorted(value.ownerSiteObservations, ['ownerSite']),
    duplicateIdentities: sorted(value.duplicateIdentities, ['indexName', 'key']),
  };
}

export function canonicalBenchmarkEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Benchmark evidence must be an object.');
  if (value.schema === 'FbxBenchmarkInventory.v1') return canonicalInventory(value);
  return stableValue(value);
}

export function canonicalBenchmarkEvidenceJson(value) {
  return `${JSON.stringify(canonicalBenchmarkEvidence(value), null, 2)}\n`;
}
