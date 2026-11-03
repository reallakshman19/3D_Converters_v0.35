import { runFbxAutoPipe } from '../auto-pipe/pipeline.js?v=20260729-fbx2-direct-pipe-1';
import { canonicalJson } from '../canonical-json.js';
import { buildBranchFittingPortEvidence } from '../fitting-kernels/branch-fitting/evidence.js';
import {
  buildBranchFittingReviewModel,
  unavailableBranchFittingReview,
} from '../fitting-kernels/branch-fitting/review-model.js';
import { buildSelectedZoneConnectivityEvidence } from '../fitting-kernels/connectivity/evidence.js';
import {
  buildConnectivityReviewModel,
  unavailableConnectivityReview,
} from '../fitting-kernels/connectivity/review-model.js';
import { buildElbowPortEvidence } from '../fitting-kernels/elbow/evidence.js';
import { buildInlineAssemblyPortEvidence } from '../fitting-kernels/inline-assembly/evidence.js';
import {
  buildInlineAssemblyReviewModel,
  unavailableInlineAssemblyReview,
} from '../fitting-kernels/inline-assembly/review-model.js';
import {
  buildPrimaryFittingReviewModel,
  unavailablePrimaryFittingReview,
} from '../fitting-kernels/primary-fitting/review-model.js';
import { buildReducerPortEvidence } from '../fitting-kernels/reducer/evidence.js';
import { buildTeePortEvidence } from '../fitting-kernels/tee/evidence.js';
import {
  buildGeneratedGapPipeReviewModel,
  unavailableGeneratedGapPipeReview,
} from '../generated-gap-pipe/review-model.js';
import { buildSelectedZoneGeneratedGapPipeEvidence } from '../generated-gap-pipe/selected-evidence.js';
import { buildSelectedZoneComponentCrosswalk } from '../parity/component-crosswalk.js';
import { buildSolidFittingPortEvidence } from '../solid-fitting-ports/evidence.js?v=20260729-fbx2-direct-pipe-1';
import { buildLiveZonePackageInputs } from '../zone-package/live-input.js';
import { buildDerivedPortEvidence } from './derived-ports.js';
import { scopeMappedStagedBranches } from './mapped-stage-scope.js';
import { asZoneGeometryError } from './errors.js';
import { prepareZoneGeometryEvidence } from './zone-evidence.js';
import { ZONE_GEOMETRY_STATUS } from './constants.js';
import { buildFbxZoneWireframeData } from './wireframe-preview.js';

function packagePrefix(artifact) {
  return String(artifact.selectedZone.label || artifact.selectedZone.zoneId)
    .trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
    || 'selected-zone';
}

async function optionalPackageInputs(input, prepared, pipeEvidence, mapped) {
  if (input.includeZonePackageInputs === false) {
    return { zonePackageInputs: null, zonePackageError: null };
  }
  try {
    const zonePackageInputs = await buildLiveZonePackageInputs({
      zoneGeometryEvidence: prepared.artifact,
      sourceGraph: prepared.canonicalGraph,
      scope: prepared.scope,
      selections: prepared.selections,
      pipeClassifications: pipeEvidence.autoPipe.classificationDispositions,
      stagedBranches: mapped.stagedBranches,
      stagedJsonText: mapped.stagedBranches ? null
        : pipeEvidence.autoPipe.status === 'STAGEDJSON_PASS'
          ? pipeEvidence.autoPipe.stagedJsonText : null,
      mappedStageStatus: input.mappedStageStatus,
      engineeringAttributeLedger: input.engineeringAttributeLedger,
      derivedPortEvidence: pipeEvidence.derivedPortEvidence,
      solidFittingPortEvidence: pipeEvidence.closedSolidPipeEvidence,
      componentCrosswalk: mapped.componentCrosswalk,
      connectivityEvidence: mapped.connectivityEvidence,
      generatedGapPipeEvidence: mapped.generatedGapPipeEvidence,
      elbowEvidence: mapped.elbowEvidence,
      teeEvidence: mapped.teeEvidence,
      reducerEvidence: mapped.reducerEvidence,
      branchFittingEvidence: mapped.branchFittingEvidence,
      inlineAssemblyEvidence: mapped.inlineAssemblyEvidence,
    });
    zonePackageInputs.fileNamePrefix = packagePrefix(prepared.artifact);
    return { zonePackageInputs, zonePackageError: null };
  } catch (error) {
    return {
      zonePackageInputs: null,
      zonePackageError: Object.freeze({
        code: error?.code || 'ZONE_PACKAGE_PREPARATION_FAILED',
        message: error?.message || String(error),
      }),
    };
  }
}

