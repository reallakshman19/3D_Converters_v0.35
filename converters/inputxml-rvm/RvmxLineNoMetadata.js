/**
 * Shared Line No. / branch metadata normalization for GLB export and display.
 *
 * Inputs are raw XML attributes, UXML component fields, GLB userData values, or
 * node-wise sideload values. Outputs are stable display strings. Windows
 * filesystem paths are reduced to empty values so CAESAR JOBNAME paths do not
 * leak into viewer metadata.
 */

export const LINE_NO_METADATA_KEYS = Object.freeze([
  'lineNo',
  'LineNo',
  'Line No',
  'LINE_NO',
  'LINENO',
  'LineNumber',
  'Line Number',
  'LINE_NUMBER',
  'Pipeline',
  'PipeLine',
  'pipeline',
  'pipelineRef',
  'PipelineRef',
  'PIPELINE_REF',
  'BranchName',
  'Branch Name',
  'branchName',
  'BRANCH_NAME',
  'LineName',
  'Line Name',
  'lineName',
  'LINE_NAME',
  'lineKey',
  'LineKey',
  'LINE_KEY',
]);

function text(value) {
  return String(value ?? '').trim();
}

function stripOuterQuotes(value) {
  return text(value).replace(/^["']+|["']+$/g, '').trim();
}

function isFilesystemPathLike(value) {
  const raw = stripOuterQuotes(value);
  return /^[A-Za-z]:[\\/]/.test(raw) || /^\\\\/.test(raw) || raw.includes('\\');
}

function isProvenanceTraceLike(value) {
  const raw = stripOuterQuotes(value);
  if (!raw) return false;
  if (!raw.includes('->')) return false;
  return /(input\s*xml|inputxml|isonote|sideload|glb|source|variant|benchmark|\.xml\b)/i.test(raw);
}

export function normalizeLineNoValue(value) {
  const raw = stripOuterQuotes(value);
  if (!raw || /^(null|undefined|nan)$/i.test(raw)) return '';
  if (/^-?1\.010100$/.test(raw)) return '';
  if (/^(CAESAR-INPUTXML|UNASSIGNED)$/i.test(raw)) return '';
  if (isFilesystemPathLike(raw)) return '';
  if (isProvenanceTraceLike(raw)) return '';
  return raw;
}

export function metadataValueFromKeys(source, keys) {
  if (!source || typeof source !== 'object') return '';
  const lookupKeys = Array.isArray(keys) && keys.length ? keys : LINE_NO_METADATA_KEYS;
  const sourceKeys = Object.keys(source);
  for (const key of lookupKeys) {
    if (source[key] != null && text(source[key])) return text(source[key]);
    const found = sourceKeys.find((candidate) => candidate.toLowerCase() === String(key).toLowerCase());
    if (found && text(source[found])) return text(source[found]);
  }
  return '';
}

export function lineNoFromMetadata(source, keys) {
  return normalizeLineNoValue(metadataValueFromKeys(source, keys));
}

export function firstLineNoValue(...values) {
  for (const value of values) {
    const normalized = normalizeLineNoValue(value);
    if (normalized) return normalized;
  }
  return '';
}
