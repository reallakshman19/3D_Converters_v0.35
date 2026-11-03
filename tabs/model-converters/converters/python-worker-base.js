/**
 * Functionality: run generic Python converters and structurally gate produced InputXML.
 * Parameters: converter context with exact input bytes, options, and a worker runner.
 * Outputs: original sidecars plus canonical InputXML/evidence when preflight passes.
 * Fallback: none; governed producers return evidence without InputXML when blocked.
 */
import { gateProducedInputXml } from './inputxml-compatibility-gate.js';

const INPUTXML_PRODUCERS = Object.freeze(new Set([
  'pdf_to_inputxml',
  'pdf_to_inputxml_cii14',
]));

export async function run(context) {
  if (!context.workerRunner) {
    throw new Error('Python worker runtime is not available.');
  }
  const primary = context.inputFiles.find(f => f.role === 'primary');
  if (!primary || !primary.bytes) {
    throw new Error('Primary input file is required for this converter.');
  }
  
  const inputFiles = context.inputFiles.map(file => ({
    name: file.name,
    bytes: file.bytes
  }));

  const response = await context.workerRunner.runJob({
    converterId: context.converterId,
    inputFiles,
    options: context.options
  });

  if (!INPUTXML_PRODUCERS.has(context.converterId)) return response;
  const outputs = Array.isArray(response.outputs) ? response.outputs : [];
  const produced = outputs.find((output) => output?.mime?.startsWith('application/xml') || /\.xml$/i.test(output?.name || ''));
  if (!produced?.text) throw new Error(`${context.converterId} returned no InputXML output for structural preflight.`);
  const gated = await gateProducedInputXml(context, {
    xmlText: produced.text,
    sourceName: produced.name,
    outputName: produced.name,
  });
  if (!gated.releaseEligible) context.setStatus?.(`${context.converterId} ${gated.status}; no InputXML was released.`, 'warn');
  return {
    ...response,
    ok: gated.releaseEligible,
    outputs: [
      ...outputs.filter((output) => output !== produced),
      ...gated.outputs,
    ],
    logs: {
      ...(response.logs || {}),
      preflight: gated.logs?.preflight,
      inputXmlCompatibilityRequest: gated.request,
    },
  };
}
