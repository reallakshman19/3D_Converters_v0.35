import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AIV_EIT_REFERENCE, verifyAivEitV5ReferenceShape } from '../converters/vibration/aiv/aiv-eit-contract.js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/verify-aiv-eit-v5-reference.mjs <Energy-Institute-AVIFF---Worked-Examples.eit>');
  process.exit(2);
}
const bytes = await readFile(path);
const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
const gitBlob = createHash('sha1').update(header).update(bytes).digest('hex');
if (bytes.length !== AIV_EIT_REFERENCE.sizeBytes) throw new Error(`AIV_EIT_REFERENCE_SIZE_MISMATCH: ${bytes.length}`);
if (gitBlob !== AIV_EIT_REFERENCE.gitBlobSha1) throw new Error(`AIV_EIT_REFERENCE_BLOB_MISMATCH: ${gitBlob}`);
const document = JSON.parse(bytes.toString('utf8'));
const observed = verifyAivEitV5ReferenceShape(document);
console.log(JSON.stringify({ status: 'PASS', gitBlob, sizeBytes: bytes.length, observed }, null, 2));
