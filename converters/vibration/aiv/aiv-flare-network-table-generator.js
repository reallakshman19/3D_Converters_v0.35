import { AIV_ASSESSMENT_CSV_HEADER } from './assessment-csv.js';
import { AIV_SOURCE_CSV_HEADER } from './source-csv.js';
import { AIV_SOURCE_ASSESSMENT_CSV_HEADER } from './source-assessment-csv.js';
import {
  AIV_FLARE_NETWORK_SCHEMA,
  createAivFlareNetwork,
  resolveAivFlareNetworkPath,
} from './aiv-flare-network.js';

export const AIV_GENERATED_INPUT_SET_SCHEMA = 'AivGeneratedInputSet.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function text(value) { return String(value ?? '').trim(); }
function value(quantity) { return quantity?.value == null ? '' : String(quantity.value); }
function unit(quantity) { return text(quantity?.unit); }
function rowFor(header, values) { return header.map((column) => String(values[column] ?? '')); }

function sourceRow(network, node) {
  const input = node.sourceInput ?? {};
  const trim = input.lowNoiseTrim ?? {};
  return rowFor(AIV_SOURCE_CSV_HEADER, {
    'Source Canonical ID': node.canonicalId,
    'Operating Case': input.caseId,
    'Source Device Type': input.sourceDeviceType,
    'Source State': input.sourceState,
    Phase: input.phase,
    'Mass Flow': value(input.massFlow),
    'Mass Flow Unit': unit(input.massFlow),
    'Upstream Pressure': value(input.upstreamPressure),
    'Upstream Pressure Unit': unit(input.upstreamPressure),
    'Upstream Pressure Basis': input.upstreamPressure?.basis,
    'Downstream Pressure': value(input.downstreamPressure),
    'Downstream Pressure Unit': unit(input.downstreamPressure),
    'Downstream Pressure Basis': input.downstreamPressure?.basis,
    'Reference Pressure': value(input.referencePressure),
    'Reference Pressure Unit': unit(input.referencePressure),
    'Reference Pressure Source': input.referencePressureSource,
    'Reference Pressure Source Revision': input.referencePressureSourceRevision,
    'Upstream Temperature': value(input.upstreamTemperature),
    'Upstream Temperature Unit': unit(input.upstreamTemperature),
    'Molecular Weight': value(input.molecularWeight),
    'Molecular Weight Unit': unit(input.molecularWeight),
    'Low Noise Trim State': trim.state,
    'Low Noise Trim Reduction': value(trim.reduction),
    'Low Noise Trim Unit': unit(trim.reduction),
    'Low Noise Trim Source': trim.source,
    'Low Noise Trim Source Revision': trim.sourceRevision,
    'Sonic State': input.sonicState,
    Source: input.source || network.source,
    'Source Revision': input.sourceRevision || network.sourceRevision,
    'Record ID': input.recordId || `${network.networkId}:SRC:${node.canonicalId}:${input.caseId}`,
    Status: input.status || 'AUTO_GENERATED_FROM_FLARE_NETWORK',
    Reviewer: input.reviewer,
  });
}

function assessmentRow(network, node) {
  const input = node.assessmentInput ?? {};
  return rowFor(AIV_ASSESSMENT_CSV_HEADER, {
    'Assessment Canonical ID': node.canonicalId,
    'Assessment Type': input.assessmentType,
    'Main Outside Diameter': value(input.mainOutsideDiameter),
    'Main Outside Diameter Unit': unit(input.mainOutsideDiameter),
    'Main Inside Diameter': value(input.mainInsideDiameter),
    'Main Inside Diameter Unit': unit(input.mainInsideDiameter),
    'Main Wall Thickness': value(input.mainWallThickness),
    'Main Wall Thickness Unit': unit(input.mainWallThickness),
    'Branch Outside Diameter': value(input.branchOutsideDiameter),
    'Branch Outside Diameter Unit': unit(input.branchOutsideDiameter),
    'Branch Wall Thickness': value(input.branchWallThickness),
    'Branch Wall Thickness Unit': unit(input.branchWallThickness),
    Material: input.material,
    'Duplex State': input.duplexState,
    Source: input.source || network.source,
    'Source Revision': input.sourceRevision || network.sourceRevision,
    'Record ID': input.recordId || `${network.networkId}:ASSESS:${node.canonicalId}`,
    Status: input.status || 'AUTO_GENERATED_FROM_FLARE_NETWORK',
    Reviewer: input.reviewer,
  });
}

