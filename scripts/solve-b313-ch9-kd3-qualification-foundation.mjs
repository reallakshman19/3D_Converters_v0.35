import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const catalogPath = path.join(root, 'engineering/hp-class-standardization/qualification/kd3-oracle/catalog.json');

export function independentPressureSalt({ outsideDiameterMm, effectiveWallMm, fromPressureMpa, toPressureMpa }) {
  if (![outsideDiameterMm, effectiveWallMm, fromPressureMpa, toPressureMpa].every(Number.isFinite)) throw new TypeError('Pressure Salt inputs must be finite.');
  const innerDiameterMm = outsideDiameterMm - 2 * effectiveWallMm;
  if (!(outsideDiameterMm > 0 && effectiveWallMm > 0 && innerDiameterMm > 0)) throw new RangeError('Invalid thick-cylinder geometry.');
  if (fromPressureMpa < 0 || toPressureMpa < 0) throw new RangeError('Pressure cannot be negative.');
  const y = outsideDiameterMm / innerDiameterMm;
  const pressureRange = Math.abs(toPressureMpa - fromPressureMpa);
  const stressIntensityRangeMpa = 2 * pressureRange * y ** 2 / (y ** 2 - 1);
  return { stressIntensityRangeMpa, alternatingStressIntensityMpa: stressIntensityRangeMpa / 2 };
}

export function independentMiner(cycles) {
  if (!Array.isArray(cycles) || !cycles.length) throw new TypeError('At least one cycle is required.');
  const contributions = cycles.map((row) => {
    if (!Number.isFinite(row.appliedCycles) || row.appliedCycles < 0) throw new RangeError('appliedCycles must be finite and >= 0.');
    if (!Number.isFinite(row.permissibleCycles) || !(row.permissibleCycles > 0)) throw new RangeError('permissibleCycles must be finite and > 0.');
    return { cycleId: row.cycleId ?? null, usage: row.appliedCycles / row.permissibleCycles };
  });
  return { contributions, cumulativeUsage: contributions.reduce((sum, row) => sum + row.usage, 0) };
}

function compare(actual, expected, relTol) {
  const scale = Math.max(Math.abs(expected), 1e-12);
  const abs = Math.abs(actual - expected);
  return { actual, expected, absoluteDifference: abs, relativeDifference: abs / scale, pass: abs <= scale * relTol };
}

export function solveFoundationCases() {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const relTol = catalog.qaPolicy.defaultRelativeTolerance;
  const results = [];
  for (const item of catalog.cases.filter((c) => c.status === 'QUALIFICATION_FOUNDATION_READY')) {
    let comparisons = {};
    if (item.solver === 'PRESSURE_SALT') {
      const actual = independentPressureSalt(item.input);
      comparisons.alternatingStressIntensityMpa = compare(actual.alternatingStressIntensityMpa, item.expected.alternatingStressIntensityMpa, relTol);
    } else if (item.solver === 'ZERO_DAMAGE') {
      const salt = independentPressureSalt(item.input);
      comparisons.alternatingStressIntensityMpa = compare(salt.alternatingStressIntensityMpa, item.expected.alternatingStressIntensityMpa, relTol);
      comparisons.cumulativeUsage = compare(0, item.expected.cumulativeUsage, relTol);
    } else if (item.solver === 'MINER' || item.solver === 'MINER_ORDER') {
      const actual = independentMiner(item.input.cycles);
      comparisons.cumulativeUsage = compare(actual.cumulativeUsage, item.expected.cumulativeUsage, relTol);
      if (item.solver === 'MINER_ORDER') {
        const reverse = independentMiner([...item.input.cycles].reverse());
        comparisons.reverseOrderCumulativeUsage = compare(reverse.cumulativeUsage, item.expected.cumulativeUsage, relTol);
      }
    } else {
      throw new Error(`Unknown qualification-only solver ${item.solver} for ${item.benchmarkId}.`);
    }
    results.push({ benchmarkId: item.benchmarkId, comparisons, pass: Object.values(comparisons).every((row) => row.pass) });
  }
  return {
    ok: results.every((row) => row.pass),
    qualificationOnly: true,
    productionKernelUsed: false,
    nativeKd320Executed: false,
    qaTolerance: relTol,
    qaToleranceMeaning: catalog.qaPolicy.meaning,
    results
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = solveFoundationCases();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
