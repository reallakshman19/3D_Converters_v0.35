import { canonicalSemanticJson, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';

const BUNDLE_SCHEMA = 'topo-enriched-xml-writer-bundle/v1';
const REQUIRED_FIELDS = Object.freeze([
  'schema', 'generated', 'operatingMode', 'profile', 'evaluatedAt', 'projectId', 'zoneId',
  'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash', 'branchProjectionId',
  'projectionKind', 'xmlText', 'xmlHash', 'trace', 'traceHash', 'bundleHash', 'summary', 'validation',
]);
const NUMERIC_NODE_FIELDS = new Set([
  'Rigid', 'Weight', 'OutsideDiameter', 'WallThickness', 'CorrosionAllowance',
  'InsulationThickness', 'BendRadius', 'BendType', 'AlphaAngle', 'SIF',
]);
const ENGINEERING_FIELDS = Object.freeze([
  'NodeName', 'Rigid', 'Weight', 'ComponentRefNo', 'ConnectionType',
  'OutsideDiameter', 'WallThickness', 'CorrosionAllowance', 'InsulationThickness',
  'Position', 'BendRadius', 'BendType', 'AlphaAngle', 'SIF',
  'DTXR_POS', 'DTXR_PS', 'DTXR_SOURCE',
]);

export async function verifyPsiWriterBundle(bundle, side) {
  const issues = [];
  if (!isObject(bundle) || bundle.schema !== BUNDLE_SCHEMA) {
    issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'BUNDLE_SCHEMA_INVALID'));
    return deepFreeze(emptyVerification(bundle, issues));
  }
  verifyBundleShape(bundle, side, issues);
  let parsed;
  try { parsed = parsePsiXml(bundle.xmlText, side, issues); }
  catch (error) {
    issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'XML_PARSE_FAILED', { message: error.message }));
    parsed = { branches: [], nodes: [] };
  }
  const trace = array(bundle.trace);
  const traceGroups = groupTrace(trace);
  const duplicateGroups = [...traceGroups.entries()]
    .filter(([, rows]) => rows.length !== 1)
    .map(([occurrenceId, rows]) => ({ occurrenceId, rows: stableRows(rows) }));
  for (const duplicate of duplicateGroups) {
    issues.push(issue('TRACE_IDENTITY_MISMATCH', side, 'DUPLICATE_OCCURRENCE_ID', duplicate));
  }
  await verifyHashes(bundle, side, issues);
  verifyTraceShape(bundle, parsed, trace, side, issues);
  verifySummary(bundle, parsed, trace, side, issues);
  return deepFreeze({
    bundle, parsed, trace, traceGroups: groupEntries(traceGroups), duplicateGroups,
    issues, projectId: text(bundle.projectId), zoneId: text(bundle.zoneId),
    serializationPlanHash: text(bundle.serializationPlanHash), projectionKind: text(bundle.projectionKind),
    summary: bundle.summary || {},
  });
}

export async function computePsiWriterBundleHash(bundle) {
  return shaSemantic(bundleHashInput(bundle));
}
export async function computeTextHash(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value ?? '')));
  return `sha256:${[...new Uint8Array(digest)].map(hex).join('')}`;
}
export async function computeSemanticValueHash(value) { return shaSemantic(value); }
export function bundleHashInput(bundle) {
  const keys = [
    'schema', 'operatingMode', 'profile', 'evaluatedAt', 'projectId', 'zoneId',
    'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash',
    'branchProjectionId', 'projectionKind', 'xmlHash', 'traceHash',
  ];
  return Object.fromEntries(keys.map((key) => [key, bundle?.[key]]));
}

function emptyVerification(bundle, issues) {
  return {
    bundle, parsed: { branches: [], nodes: [] }, trace: [], traceGroups: [],
    duplicateGroups: [], issues, projectId: '', zoneId: '', serializationPlanHash: '',
    projectionKind: '', summary: {},
  };
}