function relationshipRow(network, sourceNode, assessmentNode, path) {
  const caseId = sourceNode.sourceInput.caseId;
  const resolved = path.status === 'RESOLVED';
  const status = ({
    RESOLVED: 'AUTO_GENERATED_FROM_FLARE_NETWORK',
    AMBIGUOUS_PATH: 'AUTO_PATH_AMBIGUOUS',
    UNRESOLVED_LENGTH: 'AUTO_DISTANCE_UNRESOLVED',
  })[path.status] ?? 'AUTO_UNRESOLVED';
  return rowFor(AIV_SOURCE_ASSESSMENT_CSV_HEADER, {
    'Source Canonical ID': sourceNode.canonicalId,
    'Assessment Canonical ID': assessmentNode.canonicalId,
    'Operating Case': caseId,
    'Physical Distance': resolved ? String(path.physicalDistanceM) : '',
    'Physical Distance Unit': resolved ? 'm' : '',
    'Distance Source': resolved ? 'AIV_FLARE_NETWORK_PATH_SUM' : '',
    'Distance Source Revision': resolved ? network.revision : '',
    'Simultaneous Source Group': `AUTO:${assessmentNode.canonicalId}:${caseId}`,
    'Applicability Disposition': resolved ? 'APPLICABLE' : 'UNRESOLVED',
    Source: network.source,
    'Source Revision': network.sourceRevision,
    'Record ID': `${network.networkId}:REL:${sourceNode.canonicalId}:${assessmentNode.canonicalId}:${caseId}`,
    Status: status,
    Reviewer: '',
  });
}

function generatedTable(kind, contract, header, rows, network) {
  return {
    kind,
    contract,
    header: [...header],
    rows,
    sourceName: network.networkId,
    sourceKind: 'AIV_FLARE_NETWORK_GENERATED',
    benchmarkId: null,
    dirty: false,
  };
}

export function generateAivInputTablesFromFlareNetwork(networkInput) {
  const network = networkInput?.schema === AIV_FLARE_NETWORK_SCHEMA
    ? networkInput
    : createAivFlareNetwork(networkInput);
  const sources = network.nodes.filter((node) => node.kind === 'SOURCE')
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId) || a.sourceInput.caseId.localeCompare(b.sourceInput.caseId));
  const assessments = network.nodes.filter((node) => node.kind === 'ASSESSMENT')
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  const relationshipRows = [];
  const pathEvidence = [];
  for (const source of sources) {
    for (const assessment of assessments) {
      const path = resolveAivFlareNetworkPath(network, source.canonicalId, assessment.canonicalId);
      if (path.status === 'DISCONNECTED') continue;
      relationshipRows.push(relationshipRow(network, source, assessment, path));
      pathEvidence.push({
        sourceCanonicalId: source.canonicalId,
        assessmentCanonicalId: assessment.canonicalId,
        caseId: source.sourceInput.caseId,
        status: path.status,
        segmentIds: [...path.segmentIds],
        unresolvedSegmentIds: [...(path.unresolvedSegmentIds ?? [])],
        physicalDistanceM: path.physicalDistanceM,
        distanceAuthority: path.status === 'RESOLVED' ? 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH_SUM' : 'UNRESOLVED',
      });
    }
  }
  return deepFreeze({
    schema: AIV_GENERATED_INPUT_SET_SCHEMA,
    network: {
      networkId: network.networkId,
      revision: network.revision,
      source: network.source,
      sourceRevision: network.sourceRevision,
    },
    tables: {
      sources: generatedTable('sources', 'AivSourceCsv.v2', AIV_SOURCE_CSV_HEADER, sources.map((node) => sourceRow(network, node)), network),
      assessments: generatedTable('assessments', 'AivAssessmentCsv.v1', AIV_ASSESSMENT_CSV_HEADER, assessments.map((node) => assessmentRow(network, node)), network),
      relationships: generatedTable('relationships', 'AivSourceAssessmentCsv.v1', AIV_SOURCE_ASSESSMENT_CSV_HEADER, relationshipRows, network),
    },
    pathEvidence,
    policy: {
      svgPixelsAuthoritativeForDistance: false,
      generatedDistanceRequiresUniqueDirectedPath: true,
      generatedDistanceRequiresExplicitSegmentLengths: true,
      assumptionsApplyAfterGeneration: true,
    },
  });
}
