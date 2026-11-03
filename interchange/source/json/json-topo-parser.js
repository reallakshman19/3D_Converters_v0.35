/**
 * json-topo-parser.js
 * Generic JSON geometry extraction for Topo Builder.
 */

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toPoint(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const x = toFiniteNumber(candidate.x ?? candidate.X ?? candidate[0]);
  const y = toFiniteNumber(candidate.y ?? candidate.Y ?? candidate[1]);
  const z = toFiniteNumber(candidate.z ?? candidate.Z ?? candidate[2]);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function pointFromBBox(obj, pickMax) {
  const bbox = obj?.bbox || obj?.boundingBox || obj?.bounds || null;
  if (!bbox || typeof bbox !== 'object') return null;
  const min = toPoint(bbox.min || bbox.minPoint || bbox.minimum || bbox.low);
  const max = toPoint(bbox.max || bbox.maxPoint || bbox.maximum || bbox.high);
  if (!min || !max) return null;
  if (pickMax) return max;
  return min;
}

function isLikelySupport(raw, pathText) {
  const text = `${raw?.type || ''} ${raw?.name || ''} ${raw?.sKey || ''} ${raw?.SKEY || ''} ${pathText || ''}`;
  return /support|clamp|hanger|pipesupp/i.test(text);
}

function extractSegmentFromObject(obj, pathText, index) {
  let ep1 = toPoint(obj?.ep1)
    || toPoint(obj?.start)
    || toPoint(obj?.from)
    || toPoint(obj?.p1)
    || (Array.isArray(obj?.points) ? toPoint(obj.points[0]) : null)
    || pointFromBBox(obj, false);

  let ep2 = toPoint(obj?.ep2)
    || toPoint(obj?.end)
    || toPoint(obj?.to)
    || toPoint(obj?.p2)
    || (Array.isArray(obj?.points) && obj.points.length > 1 ? toPoint(obj.points[1]) : null)
    || pointFromBBox(obj, true);

  const cp = toPoint(obj?.cp || obj?.center || obj?.centre || obj?.controlPoint);
  const bp = toPoint(obj?.bp || obj?.branch || obj?.branchPoint);

  // For OLET-type components, cp (header tap) and bp (branch outlet) are the primary
  // connectivity points. Use them as ep1/ep2 fallbacks before the null guard so that
  // OLETs specified with only cp/bp are not silently dropped.
  const typeText = String(obj?.type || obj?.kind || obj?.componentType || 'PIPE').toUpperCase();
  const isOletType = typeText === 'OLET' || typeText === 'WELDOLET' || typeText === 'SOCKOLET';
  if (isOletType) {
    if (!ep1 && cp) ep1 = { x: cp.x, y: cp.y, z: cp.z };
    if (!ep2 && bp) ep2 = { x: bp.x, y: bp.y, z: bp.z };
  }

  if (!ep1 || !ep2) return null;

  const supportCoord = toPoint(obj?.supportCoord || obj?.coOrds || obj?.coord || obj?.position || obj?.origin);

  const raw = {
    ...obj,
    LINE_NO: obj?.lineNo || obj?.LINE_NO || obj?.line || '',
    SKEY: obj?.sKey || obj?.SKEY || obj?.type || 'PIPE',
  };

  const support = isLikelySupport(raw, pathText) || typeText === 'SUPPORT';

  return {
    id: String(obj?.id || obj?.name || `JSON-${index + 1}`),
    type: support ? 'SUPPORT' : typeText,
    ep1,
    ep2,
    cp,
    bp,
    supportCoord,
    rawAttributes: raw,
    sourceRefs: [{ format: 'JSON', sourceId: pathText || `PATH:${index + 1}` }],
    path: pathText,
  };
}

function walk(value, pathText, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, idx) => walk(item, `${pathText}[${idx}]`, visitor));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visitor(value, pathText);
  for (const [key, child] of Object.entries(value)) {
    walk(child, pathText ? `${pathText}.${key}` : key, visitor);
  }
}

export function parseJsonToTopoInput(jsonText) {
  const payload = JSON.parse(String(jsonText || '{}'));
  const segments = [];
  const supports = [];
  const messages = [];

  let index = 0;
  walk(payload, '', (obj, pathText) => {
    const parsed = extractSegmentFromObject(obj, pathText, index);
    index += 1;
    if (!parsed) return;
    if (parsed.type === 'SUPPORT') supports.push(parsed);
    else segments.push(parsed);
  });

  if (!segments.length && !supports.length) {
    messages.push({ level: 'WARN', message: 'JSON import found no endpoint pairs; check mapping templates or source structure.' });
  }

  return {
    format: 'JSON',
    segments,
    supports,
    annotations: [],
    messages,
    rawJson: payload,
  };
}