async function gatherPipeEvidence(prepared) {
  const derivedPortEvidence = await buildDerivedPortEvidence(
    prepared.artifact, prepared.scope, prepared.selections);
  const closedSolidPipeEvidence = await buildSolidFittingPortEvidence(
    prepared.artifact, prepared.scope, prepared.selections);
  const autoPipe = await runFbxAutoPipe({
    zoneGeometryEvidence: prepared.artifact,
    derivedPortEvidence,
    closedSolidPipeEvidence,
    selections: prepared.selections,
  });
  return { derivedPortEvidence, closedSolidPipeEvidence, autoPipe };
}

function unavailableMappedAnalysis(mappingStatus) {
  return Object.freeze({
    stagedBranches: null,
    componentCrosswalk: null,
    connectivityEvidence: null,
    connectivityReview: unavailableConnectivityReview(mappingStatus),
    generatedGapPipeEvidence: null,
    generatedGapPipeReview: unavailableGeneratedGapPipeReview(mappingStatus),
    elbowEvidence: null,
    teeEvidence: null,
    reducerEvidence: null,
    primaryFittingReview: unavailablePrimaryFittingReview(mappingStatus),
    branchFittingEvidence: null,
    branchFittingReview: unavailableBranchFittingReview(mappingStatus),
    inlineAssemblyEvidence: null,
    inlineAssemblyReview: unavailableInlineAssemblyReview(mappingStatus),
  });
}

async function buildPrimaryFittingAnalysis(componentCrosswalk, solidEvidence, mappingStatus) {
  const inputs = { componentCrosswalk, solidFittingPortEvidence: solidEvidence };
  const elbowEvidence = await buildElbowPortEvidence(inputs);
  const teeEvidence = await buildTeePortEvidence(inputs);
  const reducerEvidence = await buildReducerPortEvidence(inputs);
  const primaryFittingReview = buildPrimaryFittingReviewModel({
    elbowEvidence, teeEvidence, reducerEvidence, mappingStatus,
  });
  return { elbowEvidence, teeEvidence, reducerEvidence, primaryFittingReview };
}

async function mappedComponentAnalysis(input, prepared, solidEvidence) {
  const mappingStatus = input.mappedStageStatus || 'MAPPED_STAGE_NOT_AVAILABLE';
  if (!Array.isArray(input.stagedBranches)) return unavailableMappedAnalysis(mappingStatus);
  const stagedBranches = scopeMappedStagedBranches(input.stagedBranches, prepared.artifact);
  const componentCrosswalk = await buildSelectedZoneComponentCrosswalk({
    sourceGraph: prepared.canonicalGraph,
    zoneGeometryEvidence: prepared.artifact,
    stagedBranches,
  });
  const generatedGapPipeEvidence = buildSelectedZoneGeneratedGapPipeEvidence({
    stagedBranches, zoneGeometryEvidence: prepared.artifact, mappingStatus,
  });
  const connectivityEvidence = await buildSelectedZoneConnectivityEvidence({
    stagedBranches, componentCrosswalk, mappingStatus,
  });
  const primaryFittings = await buildPrimaryFittingAnalysis(componentCrosswalk,
    solidEvidence, mappingStatus);
  const branchFittingEvidence = await buildBranchFittingPortEvidence({
    componentCrosswalk, solidFittingPortEvidence: solidEvidence,
  });
  const inlineAssemblyEvidence = await buildInlineAssemblyPortEvidence({
    componentCrosswalk, solidFittingPortEvidence: solidEvidence,
  });
  return Object.freeze({
    stagedBranches,
    componentCrosswalk,
    connectivityEvidence,
    connectivityReview: buildConnectivityReviewModel(connectivityEvidence, mappingStatus),
    generatedGapPipeEvidence,
    generatedGapPipeReview: buildGeneratedGapPipeReviewModel(
      generatedGapPipeEvidence, mappingStatus),
    ...primaryFittings,
    branchFittingEvidence,
    branchFittingReview: buildBranchFittingReviewModel(
      branchFittingEvidence, mappingStatus),
    inlineAssemblyEvidence,
    inlineAssemblyReview: buildInlineAssemblyReviewModel(
      inlineAssemblyEvidence, mappingStatus),
  });
}

function primaryFittingCounts(review) {
  const family = Object.fromEntries(review.familySummary.map((item) => [item.family, item]));
  return {
    mappedPrimaryFittings: review.managedCount,
    admittedPrimaryFittings: review.admittedCount,
    blockedPrimaryFittings: review.blockedCount,
    mappedElbows: family.ELBOW?.managedCount || 0,
    admittedElbows: family.ELBOW?.admittedCount || 0,
    blockedElbows: family.ELBOW?.blockedCount || 0,
    mappedTees: family.TEE?.managedCount || 0,
    admittedTees: family.TEE?.admittedCount || 0,
    blockedTees: family.TEE?.blockedCount || 0,
    mappedReducers: family.REDUCER?.managedCount || 0,
    admittedReducers: family.REDUCER?.admittedCount || 0,
    blockedReducers: family.REDUCER?.blockedCount || 0,
  };
}

