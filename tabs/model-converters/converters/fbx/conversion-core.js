import { canonicalJson } from './canonical-json.js';
import { validateConnectivity, validateConnectivityV2 } from './connectivity.js';
import {
  assertEngineeringAttributePublication,
  buildEngineeringAttributeLedger,
} from './engineering-attributes/ledger.js';
import { prepareGeneratedGapPipeRelease } from './generated-gap-pipe/release.js';
import { validateMappingManifest } from './mapping-validator.js';
import { resolveEntryPorts, resolveEntryPortsV2 } from './port-resolver.js';
import { projectSourceGraphV1 } from './source-graph-v1-compat.js';
import { writeNativeStagedJson, writeNativeStagedJsonV2 } from './staged-writer.js';

export function baseName(name) {
  return String(name || 'model.fbx').replace(/\.[^.]+$/, '');
}

export function artifact(name, value) {
  return { name, text: canonicalJson(value), mime: 'application/json;charset=utf-8' };
}

function report(status, diagnostics, counts) {
  return { schema: 'FbxConversionReport.v1', status, diagnostics: [...diagnostics].sort(), counts };
}

function graphCounts(graph) {
  return graph ? {
    sourceObjects: graph.sourceObjects.length,
    occurrences: graph.occurrences.length,
    geometries: graph.geometries.length,
  } : {};
}

export function blockedResult(stem, graph, status, diagnostics, ledger = null) {
  const outputs = [];
  if (graph) outputs.push(artifact(`${stem}.fbx-source-graph.json`, graph));
  if (ledger) outputs.push(artifact(`${stem}.fbx-mapping-ledger.json`, ledger));
  outputs.push(artifact(`${stem}.fbx-conversion-report.json`, report(status, diagnostics, graphCounts(graph))));
  return { ok: false, blocked: true, conversionStatus: status, outputs,
    logs: { stdout: [], stderr: diagnostics } };
}

export function attachGeneratedGapPipeEvidence(result, stem, value) {
  const evidence = value?.gapPipeEvidence || value;
  if (evidence?.schema !== 'FbxGeneratedGapPipeEvidence.v1') return result;
  if (evidence.status === 'PASS' && !evidence.counts?.generatedPipeCount) return result;
  result.outputs.push(artifact(`${stem}.FbxGeneratedGapPipeEvidence.v1.json`, evidence));
  return result;
}

export function attachEngineeringAttributeLedger(result, stem, value) {
  const ledger = value?.engineeringAttributeLedger || value;
  if (ledger?.schema !== 'FbxEngineeringAttributeLedger.v1') return result;
  result.outputs.push(artifact(`${stem}.FbxEngineeringAttributeLedger.v1.json`, ledger));
  return result;
}

export function packageBlockedResult(stem, graph, status, diagnostics, binding) {
  const result = blockedResult(stem, graph, status, [...binding.statuses, ...diagnostics]);
  result.outputs.push(artifact(`${stem}.fbx-binding-report.json`, binding));
  result.logs.stdout = [...binding.statuses];
  result.logs.stderr = [...diagnostics];
  return result;
}

function promotedRecord(entry, resolvedByEntry) {
  return {
    mappingEntryId: entry.mappingEntryId,
    logicalComponentId: entry.logicalComponentId,
    sourceModelObjectId: entry.sourceModelObjectId,
    sourceOccurrenceId: entry.sourceOccurrenceId,
    componentType: entry.componentType,
    ...(entry.sourceGeometryObjectIds ? { sourceGeometryObjectIds: [...entry.sourceGeometryObjectIds] } : {}),
    ...(entry.engineering ? { engineering: structuredClone(entry.engineering) } : {}),
    ...(entry.generation ? { generation: structuredClone(entry.generation) } : {}),
    ports: resolvedByEntry.get(entry.mappingEntryId),
  };
}

export function mappingLedger(
  mapping,
  resolvedByEntry,
  links,
  releasedEntries = mapping.entries,
  stagedBranches = null,
) {
  const engineeringAttributes = stagedBranches ? buildEngineeringAttributeLedger({
    acceptedEntries: mapping.entries,
    releasedEntries,
    stagedBranches,
  }) : null;
  if (engineeringAttributes) assertEngineeringAttributePublication(engineeringAttributes);
  return {
    schema: 'FbxMappingLedger.v1',
    mappingSchema: mapping.schema,
    scope: mapping.scope,
    exclusions: mapping.exclusions,
    promoted: releasedEntries.map((entry) => promotedRecord(entry, resolvedByEntry)),
    explicitConnections: links.map((link) => link.endpoints),
    ...(engineeringAttributes ? { engineeringAttributes } : {}),
  };
}

export function blockedStatus(diagnostic) {
  if (diagnostic.startsWith('BLOCKED_TRANSFORM')) return 'BLOCKED_TRANSFORM';
  if (diagnostic.startsWith('BLOCKED_STAGEDJSON_CONTRACT')) return 'BLOCKED_STAGEDJSON_CONTRACT';
  if (diagnostic.startsWith('BLOCKED_GAP_PIPE')) return 'BLOCKED_GAP_PIPE';
  if (diagnostic.startsWith('BLOCKED_ENGINEERING_ATTRIBUTES')) return 'BLOCKED_ENGINEERING_ATTRIBUTES';
  return 'BLOCKED_MAPPING';
}

