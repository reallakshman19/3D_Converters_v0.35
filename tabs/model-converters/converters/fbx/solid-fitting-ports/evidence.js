import { compareDecimalId, compareOccurrenceId, compareText } from '../zone-geometry/compare.js';
import { artifactWithId } from '../zone-geometry/identity.js';
import { decodeExactPolygonTopology } from '../zone-geometry/polygon-topology.js';
import { deriveConnectedShells } from '../zone-geometry/shells.js';
import { buildSolidFittingAnalysisTopology } from './analysis-topology.js?v=20260729-fbx2-direct-pipe-1';
import { deriveCapRegions } from './cap-clustering.js';
import { evaluateCapRegions } from './candidate-evaluation.js?v=20260729-fbx2-direct-pipe-1';
import { FBX_SOLID_FITTING_PORT_SCHEMA, SOLID_FITTING_REJECTION_REASON_ORDER } from './constants.js?v=20260729-fbx2-direct-pipe-1';
import { classifyPortTopology } from './port-topology-disposition.js';
import { SOLID_FITTING_PORT_PROFILE } from './profile.js?v=20260729-fbx2-direct-pipe-1';
import { bridgeDetachedTerminalCap } from './terminal-cap-bridge.js?v=20260729-fbx2-direct-pipe-1';
import { projectFaceFeatures } from './topology-projection.js';

function reasonRank(value) {
  const index = SOLID_FITTING_REJECTION_REASON_ORDER.indexOf(value);
  return index < 0 ? SOLID_FITTING_REJECTION_REASON_ORDER.length : index;
}

function orderedReasons(values) {
  return [...new Set(values)].sort((a, b) => reasonRank(a) - reasonRank(b) || compareText(a, b));
}

function relevantOccurrences(scope, geometryObjectId) {
  return scope.selectedOccurrences.filter((item) => item.geometryObjectIds.includes(geometryObjectId))
    .sort((a, b) => compareOccurrenceId(a.sourceOccurrenceId, b.sourceOccurrenceId));
}

function rejectedRecord(occurrence, geometryObjectId, analysisProjection, reasons) {
  return {
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    sourceModelObjectId: occurrence.sourceModelObjectId,
    geometryObjectId,
    shellId: null,
    analysisProjection,
    topologyDisposition: 'REJECTED',
    candidates: [],
    rejectionReasons: orderedReasons(reasons),
  };
}

async function occurrenceRecord(
  occurrence, geometryObjectId, analysisProjection, shell, regions, profile,
) {
  const candidates = await evaluateCapRegions(
    occurrence, geometryObjectId, shell.shellId, regions, profile);
  const admitted = candidates.filter((item) => item.admissionDisposition === 'ADMITTED');
  const disposition = classifyPortTopology(admitted, profile);
  return {
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    sourceModelObjectId: occurrence.sourceModelObjectId,
    geometryObjectId,
    shellId: shell.shellId,
    analysisProjection,
    topologyDisposition: disposition.disposition,
    candidates,
    rejectionReasons: disposition.reason ? orderedReasons([disposition.reason]) : [],
  };
}

async function preparedAnalysis(decoded, profile) {
  const base = buildSolidFittingAnalysisTopology(decoded, profile);
  let topology = base.topology, shells = await deriveConnectedShells(topology), bridge = null;
  if (shells.length !== 1) {
    bridge = await bridgeDetachedTerminalCap(decoded, topology, shells, profile);
    if (bridge) {
      topology = bridge.topology; shells = await deriveConnectedShells(topology);
    }
  }
  const evidence = Object.freeze({
    ...base.evidence,
    finalAnalysisVertexCount: topology.points.length,
    finalAnalysisFaceCount: topology.faces.length,
    finalAnalysisShellCount: shells.length,
    terminalCapBridge: bridge?.evidence || null,
  });
  return { topology, shells, evidence };
}

async function geometryOccurrenceRecords(scope, selection, profile) {
  const decoded = decodeExactPolygonTopology(selection);
  const prepared = await preparedAnalysis(decoded, profile);
  const occurrences = relevantOccurrences(scope, prepared.topology.geometryObjectId);
  if (!occurrences.length) return [];
  if (prepared.shells.length !== 1) {
    return occurrences.map((occurrence) => rejectedRecord(
      occurrence, prepared.topology.geometryObjectId, prepared.evidence, ['MULTIPLE_SHELLS']));
  }
  const [shell] = prepared.shells;
  if (shell.rejectionReasons.length) {
    return occurrences.map((occurrence) => rejectedRecord(
      occurrence, prepared.topology.geometryObjectId, prepared.evidence, shell.rejectionReasons));
  }
  const faceFeatures = projectFaceFeatures(prepared.topology);
  const regions = deriveCapRegions(prepared.topology, shell, faceFeatures, profile);
  const records = [];
  for (const occurrence of occurrences) {
    records.push(await occurrenceRecord(occurrence, prepared.topology.geometryObjectId,
      prepared.evidence, shell, regions, profile));
  }
  return records;
}

function rejectionCounts(records) {
  const counts = {};
  for (const record of records) for (const reason of record.rejectionReasons) {
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => reasonRank(a[0]) - reasonRank(b[0])
    || compareText(a[0], b[0])));
}

export async function buildSolidFittingPortEvidence(
  zoneArtifact, scope, selections, profile = SOLID_FITTING_PORT_PROFILE,
) {
  const records = [];
  for (const selection of selections) {
    records.push(...await geometryOccurrenceRecords(scope, selection, profile));
  }
  records.sort((a, b) => compareOccurrenceId(a.sourceOccurrenceId, b.sourceOccurrenceId)
    || compareDecimalId(a.geometryObjectId, b.geometryObjectId));
  const admittedOccurrenceCount = records.filter((item) => item.topologyDisposition !== 'REJECTED').length;
  return artifactWithId(FBX_SOLID_FITTING_PORT_SCHEMA, 'fbx-solid-fitting-port-evidence', {
    sourceZoneGeometryArtifactId: zoneArtifact.artifactId,
    toleranceProfile: profile,
    occurrenceCount: records.length,
    admittedOccurrenceCount,
    rejectedOccurrenceCount: records.length - admittedOccurrenceCount,
    rejectionCounts: rejectionCounts(records),
    occurrenceEvidence: records,
  });
}
