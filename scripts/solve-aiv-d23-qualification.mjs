import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AIV_D23_PDF_REVALIDATION } from '../converters/vibration/aiv/aiv-d23-pdf-revalidation.js';
import { AIV_T2_6_ERRATA_FEED_EQUATION } from '../converters/vibration/aiv/aiv-errata-evidence.js';
import {
  qualificationAttenuationDb,
  qualificationErrataLog10N,
  qualificationFatigueFactor,
  qualificationFinalLofFromLf,
  qualificationFlm1,
  qualificationFlm2,
  qualificationSourcePwlDb,
} from './aiv-qualification-math.mjs';

export const AIV_D23_QUALIFICATION_SOLVE_SCHEMA = 'AivD23QualificationSolve.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function absoluteDifference(actual, published) {
  return Math.abs(actual - published);
}

function solveModifierChain({ N, FLM1, FLM2 }) {
  const nAfterFlm1 = N * FLM1;
  const nAfterFlm2 = nAfterFlm1 * FLM2;
  const Lf = qualificationFatigueFactor(nAfterFlm2);
  return { FLM1, NAfterFLM1: nAfterFlm1, FLM2, NAfterFLM2: nAfterFlm2, Lf, LOF: qualificationFinalLofFromLf(Lf) };
}

function solveMarkdownSourceRow(row, { massFlowKgH = 53482, trimReductionDb = row.lowNoiseTrimDb } = {}) {
  const rawSourcePwlDb = qualificationSourcePwlDb({
    p1PaAbs: row.upstreamPressureBara * 1e5,
    p2PaAbs: row.downstreamPressureBara * 1e5,
    massFlowKgS: massFlowKgH / 3600,
    temperatureK: row.upstreamTemperatureDegC + 273.15,
    molecularWeightGPerMol: row.molecularWeightGPerMol,
    sffDb: 0,
  });
  const effectiveSourcePwlDb = rawSourcePwlDb - trimReductionDb;
  return {
    calculatedRawSourcePwlDb: rawSourcePwlDb,
    trimReductionDb,
    calculatedReportedPwlDb: effectiveSourcePwlDb,
    controlledMarkdownReportedPwlDb: row.reportedPwlDb,
    absoluteDifferenceDb: absoluteDifference(effectiveSourcePwlDb, row.reportedPwlDb),
    controlledMarkdownReportedLof: row.reportedLof,
    lofReproduced: false,
  };
}

