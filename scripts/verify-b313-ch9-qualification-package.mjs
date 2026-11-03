import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateChapterIxQualificationPackage } from '../converters/b313-chapter-ix/qualification-package.js';

function usage() {
  console.error('Usage: node scripts/verify-b313-ch9-qualification-package.mjs <package.json>');
}

function loadPackage(filePath) {
  const absolute = path.resolve(process.cwd(), filePath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      packageState: 'INVALID_PACKAGE',
      issues: [{
        code: 'QUAL_PACKAGE_READ',
        message: error instanceof Error ? error.message : String(error),
        details: { path: absolute },
      }],
      evidenceComplete: false,
      canPromoteCalculationAuthority: false,
    };
  }
  return evaluateChapterIxQualificationPackage(parsed);
}

export function verifyChapterIxQualificationFile(filePath) {
  return loadPackage(filePath);
}

function exitCode(result) {
  if (!result.ok) return 1;
  return result.evidenceComplete ? 0 : 2;
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const filePath = process.argv[2];
  if (!filePath) {
    usage();
    process.exitCode = 1;
  } else {
    const result = verifyChapterIxQualificationFile(filePath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = exitCode(result);
  }
}
