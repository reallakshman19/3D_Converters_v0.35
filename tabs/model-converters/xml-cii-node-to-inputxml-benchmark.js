function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function fmt(value, places = 3) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(places) : ''; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function attrs(raw) {
  const out = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(String(raw || '')))) out[match[1]] = match[2];
  return out;
}
function normalizeNode(value) {
  const n = num(value);
  return n === null ? text(value) : String(Math.trunc(n));
}
function isActiveNode(value) {
  const n = num(value);
  return n !== null && Math.abs(n + 1.0101) > 1e-6;
}
function tagAttrs(body, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*)/?>`, 'gi');
  let match;
  while ((match = re.exec(String(body || '')))) out.push(attrs(match[1]));
  return out;
}
function deltaLength(element) {
  const dx = num(element.deltaX);
  const dy = num(element.deltaY);
  const dz = num(element.deltaZ);
  const values = [dx, dy, dz].map((v) => (v === null || Math.abs(v + 1.0101) < 1e-6 ? 0 : v));
  return Math.hypot(values[0], values[1], values[2]);
}

export function parseInputXmlElements(inputXmlText) {
  const out = [];
  const re = /<PIPINGELEMENT\b([^>]*)>([\s\S]*?)<\/PIPINGELEMENT>/gi;
  let match;
  while ((match = re.exec(String(inputXmlText || '')))) {
    const a = attrs(match[1]);
    const body = match[2] || '';
    const restraints = tagAttrs(body, 'RESTRAINT');
    const sifs = tagAttrs(body, 'SIF');
    const bends = tagAttrs(body, 'BEND');
    const rigids = tagAttrs(body, 'RIGID');
    out.push({
      index: out.length + 1,
      from: normalizeNode(a.FROM_NODE),
      to: normalizeNode(a.TO_NODE),
      fromRaw: a.FROM_NODE || '',
      toRaw: a.TO_NODE || '',
      deltaX: a.DELTA_X || '',
      deltaY: a.DELTA_Y || '',
      deltaZ: a.DELTA_Z || '',
      attrs: a,
      childCounts: {
        rigid: rigids.length,
        bend: bends.filter((row) => row.RADIUS === undefined || isActiveNode(row.RADIUS)).length,
        restraint: restraints.filter((row) => isActiveNode(row.NODE)).length,
        sif: sifs.filter((row) => isActiveNode(row.NODE)).length,
      },
      children: { rigids, bends, restraints, sifs },
      length: 0,
    });
  }
  out.forEach((element) => { element.length = deltaLength(element); });
  return out;
}

export function summarizeInputXmlElements(elements) {
  const rows = asArray(elements);
  return {
    elementCount: rows.length,
    rigidCount: rows.reduce((sum, row) => sum + row.childCounts.rigid, 0),
    bendCount: rows.reduce((sum, row) => sum + row.childCounts.bend, 0),
    restraintCount: rows.reduce((sum, row) => sum + row.childCounts.restraint, 0),
    sifCount: rows.reduce((sum, row) => sum + row.childCounts.sif, 0),
    shortFillerCount: rows.filter((row) => row.length > 0 && row.length < 50).length,
  };
}

export function compareInputXmlElementSequences(generatedElements, expectedElements) {
  const generated = asArray(generatedElements);
  const expected = asArray(expectedElements);
  const max = Math.max(generated.length, expected.length);
  const rows = [];
  let matchedPairs = 0;
  let firstMismatch = null;
  for (let i = 0; i < max; i += 1) {
    const g = generated[i] || null;
    const e = expected[i] || null;
    const generatedPair = g ? `${g.from}->${g.to}` : '';
    const expectedPair = e ? `${e.from}->${e.to}` : '';
    const status = generatedPair && generatedPair === expectedPair ? 'MATCH' : 'DIFF';
    if (status === 'MATCH') matchedPairs += 1;
    else if (!firstMismatch) firstMismatch = { index: i + 1, generatedPair, expectedPair };
    rows.push({
      index: i + 1,
      status,
      generatedPair,
      expectedPair,
      generatedLengthMm: g ? fmt(g.length, 3) : '',
      expectedLengthMm: e ? fmt(e.length, 3) : '',
      generatedChildren: g ? `R${g.childCounts.rigid}/B${g.childCounts.bend}/SIF${g.childCounts.sif}/REST${g.childCounts.restraint}` : '',
      expectedChildren: e ? `R${e.childCounts.rigid}/B${e.childCounts.bend}/SIF${e.childCounts.sif}/REST${e.childCounts.restraint}` : '',
    });
  }
  return { rows, matchedPairs, firstMismatch };
}

export function compareInputXmlAgainstExpected({ generatedInputXmlText, expectedInputXmlText, generatedResult } = {}) {
  const generatedElements = parseInputXmlElements(generatedInputXmlText || generatedResult?.coreInputXmlText || generatedResult?.finalInputXmlText || '');
  const expectedElements = parseInputXmlElements(expectedInputXmlText || '');
  const generatedSummary = summarizeInputXmlElements(generatedElements);
  const expectedSummary = summarizeInputXmlElements(expectedElements);
  const sequence = compareInputXmlElementSequences(generatedElements, expectedElements);
  const metricRows = ['elementCount', 'rigidCount', 'bendCount', 'restraintCount', 'sifCount', 'shortFillerCount'].map((metric) => ({
    metric,
    generated: generatedSummary[metric],
    expected: expectedSummary[metric],
    delta: Number(generatedSummary[metric] || 0) - Number(expectedSummary[metric] || 0),
    status: Number(generatedSummary[metric] || 0) === Number(expectedSummary[metric] || 0) ? 'MATCH' : 'DIFF',
  }));
  const generatedShortFillers = asArray(generatedResult?.diagnostics?.fillers).map((row) => ({
    from: row.from,
    to: row.to,
    lengthMm: fmt(row.lengthMm, 3),
    reason: row.reason || 'TOPO_FILLER_SHORT',
  }));
  if (!generatedShortFillers.length) {
    for (const row of generatedElements.filter((element) => element.length > 0 && element.length < 50)) {
      generatedShortFillers.push({ from: row.from, to: row.to, lengthMm: fmt(row.length, 3), reason: 'INPUTXML_DELTA_SHORT' });
    }
  }
  return {
    ok: true,
    generatedSummary,
    expectedSummary,
    metricRows,
    sequenceRows: sequence.rows,
    matchedPairs: sequence.matchedPairs,
    sequenceMatchRatio: expectedElements.length ? sequence.matchedPairs / expectedElements.length : 0,
    firstMismatch: sequence.firstMismatch,
    generatedShortFillers,
  };
}
