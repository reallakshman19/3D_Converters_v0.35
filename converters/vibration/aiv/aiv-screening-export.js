export const AIV_SCREENING_EXPORT_SCHEMA = 'AivScreeningExportPackage.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function networkEvidence(flareNetwork, generatedInputSet) {
  if (!flareNetwork || generatedInputSet?.schema !== 'AivGeneratedInputSet.v1') return null;
  return {
    networkSchema: flareNetwork.schema ?? null,
    networkId: flareNetwork.networkId ?? null,
    networkRevision: flareNetwork.revision ?? null,
    source: flareNetwork.source ?? null,
    sourceRevision: flareNetwork.sourceRevision ?? null,
    pathEvidence: (generatedInputSet.pathEvidence ?? []).map((item) => ({
      sourceCanonicalId: item.sourceCanonicalId,
      assessmentCanonicalId: item.assessmentCanonicalId,
      caseId: item.caseId,
      status: item.status,
      segmentIds: [...(item.segmentIds ?? [])],
      unresolvedSegmentIds: [...(item.unresolvedSegmentIds ?? [])],
      physicalDistanceM: item.physicalDistanceM ?? null,
      distanceAuthority: item.distanceAuthority ?? null,
    })),
    svgPixelsAuthoritativeForDistance: false,
  };
}

export function buildAivScreeningExportPackage({
  result,
  sources,
  assessments,
  relationships,
  topology,
  assumptionProfile,
  assumptionResolution = null,
  releaseReceipt = null,
  flareNetwork = null,
  generatedInputSet = null,
  eitImportEvidence = null,
} = {}) {
  if (result?.schema !== 'AivCalculatorResult.v1' || result.qualificationMode !== 'screening') {
    throw new TypeError('AIV screening export requires an AivCalculatorResult.v1 screening result.');
  }
  return deepFreeze({
    schema: AIV_SCREENING_EXPORT_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    resultScope: 'ASSESSMENT_SCREENING',
    result,
    inputs: {
      sources: sources ?? [],
      assessments: assessments ?? [],
      relationships: relationships ?? [],
      topology: topology ?? null,
    },
    assumptions: {
      profile: assumptionProfile ?? result.assumptionProfile ?? null,
      resolutionSchema: assumptionResolution?.schema ?? null,
      assumedCells: assumptionResolution?.assumptions ?? [],
      assumptionCount: assumptionResolution?.assumptionCount ?? 0,
    },
    flareNetworkEvidence: networkEvidence(flareNetwork, generatedInputSet),
    eitImportEvidence: eitImportEvidence ?? null,
    releaseEvidence: releaseReceipt ? {
      schema: releaseReceipt.schema ?? null,
      releaseTarget: releaseReceipt.releaseTarget ?? null,
      exactHeadSha: releaseReceipt.exactHeadSha ?? null,
      status: releaseReceipt.status ?? null,
    } : null,
    provenance: {
      calculationId: 'VIB.AIV.ACOUSTIC',
      stageOrder: result.stageOrder,
      completeKernelStageCount: result.implementedStageCount,
      sourceTrace: result.sourceResults.map((row) => row.trace ?? null),
      lineCaseSummaryAuthoritativeForScreening: false,
      importedEitResultsAuthoritativeForCurrentScreening: false,
      humanEvidenceRequired: false,
    },
    screeningAuthority: result.authority.screeningAuthority,
    designAuthority: false,
  });
}
