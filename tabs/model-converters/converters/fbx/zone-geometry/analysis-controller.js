import { ZONE_GEOMETRY_STATUS } from './constants.js';
import { FbxZoneGeometryError, asZoneGeometryError } from './errors.js';

const PACKAGE_INPUT_EVENT = 'model-converters:fbx-zone-package-inputs';

function frozenState(value) {
  return Object.freeze({
    phase: value.phase,
    status: value.status,
    message: value.message,
    zoneGeometryJson: value.zoneGeometryJson,
    derivedPortJson: value.derivedPortJson,
    internalPipeJson: value.internalPipeJson,
    stagedJsonText: value.stagedJsonText,
    componentCrosswalkJson: value.componentCrosswalkJson,
    connectivityJson: value.connectivityJson,
    generatedGapPipeJson: value.generatedGapPipeJson,
    elbowJson: value.elbowJson,
    teeJson: value.teeJson,
    reducerJson: value.reducerJson,
    branchFittingJson: value.branchFittingJson,
    inlineAssemblyJson: value.inlineAssemblyJson,
    autoPipeStatus: value.autoPipeStatus,
    result: value.result,
    generation: value.generation,
  });
}

function publishPackageInputs(inputs) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(PACKAGE_INPUT_EVENT, {
    detail: { inputs: inputs || null },
  }));
}

function mappedRuntimeError(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  if (/ABORT|cancel/i.test(text)) {
    return new FbxZoneGeometryError(
      ZONE_GEOMETRY_STATUS.CANCELLED, 'Zone geometry analysis was cancelled.');
  }
  if (/TIMEOUT|LIMIT|RESOURCE|memory|allocation/i.test(text)) {
    return new FbxZoneGeometryError(ZONE_GEOMETRY_STATUS.RESOURCE,
      'Zone geometry analysis exceeded an approved resource boundary.');
  }
  return asZoneGeometryError(error, ZONE_GEOMETRY_STATUS.TOPOLOGY);
}

function runningProgress(runtime, generation, stage, onProgress) {
  if (runtime.generation !== generation) return;
  runtime.clear('running', `Geometry worker: ${stage}`);
  onProgress?.(stage);
}

function connectivityMessage(result) {
  const review = result.connectivityReview;
  if (!review || review.status === 'MAPPING_REQUIRED') {
    return ' Connectivity review requires approved mapped StagedJSON.';
  }
  const counts = review.counts;
  return ` Connectivity: ${counts.internalLinkCount} internal, ${counts.boundaryLinkCount} boundary, ${counts.openPortCount} open ports.`;
}

function gapPipeMessage(result) {
  const review = result.generatedGapPipeReview;
  if (!review || review.status === 'MAPPING_REQUIRED') {
    return ' Generated gap PIPE review requires approved mapped StagedJSON.';
  }
  return ` Generated gap PIPEs: ${review.counts.generatedPipeCount} released, ${review.counts.blockedCandidateCount} blocked.`;
}

function primaryFittingMessage(result) {
  const review = result.primaryFittingReview;
  if (!review || review.status === 'MAPPING_REQUIRED') {
    return ' Primary fitting review requires approved mapped StagedJSON.';
  }
  return ` Primary fittings: ${review.admittedCount} admitted, ${review.blockedCount} blocked.`;
}

function branchFittingMessage(result) {
  const review = result.branchFittingReview;
  if (!review || review.status === 'MAPPING_REQUIRED') return ' OLET review requires approved mapped StagedJSON.';
  return ` OLET review: ${review.admittedCount} admitted, ${review.blockedCount} blocked.`;
}

function inlineAssemblyMessage(result) {
  const review = result.inlineAssemblyReview;
  if (!review || review.status === 'MAPPING_REQUIRED') {
    return ' Inline assembly review requires approved mapped StagedJSON.';
  }
  return ` Inline assemblies: ${review.admittedCount} admitted, ${review.blockedCount} blocked.`;
}

function packageMessage(result) {
  if (result.zonePackageError) {
    return ` Package export unavailable: ${result.zonePackageError.code}.`;
  }
  const root = result.zonePackageInputs?.qualificationRoot;
  if (!root) return ' Package qualification was not produced.';
  const summary = root.summary || {};
  if (root.status === 'PASS') {
    return ` Package qualification: PASS (${summary.passCount || 0}/${summary.checkCount || 0} checks).`;
  }
  const blocked = Array.isArray(summary.blockedChecks) ? summary.blockedChecks.join(', ') : 'unknown checks';
  return ` Package qualification: BLOCKED (${blocked}).`;
}