export function solveAivD23QualificationExample() {
  const evidence = AIV_D23_PDF_REVALIDATION;
  const reliefEvidence = evidence.sourceCases.relief;
  const recycleEvidence = evidence.sourceCases.recycle;
  const assessmentEvidence = evidence.reliefFirstDiscontinuity;
  const published = assessmentEvidence.published;
  const massFlowKgS = reliefEvidence.massFlow.value / 3600;

  const reliefRawPwlDb = qualificationSourcePwlDb({
    p1PaAbs: 99e5,
    p2PaAbs: 1e5,
    massFlowKgS,
    temperatureK: reliefEvidence.upstreamTemperature.value + 273.15,
    molecularWeightGPerMol: reliefEvidence.molecularWeight.value,
    sffDb: reliefEvidence.sonicFlowFactorDb,
  });
  const recycleRawPwlDb = qualificationSourcePwlDb({
    p1PaAbs: 88e5,
    p2PaAbs: 26e5,
    massFlowKgS: recycleEvidence.massFlow.value / 3600,
    temperatureK: recycleEvidence.upstreamTemperature.value + 273.15,
    molecularWeightGPerMol: recycleEvidence.molecularWeight.value,
    sffDb: recycleEvidence.sonicFlowFactorDb,
  });
  const recycleTrimReductionDb = recycleEvidence.lowNoiseTrim.reduction.value;
  const recycleEffectivePwlDb = recycleRawPwlDb - recycleTrimReductionDb;

  const calculatedAttenuationDb = qualificationAttenuationDb({
    distanceM: assessmentEvidence.sourceToAssessmentDistance.value,
    insideDiameterMm: assessmentEvidence.mainPipeInsideDiameter.value,
  });
  const pointPwlDb = reliefRawPwlDb - calculatedAttenuationDb;
  const log10N = qualificationErrataLog10N(published.B, AIV_T2_6_ERRATA_FEED_EQUATION.coefficients);
  const N = 10 ** log10N;
  const diameterRatio = assessmentEvidence.mainPipeOutsideDiameter.value / assessmentEvidence.branchOutsideDiameter.value;
  const recalculatedFlm1 = qualificationFlm1(diameterRatio);
  const calculatedFlm2 = qualificationFlm2(pointPwlDb);
  const publishedFlm1Chain = solveModifierChain({ N, FLM1: published.FLM1, FLM2: calculatedFlm2 });
  const recalculatedFlm1Chain = solveModifierChain({ N, FLM1: recalculatedFlm1, FLM2: calculatedFlm2 });

  return deepFreeze({
    schema: AIV_D23_QUALIFICATION_SOLVE_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    evidenceClass: 'QUALIFICATION_ONLY_NUMERICAL_REPRODUCTION',
    authority: {
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    sourceResults: {
      relief: {
        massFlowKgS,
        absolutePressure: { upstreamBara: 99, downstreamBara: 1 },
        calculatedRawSourcePwlDb: reliefRawPwlDb,
        publishedRawSourcePwlDb: reliefEvidence.publishedSourcePwlDb,
        absoluteDifferenceDb: absoluteDifference(reliefRawPwlDb, reliefEvidence.publishedSourcePwlDb),
      },
      recycle: {
        massFlowKgS: recycleEvidence.massFlow.value / 3600,
        absolutePressure: { upstreamBara: 88, downstreamBara: 26 },
        calculatedRawSourcePwlDb: recycleRawPwlDb,
        publishedRawSourcePwlDb: recycleEvidence.publishedSourcePwlDb,
        trimReductionDb: recycleTrimReductionDb,
        calculatedEffectiveSourcePwlDb: recycleEffectivePwlDb,
        controlledMarkdownReportedPwlDb: evidence.controlledMarkdownAivRows.recycleCompressorDischarge.reportedPwlDb,
      },
    },
    controlledMarkdownSourceRowParity: {
      recycleCompressorDischarge: solveMarkdownSourceRow(evidence.controlledMarkdownAivRows.recycleCompressorDischarge),
      recycleCompressorSuction: solveMarkdownSourceRow(evidence.controlledMarkdownAivRows.recycleCompressorSuction),
      reliefDownstreamLine: solveMarkdownSourceRow(evidence.controlledMarkdownAivRows.reliefDownstreamLine),
      scopeNote: 'PWL is reproduced at source/effective-source scope only. Markdown line LOF values are not rederived here.',
    },
    reliefFirstDiscontinuity: {
      sourceToAssessmentDistanceM: assessmentEvidence.sourceToAssessmentDistance.value,
      mainPipeInsideDiameterMm: assessmentEvidence.mainPipeInsideDiameter.value,
      calculatedAttenuationDb,
      publishedAttenuationDb: published.attenuationDb,
      calculatedPointPwlDb: pointPwlDb,
      publishedPointPwlDb: published.assessmentPwlDb,
      publishedIntermediatesNotRederived: {
        A: published.A,
        S: published.S,
        B: published.B,
        reason: 'A/S/B equations remain outside this isolated solve until controlled T2.6 human transcription reconciliation is complete.',
      },
      errataFeed: {
        B: published.B,
        calculatedLog10N: log10N,
        publishedLog10N: published.log10N,
        calculatedN: N,
        publishedN: published.N,
      },
      diameterRatio: { calculated: diameterRatio, published: published.diameterRatio },
      FLM1: {
        calculatedFromDisplayedInputs: recalculatedFlm1,
        published: published.FLM1,
        absoluteDifference: absoluteDifference(recalculatedFlm1, published.FLM1),
        reconciliationState: assessmentEvidence.arithmeticReconciliation.state,
      },
      calculatedFLM2: calculatedFlm2,
      publishedFLM2: published.FLM2,
      chains: {
        usingPublishedFLM1: publishedFlm1Chain,
        usingRecalculatedFLM1: recalculatedFlm1Chain,
      },
      finalDisposition: {
        publishedLOF: published.LOF,
        calculatedLOFUsingPublishedFLM1: publishedFlm1Chain.LOF,
        calculatedLOFUsingRecalculatedFLM1: recalculatedFlm1Chain.LOF,
        robustToOpenFlm1ArithmeticVariance: publishedFlm1Chain.LOF === recalculatedFlm1Chain.LOF,
      },
    },
    unresolved: [
      'A/S/B are retained as published D.2.3 intermediates; their equations are not rederived here before controlled T2.6 human reconciliation.',
      'The published FLM1=1.2133 versus recalculated 1.2109758194311824 discrepancy remains an authority/reconciliation issue even though final LOF is unchanged.',
      'The controlled Markdown relief-line LOF=1.48 is a line/case summary result and is not rederived by this first-discontinuity benchmark solve.',
      'This script and its qualification math helpers must not be imported by the production calculator registry, Engineering Calculation API, or AIV UI.',
    ],
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(solveAivD23QualificationExample(), null, 2)}\n`);
