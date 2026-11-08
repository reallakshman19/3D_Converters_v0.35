/** Machine-readable verified byte-span audit; source CII is not modified. */
import { ciiSha256 } from './xml-cii-final-property-reader.js';
export async function buildCiiChangeAudit(session, revised, entries, revisedText, reparsed) {
  const revisedSha256 = await ciiSha256(revised);
  const changes = entries.map((entry) => ({
    propertyId: entry.propertyId, section: session.registry.get(entry.propertyId).section,
    recordPointer: entry.recordPointer, byteStart: entry.start, byteEndExclusive: entry.end,
    originalToken: entry.originalToken, originalValue: entry.originalValue,
    requestedValue: entry.requestedValue, newValue: entry.newValue,
    unit: entry.unit, reference: entry.reference, confirmed: entry.confirmed,
  }));
  const baseName = session.filename.replace(/\.cii$/i, '');
  return { revisedCiiText: revisedText, revisedName: baseName + '_revised.cii',
    auditName: baseName + '_change-audit.json',
    audit: { schema: 'cii-final-property-edit-audit/v1',
      runIdentity: session.runIdentity, filename: session.filename,
      originalSha256: session.originalSha256, revisedSha256,
      originalByteLength: session.index.bytes.length, revisedByteLength: revised.length,
      declaredCounts: reparsed.declared, authorization: 'explicit-user-edits',
      verified: true, untouchedBytesEqual: true, changes } };
}
