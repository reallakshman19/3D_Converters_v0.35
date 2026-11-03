import { buildPackageArchive } from '../zone-package/archive.js';
import { buildSelectedZonePackage } from '../zone-package/package-builder.js';
import { selectFbxAutoPipeZone } from '../zone-geometry/selected-zone-auto-pipe.js';
import { buildTayaSupportQualificationReport } from './report.js';
import { identifyGovernedTayaSource } from './source-profile.js';

function fail(message) {
  throw new Error(`FbxTayaSupportQualificationSession ${message}`);
}

function requiredFunction(value, label) {
  if (typeof value !== 'function') fail(`${label} must be a function.`);
  return value;
}

function validatedContext(input) {
  if (!input?.sourceBytes || input.sourceGraph?.schema !== 'FbxSourceGraph.v2') {
    fail('requires current FBX source bytes and FbxSourceGraph.v2.');
  }
  return {
    sourceName: input.sourceName,
    sourceBytes: input.sourceBytes,
    sourceGraph: input.sourceGraph,
  };
}

async function materialize(inputs, dependencies) {
  if (!inputs?.qualificationRoot) {
    fail('selected-zone analysis did not produce package inputs.');
  }
  const packageValue = await dependencies.buildPackage(inputs);
  const archive = await dependencies.buildArchive(packageValue.files);
  return { inputs, packageValue, archive };
}

function realDependencies(overrides = {}) {
  return {
    identifySource: overrides.identifySource || identifyGovernedTayaSource,
    selectZone: overrides.selectZone || selectFbxAutoPipeZone,
    buildPackage: overrides.buildPackage || buildSelectedZonePackage,
    buildArchive: overrides.buildArchive || buildPackageArchive,
    buildReport: overrides.buildReport || buildTayaSupportQualificationReport,
  };
}

async function analyseOnce(runAnalysis, selection, onProgress, label) {
  onProgress?.(`${label}: analysing governed selected zone`);
  const inputs = await runAnalysis(selection);
  if (!inputs?.qualificationRoot) fail(`${label} did not produce package inputs.`);
  return inputs;
}

function sourcePass(identity) {
  if (identity.status !== 'PASS') {
    fail(`governed source identity blocked: ${identity.blockedReasons.join(', ')}`);
  }
}

async function governedContext(input, deps, applySelection, onProgress) {
  onProgress?.('Verifying governed TAY-A byte and source-graph identity');
  const sourceIdentity = await deps.identifySource(input);
  sourcePass(sourceIdentity);
  onProgress?.('Resolving governed flowline-zone selection');
  const selection = deps.selectZone(input.sourceGraph);
  if (selection?.policy !== 'FbxSelectedZoneAutoPipePolicy.v1') {
    fail('governed selected-zone policy is unavailable.');
  }
  if (applySelection) {
    await requiredFunction(applySelection, 'applySelection')(selection);
  }
  return { sourceIdentity, selection };
}

async function qualificationRuns(analyse, selection, deps, onProgress) {
  const first = await analyseOnce(analyse, selection, onProgress, 'Run 1');
  onProgress?.('Run 1: building deterministic package and archive');
  const firstMaterialized = await materialize(first, deps);
  const second = await analyseOnce(analyse, selection, onProgress, 'Run 2');
  onProgress?.('Run 2: building deterministic package and archive');
  const secondMaterialized = await materialize(second, deps);
  return { first, second, firstMaterialized, secondMaterialized };
}

export async function runGovernedTayaSupportQualification({
  sourceName,
  sourceBytes,
  sourceGraph,
  applySelection = null,
  runAnalysis,
  onProgress = null,
  dependencies = null,
} = {}) {
  const input = validatedContext({ sourceName, sourceBytes, sourceGraph });
  const deps = realDependencies(dependencies || {});
  const analyse = requiredFunction(runAnalysis, 'runAnalysis');
  const context = await governedContext(input, deps, applySelection, onProgress);
  const runs = await qualificationRuns(
    analyse, context.selection, deps, onProgress);
  onProgress?.('Comparing support and package evidence');
  const report = await deps.buildReport({
    sourceIdentity: context.sourceIdentity,
    selection: context.selection,
    materializedRuns: [runs.firstMaterialized, runs.secondMaterialized],
  });
  return {
    report,
    ...context,
    firstInputs: runs.first,
    secondInputs: runs.second,
    secondPackage: runs.secondMaterialized.packageValue,
    secondArchive: runs.secondMaterialized.archive,
  };
}
