function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function elementChildren(parent) {
  return [...(parent?.childNodes || parent?.children || [])]
    .filter((node) => node?.nodeType === undefined || node.nodeType === 1);
}

function childrenByName(parent, name) {
  return elementChildren(parent).filter((node) => localName(node) === name);
}

function firstChild(parent, name) {
  return childrenByName(parent, name)[0] || null;
}

function childText(parent, name) {
  return text(firstChild(parent, name)?.textContent);
}

function valueAtPath(parent, path = []) {
  let current = parent;
  for (const segment of path) {
    current = firstChild(current, segment);
    if (!current) return { found: false, value: '' };
  }
  return { found: true, value: text(current?.textContent) };
}

function authorityKey(entry) {
  return [
    entry?.scope || '',
    entry?.branchName || '',
    entry?.nodeNumber || '',
    ...(Array.isArray(entry?.path) ? entry.path : []),
  ].join('\u0000');
}

function normalizedValue(value, kind = 'text') {
  const clean = text(value);
  if (kind === 'number') {
    if (!clean) return '';
    const numeric = Number(clean.replace(/[^0-9.+-eE]/g, ''));
    return Number.isFinite(numeric) ? numeric : clean;
  }
  return clean;
}

function valuesEqual(expected, actual, kind) {
  const left = normalizedValue(expected, kind);
  const right = normalizedValue(actual, kind);
  if (kind === 'number' && typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) <= 1e-9;
  }
  return left === right;
}

export function digestXmlCiiParityText(value) {
  const source = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${source.length}`;
}

export function extractXmlCiiParityAuthorityEntries(xmlText, expectedEntries = []) {
  if (typeof DOMParser === 'undefined') throw new Error('DOMParser is unavailable for XML→CII run parity verification.');
  const document = new DOMParser().parseFromString(String(xmlText ?? ''), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('The enriched XML could not be parsed for run parity verification.');

  const branches = new Map();
  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = childText(branch, 'Branchname');
    if (branchName && !branches.has(branchName)) branches.set(branchName, branch);
  }

  return (expectedEntries || []).map((entry) => {
    const branch = branches.get(text(entry?.branchName));
    if (!branch) return { ...entry, actual: '', found: false, missing: 'branch' };
    let owner = branch;
    if (entry?.scope === 'node') {
      owner = childrenByName(branch, 'Node').find((node) => childText(node, 'NodeNumber') === text(entry?.nodeNumber)) || null;
      if (!owner) return { ...entry, actual: '', found: false, missing: 'node' };
    }
    const actual = valueAtPath(owner, entry?.path || []);
    return { ...entry, actual: actual.value, found: actual.found, missing: actual.found ? '' : 'field' };
  });
}

export function compareXmlCiiParityAuthorityEntries(expectedEntries = [], actualEntries = [], internalMismatches = [], xmlText = '') {
  const actualByKey = new Map((actualEntries || []).map((entry) => [authorityKey(entry), entry]));
  const mismatches = [...(internalMismatches || [])];
  let comparisons = 0;

  for (const expected of expectedEntries || []) {
    comparisons += 1;
    const actual = actualByKey.get(authorityKey(expected));
    if (!actual || actual.found === false) {
      mismatches.push({
        type: 'missing-propagated-authority',
        scope: expected.scope,
        branchName: expected.branchName,
        nodeNumber: expected.nodeNumber || '',
        field: expected.field || (expected.path || []).join('.'),
        expected: text(expected.expected),
        actual: '',
        source: expected.source || 'preview',
        missing: actual?.missing || 'entry',
      });
      continue;
    }
    if (!valuesEqual(expected.expected, actual.actual, expected.kind || 'text')) {
      mismatches.push({
        type: 'propagated-authority-mismatch',
        scope: expected.scope,
        branchName: expected.branchName,
        nodeNumber: expected.nodeNumber || '',
        field: expected.field || (expected.path || []).join('.'),
        expected: text(expected.expected),
        actual: text(actual.actual),
        source: expected.source || 'preview',
      });
    }
  }

  const ok = mismatches.length === 0;
  return {
    schema: 'xml-cii-standalone-run-parity-evidence/v1',
    status: ok ? (comparisons ? 'PASS' : 'PASS_EMPTY') : 'BLOCKED',
    ok,
    comparisons,
    mismatchCount: mismatches.length,
    mismatches,
    engineInputDigest: digestXmlCiiParityText(xmlText),
    authoritySources: ['standalone-preview', 'weight-match', 'browser-enriched-xml', 'converter-input'],
  };
}

export function createStandaloneRunParityEvidence({ xmlText = '', expectedEntries = [], branchRows = [], nodeRows = [] } = {}) {
  const branchByName = new Map((branchRows || []).map((row) => [text(row?.branchName), row]));
  const internalMismatches = [];
  for (const nodeRow of nodeRows || []) {
    const branch = branchByName.get(text(nodeRow?.branchName));
    const branchRating = text(branch?.rating);
    const nodeRating = text(nodeRow?.rating);
    if (branchRating && nodeRating && branchRating !== nodeRating) {
      internalMismatches.push({
        type: 'weight-match-rating-parity',
        scope: 'node',
        branchName: text(nodeRow?.branchName),
        nodeNumber: text(nodeRow?.nodeNumber),
        field: 'rating',
        expected: branchRating,
        actual: nodeRating,
        source: 'weight-match',
      });
    }
  }
  const actualEntries = extractXmlCiiParityAuthorityEntries(xmlText, expectedEntries);
  return compareXmlCiiParityAuthorityEntries(expectedEntries, actualEntries, internalMismatches, xmlText);
}
