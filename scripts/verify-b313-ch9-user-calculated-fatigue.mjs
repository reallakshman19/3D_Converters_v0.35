import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateChapterIxUserCalculatedFatigueSpectrum } from '../converters/b313-chapter-ix/user-calculated-fatigue.js';

export function verifyChapterIxUserCalculatedFatigueFile(filePath) {
  const candidate = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return evaluateChapterIxUserCalculatedFatigueSpectrum({
    outsideDiameterMm: candidate.geometry?.outsideDiameterMm ?? candidate.outsideDiameterMm,
    effectiveWallMm: candidate.geometry?.effectiveWallMm ?? candidate.effectiveWallMm,
    spectrum: candidate.spectrum,
    states: candidate.states,
    transitions: candidate.transitions,
    externalResults: candidate.externalResults,
  });
}

function main() {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error('Usage: node scripts/verify-b313-ch9-user-calculated-fatigue.mjs <candidate.json>');
    process.exitCode = 1;
    return;
  }
  try {
    const result = verifyChapterIxUserCalculatedFatigueFile(filePath);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: 'USER_FATIGUE_CANDIDATE_READ_FAILED',
      message: error.message,
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