function successOutputs(stem, graph, ledger, staged, counts) {
  const outputs = [
    artifact(`${stem}.fbx-source-graph.json`, graph),
    artifact(`${stem}.fbx-mapping-ledger.json`, ledger),
  ];
  if (ledger.engineeringAttributes) {
    outputs.push(artifact(`${stem}.FbxEngineeringAttributeLedger.v1.json`, ledger.engineeringAttributes));
  }
  outputs.push(
    artifact(`${stem}.staged.json`, staged),
    artifact(`${stem}.fbx-conversion-report.json`, report('STAGEDJSON_PASS', [
      'PARSE_PASS', 'MAPPING_PASS', 'ENGINEERING_ATTRIBUTES_PASS', 'STAGEDJSON_PASS',
    ], counts)),
  );
  return outputs;
}

export function successResult(stem, graph, ledger, staged, counts, gapPipeEvidence = null) {
  const outputs = successOutputs(stem, graph, ledger, staged, counts);
  const stdout = ['PARSE_PASS', 'MAPPING_PASS', 'ENGINEERING_ATTRIBUTES_PASS', 'STAGEDJSON_PASS'];
  const result = { ok: true, blocked: false, conversionStatus: 'STAGEDJSON_PASS', outputs,
    logs: { stdout, stderr: [] } };
  return attachGeneratedGapPipeEvidence(result, stem, gapPipeEvidence);
}

function replaceConversionReport(result, stem, value) {
  const name = `${stem}.fbx-conversion-report.json`;
  const index = result.outputs.findIndex((output) => output.name === name);
  if (index < 0) throw new Error('BLOCKED_STAGEDJSON_CONTRACT conversion report output is missing.');
  result.outputs[index] = artifact(name, value);
}

export function packageSuccessResult(stem, graph, ledger, staged, counts, binding,
  gapPipeEvidence = null) {
  const result = successResult(stem, graph, ledger, staged, counts, gapPipeEvidence);
  const diagnostics = [...binding.statuses, 'ENGINEERING_ATTRIBUTES_PASS'];
  replaceConversionReport(result, stem, report('STAGEDJSON_PASS', diagnostics, counts));
  result.outputs.push(artifact(`${stem}.fbx-binding-report.json`, binding));
  result.logs.stdout = diagnostics;
  return result;
}

export function compatibilityGraph(stem, graph) {
  try {
    return { graph: projectSourceGraphV1(graph), blocked: null };
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    return { graph: null, blocked: blockedResult(stem, graph, 'BLOCKED_PARSE', [diagnostic]) };
  }
}

function v2Release(entries, resolvedByEntry, links) {
  return prepareGeneratedGapPipeRelease({ entries, resolvedByEntry, links });
}

export function executeMapping(mapping, graph, compatibility) {
  const v2 = mapping.schema === 'FbxStagedMapping.v2';
  const authorityGraph = v2 ? graph : compatibility;
  const accepted = validateMappingManifest(mapping, authorityGraph);
  const resolve = v2 ? resolveEntryPortsV2 : resolveEntryPorts;
  const initialResolved = new Map(accepted.entries.map((entry) => [
    entry.mappingEntryId, resolve(entry, authorityGraph),
  ]));
  const initialLinks = v2
    ? validateConnectivityV2(accepted.entries, initialResolved)
    : validateConnectivity(accepted.entries, initialResolved);
  const released = v2 ? v2Release(accepted.entries, initialResolved, initialLinks) : {
    entries: accepted.entries,
    resolvedByEntry: initialResolved,
    links: initialLinks,
    evidence: null,
  };
  const staged = v2
    ? writeNativeStagedJsonV2(released.entries, released.resolvedByEntry, released.links)
    : writeNativeStagedJson(released.entries, released.resolvedByEntry, released.links);
  return {
    accepted,
    entries: released.entries,
    resolvedByEntry: released.resolvedByEntry,
    links: released.links,
    staged,
    gapPipeEvidence: released.evidence,
    v2,
  };
}

function familyCounts(entries) {
  const families = [
    'PIPE', 'ELBOW', 'TEE', 'REDUCER', 'BRANCH_FITTING',
    'FLANGE', 'GASKET', 'VALVE', 'INSTRUMENT',
  ];
  return Object.fromEntries(families.map((type) => [
    type, entries.filter((entry) => entry.componentType === type).length,
  ]));
}

export function successCounts(execution) {
  if (!execution.v2) {
    return {
      promotedPipes: execution.accepted.entries.length,
      explicitConnections: execution.links.length,
      branches: execution.staged.length,
    };
  }
  const generatedGapPipes = execution.gapPipeEvidence?.counts.generatedPipeCount || 0;
  return {
    promotedComponents: execution.accepted.entries.length,
    promotedByFamily: familyCounts(execution.accepted.entries),
    ...(generatedGapPipes ? {
      releasedComponents: execution.entries.length,
      releasedByFamily: familyCounts(execution.entries),
      generatedGapPipes,
    } : {}),
    explicitConnections: execution.links.length,
    branches: execution.staged.length,
  };
}
