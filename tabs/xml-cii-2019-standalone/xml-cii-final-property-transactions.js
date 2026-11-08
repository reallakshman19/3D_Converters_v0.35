/** R1 public API: schema-driven property transaction orchestration, no property-specific branches. */
export { CiiPropertyRegistry, productionCiiProperties } from './xml-cii-final-property-registry.js';
export { ciiSha256 } from './xml-cii-final-property-reader.js';
export { createCiiPropertySession, stageCiiPropertyEdit, resetCiiPropertyEdit, resetAllCiiPropertyEdits } from './xml-cii-final-property-session.js';
import { assert } from './xml-cii-final-property-validation.js';
import { ciiSha256 } from './xml-cii-final-property-reader.js';
import { patchAuthorizedFields } from './xml-cii-final-property-patcher.js';
import { verifyRevisedCii } from './xml-cii-final-property-verifier.js';
import { buildCiiChangeAudit } from './xml-cii-final-property-audit.js';
export async function verifyCiiPropertyTransaction(session, options = {}) {
  assert(options.runIdentity === session.runIdentity, 'stale conversion run identity');
  assert(options.currentCiiText === session.originalCiiText, 'source CII content changed');
  const fingerprint = await ciiSha256(options.currentCiiText);
  assert(fingerprint === session.originalSha256, 'stale source CII fingerprint');
  const entries = [...session.edits.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  const revised = patchAuthorizedFields(session, entries);
  const { revisedText, reparsed } = verifyRevisedCii(session, revised, entries);
  return buildCiiChangeAudit(session, revised, entries, revisedText, reparsed);
}
