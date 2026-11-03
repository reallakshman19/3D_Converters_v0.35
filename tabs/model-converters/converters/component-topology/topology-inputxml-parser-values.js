/** Lexical and numeric helpers for the InputXML topology parser. */
import { cleanText, uniqueText } from './topology-values.js';

export function decodeXml(value) {
  return String(value ?? '')
    .replaceAll('&quot;', '"').replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

export function parseAttributes(source) {
  const attributes = {};
  String(source ?? '').replace(/([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/g, (_match, name, _quote, value) => {
    attributes[name.toUpperCase()] = decodeXml(value);
    return '';
  });
  return attributes;
}

export function attribute(attributes, name) {
  const target = name.toUpperCase();
  if (Object.hasOwn(attributes, target)) return cleanText(attributes[target]);
  const key = Object.keys(attributes).find((candidate) => candidate.endsWith(`:${target}`));
  return key ? cleanText(attributes[key]) : '';
}

export function finiteNumber(value) {
  if (value === null || value === undefined || cleanText(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeNodeId(value) {
  const number = finiteNumber(value);
  if (number === null) return cleanText(value);
  return Math.abs(number - Math.round(number)) < 1e-9 ? String(Math.round(number)) : String(number);
}

export function normalizedNumber(value, decimals) {
  const number = finiteNumber(value);
  return number === null ? null : Number(number.toFixed(decimals));
}

export function point(attrs, prefix, decimals) {
  const values = ['X', 'Y', 'Z'].map((axis) => normalizedNumber(attribute(attrs, `${prefix}_${axis}`), decimals));
  return values.every((value) => value !== null) ? { x: values[0], y: values[1], z: values[2] } : null;
}

export function list(value) {
  return uniqueText(cleanText(value).split(/[|,;\s]+/));
}