function verifyBundleShape(bundle, side, issues) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in bundle) || bundle[field] === null || bundle[field] === '') {
      issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'BUNDLE_FIELD_MISSING', { field }));
    }
  }
  if (bundle.generated !== true) issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'BUNDLE_NOT_GENERATED'));
  if (text(bundle.profile) !== 'STRICT_PSI') issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'STRICT_PROFILE_REQUIRED'));
  if (!Array.isArray(bundle.trace)) issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'TRACE_NOT_ARRAY'));
  if (!isObject(bundle.summary)) issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'SUMMARY_INVALID'));
  if (!isObject(bundle.validation) || text(bundle.validation.status) !== 'PASS') {
    issues.push(issue('OUTPUT_VALIDATION_NOT_PASS', side, 'BUNDLE_VALIDATION', {
      status: text(bundle.validation?.status),
    }));
  }
  for (const field of ['projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash', 'branchProjectionId', 'projectionKind']) {
    if (!text(bundle[field])) issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'BUNDLE_ROOT_MISSING', { field }));
  }
  if (!validTimestamp(bundle.evaluatedAt)) issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'EVALUATED_AT_INVALID'));
}

async function verifyHashes(bundle, side, issues) {
  const actualXmlHash = await computeTextHash(bundle.xmlText);
  const actualTraceHash = await shaSemantic(array(bundle.trace));
  const actualBundleHash = await computePsiWriterBundleHash(bundle);
  compareHash(bundle.xmlHash, actualXmlHash, side, 'XML_HASH_MISMATCH', issues);
  compareHash(bundle.traceHash, actualTraceHash, side, 'TRACE_HASH_MISMATCH', issues);
  compareHash(bundle.bundleHash, actualBundleHash, side, 'BUNDLE_HASH_MISMATCH', issues);
}
function compareHash(stored, actual, side, reason, issues) {
  if (text(stored) !== actual) {
    issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, reason, { stored: text(stored), actual }));
  }
}

function verifyTraceShape(bundle, parsed, trace, side, issues) {
  if (parsed.nodes.length !== trace.length) {
    issues.push(issue('TRACE_CARDINALITY_MISMATCH', side, 'XML_TRACE_COUNT', {
      xmlNodes: parsed.nodes.length, traceRows: trace.length,
    }));
  }
  for (const [index, row] of trace.entries()) {
    const node = parsed.nodes[index];
    const mismatches = [];
    compareExact(mismatches, 'traceIndex', row?.traceIndex, index);
    if (!node) {
      issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'TRACE_ROW_WITHOUT_XML_NODE', {
        index, occurrenceId: text(row?.occurrenceId),
      }));
      continue;
    }
    compareExact(mismatches, 'branchIndex', row?.branchIndex, node.branchIndex);
    compareExact(mismatches, 'nodeIndexInBranch', row?.nodeIndexInBranch, node.nodeIndex);
    compareScalar(mismatches, 'branchName', row?.branchName, node.branchName);
    compareExact(mismatches, 'engineeringNodeNumber', row?.engineeringNodeNumber, node.nodeNumber);
    compareScalar(mismatches, 'psiComponentType', row?.psiComponentType, node.componentType);
    compareExact(mismatches, 'endpoint', row?.endpoint, node.endpoint);
    compareScalar(mismatches, 'branchProjectionId', row?.branchProjectionId, bundle.branchProjectionId);
    compareScalar(mismatches, 'projectionKind', row?.projectionKind, bundle.projectionKind);
    if (!text(row?.occurrenceId)) mismatches.push({ field: 'occurrenceId', trace: row?.occurrenceId ?? null });
    if (mismatches.length) {
      issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'TRACE_ROW_XML_MISMATCH', {
        index, occurrenceId: text(row?.occurrenceId), mismatches,
      }));
    }
  }
}

function verifySummary(bundle, parsed, trace, side, issues) {
  const expected = {
    branchCount: parsed.branches.length,
    emittedOccurrenceCount: trace.length,
    xmlNodeCount: parsed.nodes.length,
    traceCount: trace.length,
    writerSideAllocations: 0,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (bundle.summary?.[field] !== value) issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side,
      'SUMMARY_MISMATCH', { field, expected: value, actual: bundle.summary?.[field] }));
  }
  if (!Number.isInteger(bundle.summary?.reservedOccurrenceCount) || bundle.summary.reservedOccurrenceCount < 0) {
    issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'SUMMARY_MISMATCH', {
      field: 'reservedOccurrenceCount', actual: bundle.summary?.reservedOccurrenceCount,
    }));
  }
}

function compareScalar(target, field, traceValue, xmlValue) {
  if (normalizeScalar(traceValue) !== normalizeScalar(xmlValue)) {
    target.push({ field, trace: traceValue ?? null, xml: xmlValue ?? null });
  }
}
function compareExact(target, field, traceValue, xmlValue) {
  if (canonicalSemanticJson(traceValue ?? null) !== canonicalSemanticJson(xmlValue ?? null)) {
    target.push({ field, trace: traceValue ?? null, xml: xmlValue ?? null });
  }
}

