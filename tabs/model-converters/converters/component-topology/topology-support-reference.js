/**
 * Resolves producer-owned support attachment references to route components.
 * ATTACHED_COMPONENT_REF and COMPRE are authoritative only when they identify a
 * route component in the owning branch, or one globally unique route component.
 */

import { cleanText, uniqueText } from './topology-values.js';

const ATTACHMENT_REFERENCE_FIELDS = Object.freeze(['ATTACHED_COMPONENT_REF', 'COMPRE']);

/** @param {Record<string, unknown>} component @returns {string[]} */
function aliases(component) {
  return uniqueText([
    component.sourceRef,
    component.name,
    component.attributes?.REF,
    component.attributes?.NAME,
  ]);
}

/** @param {Record<string, unknown>} model @returns {Readonly<Record<string, Map<string, Record<string, unknown>[]>>>} */
export function buildSupportAttachmentIndex(model) {
  const byBranchAlias = new Map();
  const byAlias = new Map();
  for (const component of model.components.filter((row) => row.isRouteComponent === true)) {
    for (const alias of aliases(component)) {
      const branchKey = `${component.sourceBranchEntityId}|${alias}`;
      byBranchAlias.set(branchKey, [...(byBranchAlias.get(branchKey) ?? []), component]);
      byAlias.set(alias, [...(byAlias.get(alias) ?? []), component]);
    }
  }
  return Object.freeze({ byBranchAlias, byAlias });
}

/** @param {Record<string, unknown>} component @returns {string[]} */
function attachmentReferences(component) {
  return uniqueText(ATTACHMENT_REFERENCE_FIELDS.map((field) => component.attributes?.[field]));
}

/** @param {Record<string, unknown>} component @param {Readonly<Record<string, Map<string, Record<string, unknown>[]>>>} index @returns {Readonly<Record<string, unknown>>} */
export function resolveSupportAttachment(component, index) {
  const references = attachmentReferences(component);
  const resolved = [];
  const unresolved = [];
  for (const reference of references) {
    const branchMatches = index.byBranchAlias.get(`${component.sourceBranchEntityId}|${reference}`) ?? [];
    if (branchMatches.length === 1) {
      resolved.push(branchMatches[0]);
      continue;
    }
    const globalMatches = index.byAlias.get(reference) ?? [];
    if (globalMatches.length === 1) resolved.push(globalMatches[0]);
    else unresolved.push(reference);
  }
  return Object.freeze({
    references,
    sourceEntityIds: uniqueText(resolved.map((row) => row.sourceEntityId)),
    sourcePaths: uniqueText(resolved.map((row) => row.sourcePath)),
    unresolvedReferences: uniqueText(unresolved),
    authority: resolved.length ? 'ATTACHED_COMPONENT_REF/COMPRE' : '',
  });
}

export const _test = Object.freeze({ aliases, attachmentReferences });
