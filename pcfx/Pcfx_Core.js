/**
 * Pcfx_Core.js
 * Canonical `.pcfx` document helpers for parse, validation, normalization, and stringify.
 * Inputs are plain JavaScript objects or JSON text. Outputs are normalized documents/items.
 */

const PCFX_FORMAT = 'pcfx';
const PCFX_VERSION = '1.0.0';

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePoint(value) {
  if (!value || typeof value !== 'object') return null;

  const x = toFiniteNumber(value.x);
  const y = toFiniteNumber(value.y);
  const z = toFiniteNumber(value.z);

  if (x === null || y === null || z === null) return null;

  const normalized = { x, y, z };
  const bore = toFiniteNumber(value.bore);
  if (bore !== null) normalized.bore = bore;
  return normalized;
}

function normalizeDiagnostic(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    level: toText(src.level || 'INFO').toUpperCase(),
    code: toText(src.code || 'PCFX_DIAGNOSTIC'),
    message: toText(src.message || ''),
    context: cloneJson(src.context && typeof src.context === 'object' ? src.context : {}),
  };
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? cloneJson(value) : {};
}

/**
 * Normalize one canonical item so every converter uses the same shape.
 * @param {object} item
 * @returns {object}
 */
export function normalizeCanonicalItem(item) {
  const src = item && typeof item === 'object' ? item : {};
  const attrs = normalizeObject(src.attrs);
  const refNo = toText(src.refNo || attrs.CA97 || src.id || '');
  const seqNo = toText(src.seqNo || attrs.CA98 || '');

  if (refNo && !attrs.CA97) attrs.CA97 = refNo;
  if (seqNo && !attrs.CA98) attrs.CA98 = seqNo;

  return {
    id: toText(src.id || refNo || `pcfx-${seqNo || 'item'}`),
    type: toText(src.type || 'UNKNOWN').toUpperCase(),
    refNo,
    seqNo,
    pipelineRef: toText(src.pipelineRef || ''),
    lineNoKey: toText(src.lineNoKey || ''),
    ep1: normalizePoint(src.ep1),
    ep2: normalizePoint(src.ep2),
    cp: normalizePoint(src.cp),
    bp: normalizePoint(src.bp || src.branchPoint),
    branchPoint: normalizePoint(src.branchPoint || src.bp),
    supportCoord: normalizePoint(src.supportCoord),
    bore: toFiniteNumber(src.bore),
    branchBore: toFiniteNumber(src.branchBore),
    wall: toFiniteNumber(src.wall),
    corr: toFiniteNumber(src.corr),
    material: toText(src.material || ''),
    pipingClass: toText(src.pipingClass || ''),
    rating: toText(src.rating || ''),
    attrs,
    process: normalizeObject(src.process),
    support: normalizeObject(src.support),
    extras: normalizeObject(src.extras),
    rawBySource: normalizeObject(src.rawBySource),
  };
}

/**
 * Create a normalized `.pcfx` document.
 * @param {object} input
 * @returns {object}
 */
export function createPcfxDocument(input) {
  const src = input && typeof input === 'object' ? input : {};
  const items = Array.isArray(src.items) ? src.items : [];
  const diagnostics = Array.isArray(src.diagnostics) ? src.diagnostics : [];
  const producer = src.producer && typeof src.producer === 'object' ? src.producer : {};

  return {
    format: PCFX_FORMAT,
    version: PCFX_VERSION,
    producer: {
      app: toText(producer.app || ''),
      version: toText(producer.version || ''),
    },
    metadata: normalizeObject(src.metadata),
    canonical: {
      items: items.map((item) => normalizeCanonicalItem(item)),
    },
    sourceSnapshots: normalizeObject(src.sourceSnapshots),
    diagnostics: diagnostics.map((entry) => normalizeDiagnostic(entry)),
  };
}

/**
 * Validate a `.pcfx` document shape without mutating it.
 * @param {object} doc
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePcfxDocument(doc) {
  const errors = [];
  const src = doc && typeof doc === 'object' ? doc : null;

  if (!src) {
    errors.push('PCFX document must be an object.');
    return { ok: false, errors };
  }
  if (src.format !== PCFX_FORMAT) errors.push(`PCFX document format must be "${PCFX_FORMAT}".`);
  if (src.version !== PCFX_VERSION) errors.push(`PCFX document version must be "${PCFX_VERSION}".`);
  if (!src.canonical || !Array.isArray(src.canonical.items)) errors.push('PCFX document must contain canonical.items[].');
  if (src.metadata !== undefined && (typeof src.metadata !== 'object' || Array.isArray(src.metadata))) errors.push('PCFX metadata must be an object.');
  if (src.sourceSnapshots !== undefined && (typeof src.sourceSnapshots !== 'object' || Array.isArray(src.sourceSnapshots))) errors.push('PCFX sourceSnapshots must be an object.');
  if (src.diagnostics !== undefined && !Array.isArray(src.diagnostics)) errors.push('PCFX diagnostics must be an array.');
  return { ok: errors.length === 0, errors };
}

/**
 * Parse JSON text into a normalized `.pcfx` document.
 * @param {string} text
 * @returns {object}
 */
export function parsePcfxText(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch (error) {
    throw new Error(`Failed to parse PCFX JSON: ${String(error && error.message ? error.message : error)}`);
  }

  const validation = validatePcfxDocument(parsed);
  if (!validation.ok) {
    throw new Error(`Invalid PCFX document: ${validation.errors.join(' ')}`);
  }

  return createPcfxDocument({
    producer: parsed.producer,
    metadata: parsed.metadata,
    items: parsed.canonical.items,
    sourceSnapshots: parsed.sourceSnapshots,
    diagnostics: parsed.diagnostics,
  });
}

/**
 * Serialize a normalized document to JSON text.
 * @param {object} doc
 * @returns {string}
 */
export function stringifyPcfxDocument(doc) {
  const normalized = createPcfxDocument({
    producer: doc && doc.producer,
    metadata: doc && doc.metadata,
    items: doc && doc.canonical ? doc.canonical.items : [],
    sourceSnapshots: doc && doc.sourceSnapshots,
    diagnostics: doc && doc.diagnostics,
  });
  return JSON.stringify(normalized, null, 2);
}