function parsePsiXml(xmlText, side, issues) {
  const branches = xmlBlocks(xmlText, 'Branch').map((block, branchIndex) => parseBranch(block, branchIndex));
  if (!branches.length && text(xmlText)) issues.push(issue('XML_TRACE_BUNDLE_MISMATCH', side, 'XML_BRANCH_PARSE_FAILED'));
  return { branches, nodes: branches.flatMap((branch) => branch.nodes) };
}
function parseBranch(block, branchIndex) {
  const branchName = tagText(block, 'Branchname').value;
  const conditions = {
    temperatures: numberedValues(block, 'Temperature', 9),
    pressures: numberedValues(block, 'Pressure', 9),
    materialNumber: scalarValue(block, 'MaterialNumber'),
    insulationDensity: scalarValue(block, 'InsulationDensity'),
    fluidDensity: scalarValue(block, 'FluidDensity'),
  };
  const nodes = xmlBlocks(block, 'Node').map((node, nodeIndex) => parseNode(node, {
    branchName, branchIndex, nodeIndex,
  }));
  return { branchName, branchIndex, conditions, nodes };
}
function parseNode(block, location) {
  const fields = {};
  for (const field of ENGINEERING_FIELDS) fields[field] = nodeField(block, field);
  fields.Restraints = xmlBlocks(block, 'Restraint').map(normalizeXmlBlock);
  return {
    ...location, nodeNumber: integerValue(block, 'NodeNumber'),
    componentType: tagText(block, 'ComponentType').value,
    endpoint: integerValue(block, 'Endpoint'), engineering: fields,
  };
}
function nodeField(block, field) {
  if (field === 'Position') return positionValue(block);
  const tagged = tagText(block, field);
  if (!tagged.present) return { present: false, value: null };
  if (!NUMERIC_NODE_FIELDS.has(field)) return tagged;
  return { present: true, value: strictNumber(tagged.value) };
}
function positionValue(block) {
  const tagged = tagText(block, 'Position');
  if (!tagged.present) return { present: false, value: null };
  const values = tagged.value.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/g) || [];
  return values.length === 3 ? { present: true, value: values.map(Number) }
    : { present: true, value: tagged.value };
}
function numberedValues(block, prefix, count) {
  return Array.from({ length: count }, (_, index) => scalarValue(block, `${prefix}${index + 1}`));
}
function scalarValue(block, tagName) {
  const tagged = tagText(block, tagName);
  return tagged.present ? { present: true, value: strictNumber(tagged.value) }
    : { present: false, value: null };
}
function integerValue(block, tagName) {
  const value = tagText(block, tagName);
  return /^[-+]?\d+$/.test(value.value) ? Number(value.value) : value.value;
}
function strictNumber(value) {
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?$/.test(text(value))) return value;
  const number = Number(value);
  return Object.is(number, -0) ? 0 : number;
}
function groupTrace(trace) {
  const groups = new Map();
  for (const row of trace) {
    const occurrenceId = text(row?.occurrenceId), rows = groups.get(occurrenceId) || [];
    rows.push(row); groups.set(occurrenceId, rows);
  }
  return groups;
}
function groupEntries(groups) {
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([occurrenceId, rows]) => ({ occurrenceId, rows: stableRows(rows) }));
}
function stableRows(rows) {
  return [...rows].sort((a, b) => canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)));
}
function xmlBlocks(value, tagName) {
  return String(value ?? '').match(new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`, 'g')) || [];
}
function tagText(value, tagName) {
  const match = String(value ?? '').match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? { present: true, value: decodeXml(text(match[1])) } : { present: false, value: null };
}
function normalizeXmlBlock(value) {
  return decodeXml(String(value ?? '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim());
}
function decodeXml(value) {
  return String(value ?? '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, raw) => String.fromCodePoint(
    raw[0].toLowerCase() === 'x' ? Number.parseInt(raw.slice(1), 16) : Number(raw),
  )).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
async function shaSemantic(value) { return computeTextHash(canonicalSemanticJson(value)); }
function validTimestamp(value) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
    && !Number.isNaN(Date.parse(raw));
}
function issue(code, side, reason, evidence = {}) { return { code, side, reason, evidence }; }
function normalizeScalar(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function hex(value) { return value.toString(16).padStart(2, '0'); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
