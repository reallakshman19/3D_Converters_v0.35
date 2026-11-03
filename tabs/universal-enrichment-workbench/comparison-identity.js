import { sha256Hex } from './source-envelope.js';

export function canonicalComparisonJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalComparisonJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const rows = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalComparisonJson(value[key])}`);
    return `{${rows.join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function createComparisonIdentity(prefix, evidence, hashText = sha256Hex) {
  const hash = await hashText(canonicalComparisonJson(evidence));
  return `${prefix}-${hash.slice(0, 32)}`;
}

export function graphComparisonIdentity(graph) {
  return {
    sourceFileId: graph?.sourceFileId || '',
    sourceRevision: graph?.sourceRevision || 0,
    sourceContentHash: graph?.contentHash || '',
    sourceGraphSchema: graph?.schema || '',
  };
}
