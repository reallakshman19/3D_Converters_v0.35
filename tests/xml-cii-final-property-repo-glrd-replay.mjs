import { strict as assert } from 'node:assert';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createCiiPropertySession, stageCiiPropertyEdit, verifyCiiPropertyTransaction } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-transactions.js';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';

const source = process.argv[2];
const evidenceDir = process.argv[3];
assert.ok(source && evidenceDir, 'usage: node <script> <authentic-generated.cii> <out-dir>');
const originalCii = await readFile(source, 'utf8');
const inventory = parseFinalCiiRigidInventory(originalCii);
assert.ok(inventory.rows.length, 'authentic source converter must emit at least one RIGID');
const session = await createCiiPropertySession(originalCii, {
  runIdentity: 'REPO-GLRD-PI-01-NATIVE-WRITER',
  filename: 'GLRD-1000-PI-01.cii',
});
const selected = [...new Set([1, inventory.rows.length])];
for (const pointer of selected) {
  const row = inventory.rows[pointer - 1];
  const newValue = String(pointer + 12000);
  stageCiiPropertyEdit(session, {
    propertyId: 'RIGID.weight', recordPointer: pointer,
    originalToken: row.rawWeight, newValue,
    unit: 'CII_OUTPUT_WEIGHT', confirmed: true,
    reference: { source: 'manual replay probe; not approved mass' },
  });
}
const verified = await verifyCiiPropertyTransaction(session, {
  runIdentity: session.runIdentity, currentCiiText: originalCii,
});
const reparsed = parseFinalCiiRigidInventory(verified.revisedCiiText);
assert.deepEqual(reparsed.declared, inventory.declared);
for (const pointer of selected) {
  assert.equal(reparsed.rows[pointer - 1].weight, Number(pointer + 12000));
}
const summary = {
  source: 'Benchmarks/XML to CII 2019/GLRD-1000-PI-01.xml',
  status: 'REPOSITORY_SOURCE_SMOKE_ONLY',
  originalOwnerRun433_144Verified: false,
  effectiveOwnerConfigAndMastersKnown: false,
  ciiCounts: inventory.declared,
  matchesReportedOwner433_144: inventory.declared.elements === 433 && inventory.declared.rigids === 144,
  rigidPointersSelected: selected,
  originalSha256: verified.audit.originalSha256,
  revisedSha256: verified.audit.revisedSha256,
  authorization: verified.audit.changes,
  untouchedBytesEqual: verified.audit.untouchedBytesEqual,
};
await mkdir(evidenceDir, { recursive: true });
await writeFile(join(evidenceDir, 'repository-glrd-original.cii'), originalCii);
await writeFile(join(evidenceDir, 'repository-glrd-revised.cii'), verified.revisedCiiText);
await writeFile(join(evidenceDir, 'repository-glrd-change-audit.json'), JSON.stringify(verified.audit, null, 2));
await writeFile(join(evidenceDir, 'repository-glrd-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
