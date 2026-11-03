/**
 * Functionality: route produced or consumed InputXML through the shared structural preflight worker.
 * Parameters: converter context, exact InputXML text/name, and whether the source is an input or output.
 * Outputs: canonical XML plus evidence on PASS, or evidence only for BLOCKED/DIAGNOSTIC outcomes.
 * Fallback: none; missing worker/runtime evidence raises an explicit error.
 */
import { buildInputXmlCompatibilityRequest } from '../../../converters/inputxml-release/inputxml-compatibility-request.js';
import { baseNameWithoutExtension, encodeTextUtf8 } from '../core/output-utils.js';

const INTERNAL_PREFLIGHT_ID = 'inputxml_compatibility_preflight';

function evidenceName(stem, name) {
  return `${stem}_inputxml_${String(name).replace(/^inputxml_/, '')}`;
}

function renamedEvidence(outputs, stem) {
  return (Array.isArray(outputs) ? outputs : [])
    .filter((output) => output?.role !== 'canonicalInputXml')
    .map((output) => ({ ...output, name: evidenceName(stem, output.name) }));
}

function canonicalArtifact(outputs) {
  return (Array.isArray(outputs) ? outputs : []).find((output) => output?.role === 'canonicalInputXml');
}

export async function runInputXmlCompatibilityPreflight(context, input) {
  if (!context?.workerRunner) throw new Error('InputXML compatibility preflight requires the Python worker runtime.');
  const sourceBytes = encodeTextUtf8(input.xmlText);
  const request = await buildInputXmlCompatibilityRequest({
    converterId: context.converterId,
    sourceName: input.sourceName,
    sourceBytes,
    options: context.options,
  });
  const response = await context.workerRunner.runJob({
    converterId: INTERNAL_PREFLIGHT_ID,
    inputFiles: [{ role: 'primary', name: input.sourceName, bytes: sourceBytes }],
    options: { inputXmlCompatibilityRequest: request },
  });
  const preflight = response?.logs?.preflight;
  if (!preflight || preflight.schema !== 'InputXmlReleasePreflightResult.v1') {
    throw new Error('InputXML compatibility worker returned no typed preflight result.');
  }
  const stem = baseNameWithoutExtension(input.sourceName);
  const evidence = renamedEvidence(response.outputs, stem);
  if (!preflight.releaseEligible) {
    return Object.freeze({
      status: preflight.status,
      releaseEligible: false,
      canonicalOutput: null,
      evidence,
      logs: response.logs,
      request,
    });
  }
  const canonical = canonicalArtifact(response.outputs);
  if (!canonical?.text) throw new Error('PASS InputXML compatibility preflight returned no canonical XML.');
  return Object.freeze({
    status: 'PASS',
    releaseEligible: true,
    canonicalOutput: {
      ...canonical,
      name: input.outputName,
      mime: 'application/xml;charset=utf-8',
    },
    evidence,
    logs: response.logs,
    request,
  });
}

export async function gateProducedInputXml(context, input) {
  const result = await runInputXmlCompatibilityPreflight(context, input);
  return {
    ...result,
    outputs: result.canonicalOutput ? [result.canonicalOutput, ...result.evidence] : result.evidence,
  };
}