function analysisCounts(prepared, derivedPortEvidence, wireframePreview, autoPipe, mapped) {
  const connectivity = mapped.connectivityReview, branchReview = mapped.branchFittingReview;
  const inlineReview = mapped.inlineAssemblyReview, gapReview = mapped.generatedGapPipeReview;
  return Object.freeze({
    selectedOccurrences: prepared.artifact.conservation.selectedOccurrenceCount,
    selectedGeometries: prepared.artifact.conservation.selectedGeometryCount,
    admittedLoops: derivedPortEvidence.admittedPortCount,
    rejectedLoops: derivedPortEvidence.rejectedPortCount,
    previewSegments: wireframePreview.displayedSegmentCount,
    admittedPipes: autoPipe.counts?.admittedPipes || 0,
    pipeLinks: autoPipe.counts?.links || 0,
    stagedBranches: autoPipe.counts?.branches || 0,
    mappedComponents: connectivity.counts.componentCount,
    mappedInternalLinks: connectivity.counts.internalLinkCount,
    mappedBoundaryLinks: connectivity.counts.boundaryLinkCount,
    mappedOpenPorts: connectivity.counts.openPortCount,
    mappedBlockedComponents: connectivity.counts.blockedComponentCount,
    generatedGapPipes: gapReview.counts.generatedPipeCount,
    blockedGeneratedGapPipes: gapReview.counts.blockedCandidateCount,
    ...primaryFittingCounts(mapped.primaryFittingReview),
    mappedBranchFittings: branchReview.managedCount,
    admittedBranchFittings: branchReview.admittedCount,
    blockedBranchFittings: branchReview.blockedCount,
    mappedInlineAssemblies: inlineReview.managedCount,
    admittedInlineAssemblies: inlineReview.admittedCount,
    blockedInlineAssemblies: inlineReview.blockedCount,
  });
}

function optionalJson(value) {
  return value ? canonicalJson(value) : null;
}

function analysisResult(prepared, pipeEvidence, mapped, wireframePreview, packageResult) {
  return Object.freeze({
    status: ZONE_GEOMETRY_STATUS.PASS,
    zoneGeometryEvidence: prepared.artifact,
    derivedPortEvidence: pipeEvidence.derivedPortEvidence,
    closedSolidPipeEvidence: pipeEvidence.closedSolidPipeEvidence,
    componentCrosswalk: mapped.componentCrosswalk,
    connectivityEvidence: mapped.connectivityEvidence,
    connectivityReview: mapped.connectivityReview,
    generatedGapPipeEvidence: mapped.generatedGapPipeEvidence,
    generatedGapPipeReview: mapped.generatedGapPipeReview,
    elbowEvidence: mapped.elbowEvidence,
    teeEvidence: mapped.teeEvidence,
    reducerEvidence: mapped.reducerEvidence,
    primaryFittingReview: mapped.primaryFittingReview,
    branchFittingEvidence: mapped.branchFittingEvidence,
    branchFittingReview: mapped.branchFittingReview,
    inlineAssemblyEvidence: mapped.inlineAssemblyEvidence,
    inlineAssemblyReview: mapped.inlineAssemblyReview,
    wireframePreview, autoPipe: pipeEvidence.autoPipe, ...packageResult,
    zoneGeometryJson: canonicalJson(prepared.artifact),
    derivedPortJson: canonicalJson(pipeEvidence.derivedPortEvidence),
    closedSolidPipeJson: canonicalJson(pipeEvidence.closedSolidPipeEvidence),
    componentCrosswalkJson: optionalJson(mapped.componentCrosswalk),
    connectivityJson: optionalJson(mapped.connectivityEvidence),
    generatedGapPipeJson: optionalJson(mapped.generatedGapPipeEvidence),
    elbowJson: optionalJson(mapped.elbowEvidence),
    teeJson: optionalJson(mapped.teeEvidence),
    reducerJson: optionalJson(mapped.reducerEvidence),
    branchFittingJson: optionalJson(mapped.branchFittingEvidence),
    inlineAssemblyJson: optionalJson(mapped.inlineAssemblyEvidence),
    counts: analysisCounts(prepared, pipeEvidence.derivedPortEvidence,
      wireframePreview, pipeEvidence.autoPipe, mapped),
  });
}

export async function analyseFbxZoneGeometry(input) {
  try {
    const prepared = await prepareZoneGeometryEvidence(input);
    const wireframePreview = buildFbxZoneWireframeData({
      scope: prepared.scope, selections: prepared.selections,
    });
    const pipeEvidence = await gatherPipeEvidence(prepared);
    const mapped = await mappedComponentAnalysis(
      input, prepared, pipeEvidence.closedSolidPipeEvidence);
    const packageResult = await optionalPackageInputs(
      input, prepared, pipeEvidence, mapped);
    return analysisResult(
      prepared, pipeEvidence, mapped, wireframePreview, packageResult);
  } catch (error) {
    throw asZoneGeometryError(error);
  }
}
