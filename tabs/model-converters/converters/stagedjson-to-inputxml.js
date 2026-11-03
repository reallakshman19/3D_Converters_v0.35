/**
 * Functionality: produce StagedJSON previews, topology evidence, and gated canonical InputXML.
 * Parameters: converter context containing staged JSON bytes and explicit compatibility options.
 * Outputs: preview/topology sidecars plus canonical InputXML and structural evidence on PASS.
 * Fallback: none; blocking preflight omits the generated InputXML.
 */
import { decodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';
import {
  buildComponentTopologyArtifacts,
  topologyArtifactOutputs,
} from './component-topology/topology-artifact-exporter.js';
import {
  SUPPORT_PROJECTION_TOLERANCE_MM,
  TOPOLOGY_TOLERANCE_MM,
} from './component-topology/topology-values.js';
import { gateProducedInputXml } from './inputxml-compatibility-gate.js';

/** Keep host callbacks on the main thread; worker options are data only. */
function serializableWorkerOptions(options) {
  const record = options && typeof options === 'object' ? options : {};
  return Object.fromEntries(Object.entries(record).filter(([, value]) => typeof value !== 'function'));
}

async function buildTopologyOutputs(sourceText, sourceName, stem) {
  const artifacts = await buildComponentTopologyArtifacts(sourceText, {
    sourceName,
    jobName: stem,
    toleranceMm: TOPOLOGY_TOLERANCE_MM,
    supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
    enrichmentConfig: {},
  });
  const blocking = artifacts.buildIssues.filter((issue) => issue.blocking !== false);
  if (blocking.length) {
    return [{
      name: `${stem}.topology-build-issues.json`,
      text: JSON.stringify({
        schema: 'ComponentTopologyBuildIssues.v1',
        outputReady: false,
        sourceName,
        reason: 'Canonical topology artifacts were omitted because topology validation reported blocking findings.',
        buildIssues: artifacts.buildIssues,
      }, null, 2),
      mime: 'application/json;charset=utf-8',
    }];
  }
  return topologyArtifactOutputs(artifacts, { stem });
}

export async function run(context) {
  if (!context.workerRunner) {
    throw new Error('Python worker runtime is not available.');
  }
  const primary = context.inputFiles.find(f => f.role === 'primary');
  if (!primary || !primary.bytes) {
    throw new Error('Primary staged JSON input is required for StagedJSON -> InputXML conversion.');
  }

  // Retain the source text before postMessage transfers ownership of the
  // ArrayBuffer to the worker and detaches it from this main-thread view.
  const stagedJsonPreviewText = decodeTextUtf8(primary.bytes);
  const response = await context.workerRunner.runJob({
    converterId: context.converterId,
    inputFiles: context.inputFiles,
    options: serializableWorkerOptions(context.options),
  });

  const stem = baseNameWithoutExtension(primary.name);
  const topologyOutputs = await buildTopologyOutputs(stagedJsonPreviewText, primary.name, stem);

  const outputs = Array.isArray(response.outputs) ? response.outputs : [];
  const produced = outputs.find((output) => output?.mime?.startsWith('application/xml') || /\.xml$/i.test(output?.name || ''));
  if (!produced?.text) throw new Error('StagedJSON -> InputXML returned no XML for structural preflight.');
  const gated = await gateProducedInputXml(context, {
    xmlText: produced.text,
    sourceName: produced.name,
    outputName: produced.name,
  });
  if (!gated.releaseEligible) context.setStatus?.(`StagedJSON -> InputXML ${gated.status}; no InputXML was released.`, 'warn');
  const previewOutputs = [
    {
      name: `${stem}_managed_stage_preview.json`,
      text: stagedJsonPreviewText,
      mime: 'application/json;charset=utf-8',
    },
    ...topologyOutputs,
    ...outputs.filter((output) => output !== produced),
    ...gated.outputs,
  ];

  return {
    ...response,
    ok: gated.releaseEligible,
    outputs: previewOutputs,
    logs: {
      ...(response.logs || {}),
      preflight: gated.logs?.preflight,
      inputXmlCompatibilityRequest: gated.request,
    },
  };
}
