/**
 * Support projection policy for component topology.
 * Inputs: immutable managed-source support attributes. Output: one explicit
 * EMIT_SUPPORT_ATTACHMENT or DEFER_SUPPORT decision with evidence. Generic
 * annotation attachments are never promoted to CAESAR restraints silently.
 */

import { cleanText } from './topology-values.js';

const EXPLICIT_RESTRAINT_FIELDS = Object.freeze([
  'SUPPORT_KIND', 'SUPPORT_MAPPER_KIND', 'SUPPORT_TYPE', 'CMPSUPTYPE',
  'MDSSUPPTYPE', 'CMPSTRESSN',
]);

const RESTRAINT_TEXT = /\b(ANCHOR|FIXED|GUIDE|LINE\s*STOP|LINESTOP|SPRING|HANGER|REST|SHOE|BASE\s*PLATE|PIPE\s*SUPPORT)\b/i;
const NON_RESTRAINT_ATTACHMENT_TEXT = /\b(FENCE|FLOOR|WALL|ROOF|SLAB)\b[\s\S]*\b(OPENING|PENETRATION|SLEEVE)\b|\b(OPENING|PENETRATION|SLEEVE)\b[\s\S]*\b(FENCE|FLOOR|WALL|ROOF|SLAB)\b/i;
const EMPTY_MARKERS = new Set(['', '0', 'NONE', 'UNSET', 'FALSE', 'N/A', 'NA']);

/** @param {unknown} value @returns {boolean} */
function meaningful(value) {
  const normalized = cleanText(value).toUpperCase();
  return !EMPTY_MARKERS.has(normalized);
}

/** @param {Record<string, unknown>} attributes @returns {{field:string,value:string}|null} */
function explicitRestraintEvidence(attributes) {
  for (const field of EXPLICIT_RESTRAINT_FIELDS) {
    if (meaningful(attributes[field])) return { field, value: cleanText(attributes[field]) };
  }
  const nodeType = Number(attributes.NODETYPE);
  if (Number.isFinite(nodeType) && nodeType > 0) return { field: 'NODETYPE', value: cleanText(attributes.NODETYPE) };
  const stiffness = Number(String(attributes.NODESTIFF ?? '').replace(/[^0-9.-]/g, ''));
  if (Number.isFinite(stiffness) && stiffness > 0) return { field: 'NODESTIFF', value: cleanText(attributes.NODESTIFF) };
  return null;
}

/** @param {Record<string, unknown>} attributes @returns {Readonly<Record<string, string>>} */
export function classifySupportProjection(attributes = {}) {
  const explicit = explicitRestraintEvidence(attributes);
  if (explicit) return Object.freeze({
    disposition: 'EMIT_SUPPORT_ATTACHMENT',
    authority: `ATTRIBUTE:${explicit.field}`,
    reason: `${explicit.field} provides explicit stress-support evidence (${explicit.value}).`,
  });

  const description = [attributes.DTXR, attributes.ISONOTE, attributes.DESCRIPTION]
    .map(cleanText).filter(Boolean).join(' | ');
  if (NON_RESTRAINT_ATTACHMENT_TEXT.test(description) && !RESTRAINT_TEXT.test(description)) {
    return Object.freeze({
      disposition: 'DEFER_SUPPORT',
      authority: 'NON_RESTRAINT_ATTACHMENT_DESCRIPTION',
      reason: `Attachment describes an opening/penetration without restraint evidence: ${description}`,
    });
  }
  if (RESTRAINT_TEXT.test(description)) return Object.freeze({
    disposition: 'EMIT_SUPPORT_ATTACHMENT',
    authority: 'DESCRIPTION_RESTRAINT_SEMANTICS',
    reason: `Description contains explicit restraint semantics: ${description}`,
  });
  return Object.freeze({
    disposition: 'EMIT_SUPPORT_ATTACHMENT',
    authority: 'LEGACY_ATTA_FALLBACK',
    reason: 'No explicit non-restraint classification was found; preserve the legacy ATTA-to-REST policy.',
  });
}

export const _test = Object.freeze({
  explicitRestraintEvidence,
  meaningful,
});