function completionMessage(result) {
  const base = `Analysed ${result.counts.selectedGeometries} geometries; ${result.counts.admittedLoops} admitted loops.`;
  const pipes = result.autoPipe.status === 'STAGEDJSON_PASS'
    ? ` Released ${result.counts.admittedPipes} PIPE components in ${result.counts.stagedBranches} branches.`
    : ` PIPE-only release blocked: ${result.autoPipe.status}.`;
  return `${base}${pipes}${connectivityMessage(result)}${gapPipeMessage(result)}${primaryFittingMessage(result)}${branchFittingMessage(result)}${inlineAssemblyMessage(result)}${packageMessage(result)}`;
}

function analysisInput(input, bundle) {
  return {
    sourceGraph: input.sourceGraph,
    geometryBundle: bundle,
    zoneId: input.zoneId,
    stagedBranches: input.stagedBranches,
    mappedStageStatus: input.mappedStageStatus,
    engineeringAttributeLedger: input.engineeringAttributeLedger,
    engineeringAttributeStatus: input.engineeringAttributeStatus,
    includeZonePackageInputs: true,
  };
}

function publishComplete(runtime, result) {
  return runtime.publish({
    phase: 'complete', status: result.status, message: completionMessage(result),
    zoneGeometryJson: result.zoneGeometryJson, derivedPortJson: result.derivedPortJson,
    internalPipeJson: result.autoPipe.internalPipeMappingJson,
    stagedJsonText: result.autoPipe.stagedJsonText,
    componentCrosswalkJson: result.componentCrosswalkJson, connectivityJson: result.connectivityJson,
    generatedGapPipeJson: result.generatedGapPipeJson, elbowJson: result.elbowJson,
    teeJson: result.teeJson, reducerJson: result.reducerJson,
    branchFittingJson: result.branchFittingJson, inlineAssemblyJson: result.inlineAssemblyJson,
    autoPipeStatus: result.autoPipe.status, result,
  });
}

async function executeRun(runtime, input, onProgress) {
  runtime.invalidate('analysis-started');
  const generation = runtime.generation;
  const controller = new AbortController();
  runtime.active = controller;
  runtime.clear('running', 'Preparing exact FBX topology...');
  try {
    const bundle = await runtime.parseBundle(input.bytes, {
      signal: controller.signal,
      onProgress: (stage) => runningProgress(runtime, generation, stage, onProgress),
    });
    if (runtime.generation !== generation) return Object.freeze({ stale: true });
    runtime.clear('running', 'Deriving selected-zone boundary evidence...');
    const result = await runtime.analyse(analysisInput(input, bundle));
    if (runtime.generation !== generation) return Object.freeze({ stale: true });
    runtime.active = null;
    publishComplete(runtime, result);
    return result;
  } catch (error) {
    if (runtime.generation !== generation) return Object.freeze({ stale: true });
    runtime.active = null;
    const failure = mappedRuntimeError(error);
    runtime.clear('failed', failure.message, failure.code);
    throw failure;
  }
}

export function createZoneAnalysisController({ parseBundle, analyse, onState = null }) {
  const runtime = {
    generation: 0, active: null, parseBundle, analyse, state: null,
  };
  runtime.publish = (next) => {
    runtime.state = frozenState({ ...next, generation: runtime.generation });
    publishPackageInputs(runtime.state.result?.zonePackageInputs || null);
    try { onState?.(runtime.state); } catch { /* UI observers are non-authoritative. */ }
    return runtime.state;
  };
  runtime.clear = (phase, message, status = null) => runtime.publish({
    phase, status, message,
    zoneGeometryJson: null, derivedPortJson: null,
    internalPipeJson: null, stagedJsonText: null,
    componentCrosswalkJson: null, connectivityJson: null,
    generatedGapPipeJson: null,
    elbowJson: null, teeJson: null, reducerJson: null,
    branchFittingJson: null, inlineAssemblyJson: null,
    autoPipeStatus: null, result: null,
  });
  runtime.invalidate = (reason = 'invalidated') => {
    const cancelled = Boolean(runtime.active);
    runtime.generation += 1;
    runtime.active?.abort();
    runtime.active = null;
    return runtime.clear(cancelled ? 'cancelled' : 'idle', reason,
      cancelled ? ZONE_GEOMETRY_STATUS.CANCELLED : null);
  };
  runtime.clear('idle', '');
  return Object.freeze({
    run: (input, progress) => executeRun(runtime, input, progress),
    invalidate: runtime.invalidate,
    snapshot: () => runtime.state,
  });
}
