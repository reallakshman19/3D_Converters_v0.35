import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChapterIxSeedCsv } from './migrate-b313-ch9-seed-masters.mjs';
import { evaluateChapterIxLegacyEvidenceIntake } from '../converters/b313-chapter-ix/legacy-evidence-intake.js';

const FILES = Object.freeze({
  sources: 'code_source_revision.csv',
  approvals: 'approval_record.csv',
  benchmarks: 'benchmark_case.csv',
});

function readRows(directory, filename) {
  return parseChapterIxSeedCsv(fs.readFileSync(path.join(directory, filename), 'utf8'));
}

export function auditChapterIxLegacyEvidenceDirectory(directory, options = {}) {
  const sourceDir = path.resolve(directory);
  const input = Object.fromEntries(Object.entries(FILES).map(([key, filename]) => [
    key, readRows(sourceDir, filename),
  ]));
  return evaluateChapterIxLegacyEvidenceIntake({ ...input, ...options });
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const directory = process.argv[2];
  const methodId = process.argv[3] || 'B313-CH9-PF-2024-R1';
  const b313Edition = process.argv[4] || '2024';
  if (!directory) {
    console.error('Usage: node scripts/audit-b313-ch9-legacy-evidence.mjs <High-Pr-dir> [method-id] [b313-edition]');
    process.exitCode = 1;
  } else {
    try {
      const result = auditChapterIxLegacyEvidenceDirectory(directory, { methodId, b313Edition });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = !result.ok ? 1 : result.readyForQualificationPackage ? 0 : 2;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
