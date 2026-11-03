import {
  canonicalSemanticJson, deepFreeze, isRecord, text,
} from '../../../contracts/topo-enriched-xml/contract-core.js';

export function issue(code, evidence = {}) {
  return { code, evidence };
}

export function array(value) {
  return Array.isArray(value) ? value : [];
}

export function record(value) {
  return isRecord(value) ? value : null;
}

export function makeValidation(blockers = [], reviewItems = [], warnings = []) {
  const b = dedupeIssues(blockers);
  const r = dedupeIssues(reviewItems);
  return deepFreeze({
    status: b.length ? 'BLOCKED' : (r.length ? 'REVIEW_REQUIRED' : 'PASS'),
    blockers: b,
    reviewItems: r,
    warnings: dedupeIssues(warnings),
  });
}

export function dedupeIssues(rows) {
  const seen = new Set();
  return array(rows).filter((row) => {
    const key = canonicalSemanticJson(row, { excludedKeys: [] });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => issueKey(a).localeCompare(issueKey(b)));
}

export function addContractIssues(target, api, value, code) {
  const errors = api.validate(value);
  if (errors.length) target.push(issue(code, { errors }));
}

export function requirePass(target, value, code) {
  if (value?.validation?.status !== 'PASS') {
    target.push(issue(code, {
      status: text(value?.validation?.status),
      blockers: array(value?.validation?.blockers),
      reviewItems: array(value?.validation?.reviewItems),
    }));
  }
}

export function compareExact(target, code, field, expected, actual) {
  if (canonicalSemanticJson(expected, { excludedKeys: [] }) !== canonicalSemanticJson(actual, { excludedKeys: [] })) {
    target.push(issue(code, { field, expected, actual }));
  }
}

export function compareText(target, code, field, expected, actual) {
  const left = text(expected);
  const right = text(actual);
  if (left !== right) target.push(issue(code, { field, expected: left, actual: right }));
}

export function validTimestamp(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, offsetHour = '00', offsetMinute = '00'] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const days = [31, leapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1]
    && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59
    && Number(offsetHour) <= 23 && Number(offsetMinute) <= 59;
}

export async function shaSemantic(value) {
  return shaText(canonicalSemanticJson(value));
}

export async function shaText(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map(hex).join('')}`;
}

export function sortCanonical(rows) {
  return structuredClone(array(rows)).sort((a, b) => (
    canonicalSemanticJson(a, { excludedKeys: [] })
      .localeCompare(canonicalSemanticJson(b, { excludedKeys: [] }))
  ));
}

export function freeze(value) {
  return deepFreeze(structuredClone(value));
}

export function assertUnchanged(value, before, owner) {
  const after = canonicalSemanticJson(value, { excludedKeys: [] });
  if (after !== before) throw new Error(`${owner} mutated its input.`);
}

export function snapshot(value) {
  return canonicalSemanticJson(value, { excludedKeys: [] });
}

export function hashPattern(value) {
  return /^sha256:[a-f0-9]{64}$/.test(text(value));
}

function issueKey(row) {
  return `${text(row?.code)}|${canonicalSemanticJson(row?.evidence || {}, { excludedKeys: [] })}`;
}

function leapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function hex(value) {
  return value.toString(16).padStart(2, '0');
}
