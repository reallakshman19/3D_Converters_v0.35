/**
 * Row-level PCF support matching adapter.
 * Converts PCF row fields into support-mapping-compatible lookup keys.
 * Support kind/rule semantics remain owned by support-mapping.js.
 */
import {
  toFiniteNumber,
  toText,
} from './config.js';
import { resolveXmlCiiSupportDescriptor } from './support-mapping.js';

function parseNumericMm(value) {
  const text = toText(value).replace(/mm/gi, ' ').trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizePcfSupportPoint(point) {
  if (point === undefined || point === null || point === '') return null;

  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }

  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X ?? point.e ?? point.E);
    const y = Number(point.y ?? point.Y ?? point.n ?? point.N ?? point.s ?? point.S);
    const z = Number(point.z ?? point.Z ?? point.u ?? point.U ?? point.d ?? point.D);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }

  const text = toText(point).trim();
  if (!text) return null;

  const tokens = text.split(/\s+/g);
  const directional = { x: 0, y: 0, z: 0 };
  let parsedDirectional = false;

  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const value = parseNumericMm(tokens[i + 1]);
    if (!Number.isFinite(value)) continue;

    if (axis === 'E') { directional.x = value; parsedDirectional = true; }
    else if (axis === 'W') { directional.x = -value; parsedDirectional = true; }
    else if (axis === 'N') { directional.y = value; parsedDirectional = true; }
    else if (axis === 'S') { directional.y = -value; parsedDirectional = true; }
    else if (axis === 'U') { directional.z = value; parsedDirectional = true; }
    else if (axis === 'D') { directional.z = -value; parsedDirectional = true; }
  }

  if (parsedDirectional) return directional;

  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

export function pcfSupportPositionKey(point, tolerance = 1) {
  const parsed = normalizePcfSupportPoint(point);
  if (!parsed) return '';
  const tol = toFiniteNumber(tolerance, 1) || 1;
  return [parsed.x, parsed.y, parsed.z]
    .map((value) => Math.round(value / tol))
    .join('|');
}

export function normalizeSupportTag(value) {
  const text = toText(value).trim().toUpperCase().replace(/^\/+/, '').replace(/\s+/g, ' ');
  const match = text.match(/PS-\d+(?:\.\d+)?/i);
  return match ? match[0].toUpperCase() : '';
}

function supportTagBase(value) {
  return normalizeSupportTag(value).replace(/\.\d+$/, '');
}

export function supportTagsFromPcfRow(row = {}) {
  const tags = new Set();
  const addFromText = (value) => {
    for (const match of toText(value).matchAll(/\/?PS-\d+(?:\.\d+)?/ig)) {
      const tag = normalizeSupportTag(match[0]);
      if (tag) tags.add(tag);
    }
  };

  addFromText(row.nodeName);
  addFromText(row.name);
  addFromText(row.supportName);
  addFromText(row.refNo);
  addFromText(row.componentRefNo);
  addFromText(row.sourceCanonicalId);

  for (const [key, value] of Object.entries(row.attributes || row.raw || {})) {
    if (value && typeof value === 'object') continue;
    addFromText(`${key} ${value}`);
  }

  return [...tags];
}

function directDescriptorMatch(row, config = {}) {
  const descriptor = resolveXmlCiiSupportDescriptor(row?.attributes || row?.raw || {}, config);
  if (!descriptor?.primaryKind) return null;
  return {
    primaryKind: descriptor.primaryKind,
    kinds: descriptor.kinds?.length ? descriptor.kinds : [descriptor.primaryKind],
    dofs: descriptor.dofs || {},
    supportDescriptorSource: descriptor.source,
    point: row?.supportCoor || row?.cp || row?.ep1 || row?.position || null,
    attrs: row?.attributes || row?.raw || {},
  };
}

export function resolveSupportMatchForPcfRow(row, supportIndex, config = {}) {
  const tolerance = toFiniteNumber(config.coordinateTolerance, 1) || 1;
  const point = row?.supportCoor || row?.cp || row?.ep1 || row?.position;
  const coordKey = pcfSupportPositionKey(point, tolerance);
  const tags = supportTagsFromPcfRow(row);

  for (const tag of tags) {
    if (supportIndex?.byTag?.has(tag)) {
      return supportIndex.byTag.get(tag)[0] || null;
    }
  }

  const coordMatches = coordKey && supportIndex?.byCoord?.has(coordKey)
    ? supportIndex.byCoord.get(coordKey)
    : [];
  const baseTags = new Set(tags.map(supportTagBase).filter(Boolean));
  const relaxedSamePosition = coordMatches.find((match) => {
    const stagedBaseTags = Array.isArray(match?.supportBaseTags) ? match.supportBaseTags : [];
    return stagedBaseTags.some((tag) => baseTags.has(tag));
  });
  if (relaxedSamePosition) return relaxedSamePosition;

  if (coordMatches.length) return coordMatches[0] || null;

  return directDescriptorMatch(row, config);
}
