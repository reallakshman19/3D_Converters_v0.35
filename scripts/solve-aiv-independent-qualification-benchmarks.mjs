import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AIV_INDEPENDENT_BENCHMARKS } from '../converters/vibration/aiv/aiv-independent-benchmark-evidence.js';
import {
  qualificationCombinePwlDb,
  qualificationSourcePwlDb,
} from './aiv-qualification-math.mjs';

export const AIV_INDEPENDENT_QUALIFICATION_SOLVE_SCHEMA = 'AivIndependentQualificationSolve.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function solveBenchmark(benchmark) {
  if (benchmark.benchmarkId === 'AIV-HAND-SONIC-SFF6-001') {
    const input = benchmark.inputs;
    const common = {
      p1PaAbs: input.upstreamPressureAbsolute.value,
      p2PaAbs: input.downstreamPressureAbsolute.value,
      massFlowKgS: input.massFlow.value,
      temperatureK: input.upstreamTemperature.value,
      molecularWeightGPerMol: input.molecularWeight.value,
    };
    const nonSonicPwlDb = qualificationSourcePwlDb({ ...common, sffDb: 0 });
    const sonicPwlDb = qualificationSourcePwlDb({ ...common, sffDb: input.sonicFlowFactorDb });
    return {
      benchmarkId: benchmark.benchmarkId,
      benchmarkType: benchmark.benchmarkType,
      calculated: {
        nonSonicReferencePwlDb: nonSonicPwlDb,
        sonicPwlDb,
        sonicDeltaDb: sonicPwlDb - nonSonicPwlDb,
      },
      expected: benchmark.expected,
      tolerance: benchmark.tolerance,
      humanAcceptanceRequired: benchmark.reviewState === 'HUMAN_ACCEPTANCE_REQUIRED',
      productionAuthority: false,
    };
  }

  if (benchmark.benchmarkId === 'AIV-HAND-MULTI-SOURCE-EQUAL-001'
    || benchmark.benchmarkId === 'AIV-HAND-MULTI-SOURCE-ASYM-001') {
    const combinedPwlDb = qualificationCombinePwlDb(benchmark.inputs.contributionPwlDb);
    const dominant = Math.max(...benchmark.inputs.contributionPwlDb);
    return {
      benchmarkId: benchmark.benchmarkId,
      benchmarkType: benchmark.benchmarkType,
      calculated: {
        combinedPwlDb,
        increaseAboveDominantSourceDb: combinedPwlDb - dominant,
      },
      expected: benchmark.expected,
      tolerance: benchmark.tolerance,
      humanAcceptanceRequired: benchmark.reviewState === 'HUMAN_ACCEPTANCE_REQUIRED',
      productionAuthority: false,
    };
  }

  throw new TypeError(`Unsupported independent AIV qualification benchmark ${benchmark.benchmarkId}.`);
}

export function solveAivIndependentQualificationBenchmarks() {
  return deepFreeze({
    schema: AIV_INDEPENDENT_QUALIFICATION_SOLVE_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    evidenceClass: 'QUALIFICATION_ONLY_INDEPENDENT_VECTOR_REPRODUCTION',
    results: AIV_INDEPENDENT_BENCHMARKS.map(solveBenchmark),
    authority: {
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    notes: [
      'These calculations reproduce independent analytical vectors only; they do not constitute the named human acceptance required by AivIndependentBenchmarkReview.v1.',
      'This script and scripts/aiv-qualification-math.mjs are isolated from the production AIV facade, UI and Engineering Calculation API.',
    ],
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(solveAivIndependentQualificationBenchmarks(), null, 2)}\n`);
