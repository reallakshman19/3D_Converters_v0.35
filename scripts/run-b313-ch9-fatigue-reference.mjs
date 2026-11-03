import { fileURLToPath } from 'node:url';
import { auditChapterIxFatigueMasterDirectory } from './audit-b313-ch9-fatigue-masters.mjs';
import { evaluateChapterIxStraightPipeFatigueSpectrum } from '../converters/b313-chapter-ix/fatigue-spectrum.js';

function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function runChapterIxFatigueReferenceDirectory(directory, input = {}) {
  const outsideDiameterMm = positive(input.outsideDiameterMm);
  const effectiveWallMm = positive(input.effectiveWallMm);
  if (!outsideDiameterMm || !effectiveWallMm) {
    return failure('INPUT_INVALID', 'Positive outsideDiameterMm and effectiveWallMm are required.');
  }
  const bundle = auditChapterIxFatigueMasterDirectory(directory, input.methodId, input.spectrumId ?? null);
  if (!bundle.ok) return failure(bundle.code, bundle.message, { stage: 'MASTER_RESOLUTION', ...(bundle.details ?? {}) });
  if (bundle.bundleState !== 'SYNTHETIC_REFERENCE_READY') {
    return {
      ok: true,
      runState: bundle.bundleState,
      canUseForDesignAuthority: false,
      bundle,
      result: null,
      issues: bundle.issues ?? [],
    };
  }
  if (!bundle.transient) {
    return failure('TRANSIENT_SPECTRUM_REQUIRED', 'spectrumId must resolve for reference execution.');
  }
  const result = evaluateChapterIxStraightPipeFatigueSpectrum({
    outsideDiameterMm,
    effectiveWallMm,
    spectrum: bundle.transient.spectrum,
    states: bundle.transient.states,
    transitions: bundle.transient.transitions,
    fatigueRoute: bundle.route,
    fatigueCurvePoints: bundle.points,
  });
  if (!result.ok) {
    return failure(result.code, result.message, { stage: 'FATIGUE_EXECUTION', ...(result.details ?? {}) });
  }
  return {
    ok: true,
    runState: 'SYNTHETIC_REFERENCE_EXECUTED',
    canUseForDesignAuthority: false,
    bundle,
    result,
    issues: [],
  };
}

function main() {
  const [, , directory, methodId, spectrumId, outsideDiameterRaw, effectiveWallRaw] = process.argv;
  if (!directory || !methodId || !spectrumId || !outsideDiameterRaw || !effectiveWallRaw) {
    console.error('Usage: node scripts/run-b313-ch9-fatigue-reference.mjs <High-Pr-dir> <method-id> <spectrum-id> <outside-diameter-mm> <effective-wall-mm>');
    process.exitCode = 1;
    return;
  }
  try {
    const result = runChapterIxFatigueReferenceDirectory(directory, {
      methodId,
      spectrumId,
      outsideDiameterMm: Number(outsideDiameterRaw),
      effectiveWallMm: Number(effectiveWallRaw),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok && result.runState === 'SYNTHETIC_REFERENCE_EXECUTED' ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: 'FATIGUE_REFERENCE_RUN_FAILED', message: error.message }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
