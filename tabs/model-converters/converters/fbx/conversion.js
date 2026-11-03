// Orchestrate FBX parsing, evidence binding, mapping selection, and StagedJSON conversion.
// Inputs are explicit conversion options; outputs preserve blocked states without hidden fallback.
import {
  addBinding, addMappingBinding, addStatus, createBindingReport,
  failBindingReport, finishBindingReport, invalidBindingReport,
} from './binding-report.js';
import {
  artifact,
  attachEngineeringAttributeLedger,
  attachGeneratedGapPipeEvidence,
  baseName,
  blockedResult,
  blockedStatus,
  compatibilityGraph,
  executeMapping,
  mappingLedger,
  packageBlockedResult,
  packageSuccessResult,
  successCounts,
  successResult,
} from './conversion-core.js';
import {
  BindingFailure, isMappingPackage, observeSource, validateMappingPackageShape,
  verifyMappingBinding, verifyParserBinding, verifySourceBinding, verifySourceGraphBinding,
} from './mapping-package.js';
import {
  compileMappingDecisions, validateDecisionSetShape,
} from './mapping-decision-compiler.js';
import { generateDraftDecisions } from './mapping-heuristic.js';
import { buildMappingWorklist } from './mapping-worklist.js';

function diagnosticOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function failureStatus(error, fallback) {
  return error instanceof BindingFailure ? error.status : fallback;
}

function attachFailureEvidence(result, stem, error) {
  attachGeneratedGapPipeEvidence(result, stem, error);
  attachEngineeringAttributeLedger(result, stem, error);
  return result;
}

function packageFailure(stem, graph, reportValue, error, fallback) {
  const diagnostic = diagnosticOf(error), status = failureStatus(error, fallback);
  const binding = failBindingReport(reportValue, status, diagnostic, error?.evidence);
  const result = packageBlockedResult(stem, graph, status, [diagnostic], binding);
  return attachFailureEvidence(result, stem, error);
}

function blockedFailure(stem, graph, status, error) {
  const result = blockedResult(stem, graph, status, [diagnosticOf(error)]);
  return attachFailureEvidence(result, stem, error);
}

function createValidatedBinding(packageValue) {
  validateMappingPackageShape(packageValue);
  return createBindingReport(packageValue);
}

async function addSourceBinding(binding, packageValue, bytes) {
  return addBinding(binding, 'source', verifySourceBinding(packageValue, await observeSource(bytes)));
}

function addParserBinding(binding, packageValue, parserEvidence, parserEvidenceError) {
  if (parserEvidenceError) {
    const detail = parserEvidenceError.replace(/^BLOCKED_PARSER_BINDING\s+/, '');
    throw new BindingFailure('BLOCKED_PARSER_BINDING', detail);
  }
  if (!parserEvidence) throw new BindingFailure('BLOCKED_PARSER_BINDING', 'Repository parser evidence is unavailable.');
  return addBinding(binding, 'parser', verifyParserBinding(packageValue, parserEvidence));
}

async function parsePackageSource(bytes, parse, binding) {
  try {
    const graph = await parse(bytes);
    return { graph, binding: addStatus(binding, 'PARSE_PASS') };
  } catch (error) {
    throw new BindingFailure('BLOCKED_PARSE', diagnosticOf(error));
  }
}

async function packageConversion(options) {
  const { bytes, stem, packageValue, parse, parserEvidence, parserEvidenceError } = options;
  let binding;
  try {
    binding = createValidatedBinding(packageValue);
  } catch (error) {
    const reportValue = invalidBindingReport(failureStatus(error, 'BLOCKED_MAPPING_BINDING'), diagnosticOf(error));
    return packageFailure(stem, null, reportValue, error, 'BLOCKED_MAPPING_BINDING');
  }
  try {
    binding = await addSourceBinding(binding, packageValue, bytes);
  } catch (error) {
    return packageFailure(stem, null, binding, error, 'BLOCKED_SOURCE_BINDING');
  }
  try {
    binding = addParserBinding(binding, packageValue, parserEvidence, parserEvidenceError);
  } catch (error) {
    return packageFailure(stem, null, binding, error, 'BLOCKED_PARSER_BINDING');
  }
  const parsed = await packageParsedResult({ bytes, stem, parse, binding });
  if (parsed.blocked) return parsed.blocked;
  return packageGraphResult({ ...options, graph: parsed.graph, binding: parsed.binding });
}

async function packageParsedResult({ bytes, stem, parse, binding }) {
  try {
    const parsed = await parsePackageSource(bytes, parse, binding);
    return { ...parsed, blocked: null };
  } catch (error) {
    return { blocked: packageFailure(stem, null, binding, error, 'BLOCKED_PARSE') };
  }
}

async function packageGraphResult(options) {
  const { stem, packageValue, graph } = options;
  let { binding } = options;
  try {
    binding = addBinding(binding, 'sourceGraph', await verifySourceGraphBinding(packageValue, graph));
  } catch (error) {
    return packageFailure(stem, graph, binding, error, 'BLOCKED_SOURCE_GRAPH_BINDING');
  }
  const compatibility = compatibilityGraph(stem, graph);
  if (compatibility.blocked) return packageCompatibilityFailure(stem, graph, binding, compatibility);
  return packageMappingResult({ ...options, binding, compatibility: compatibility.graph });
}

function packageCompatibilityFailure(stem, graph, binding, compatibility) {
  const diagnostic = compatibility.blocked.logs.stderr[0] || 'FbxSourceGraph.v1 compatibility projection failed.';
  const error = new BindingFailure('BLOCKED_PARSE', diagnostic);
  return packageFailure(stem, graph, binding, error, 'BLOCKED_PARSE');
}

async function packageMappingResult(options) {
  const { stem, packageValue, graph, compatibility } = options;
  let { binding } = options;
  try {
    binding = addMappingBinding(binding, await verifyMappingBinding(packageValue));
  } catch (error) {
    return packageFailure(stem, graph, binding, error, 'BLOCKED_MAPPING_BINDING');
  }
  try {
    const execution = executeMapping(packageValue.mapping.manifest, graph, compatibility);
    const ledger = mappingLedger(execution.accepted, execution.resolvedByEntry,
      execution.links, execution.entries, execution.staged);
    binding = finishBindingReport(addStatus(addStatus(binding, 'MAPPING_PASS'), 'STAGEDJSON_PASS'), 'STAGEDJSON_PASS');
    return packageSuccessResult(stem, graph, ledger, execution.staged,
      successCounts(execution), binding, execution.gapPipeEvidence);
  } catch (error) {
    const status = blockedStatus(diagnosticOf(error));
    return packageFailure(stem, graph, binding, error, status);
  }
}

async function legacyConversion({ bytes, stem, mapping, parse }) {
  let graph;
  try {
    graph = await parse(bytes);
  } catch (error) {
    return blockedResult(stem, null, 'BLOCKED_PARSE', [diagnosticOf(error)]);
  }
  const compatibility = compatibilityGraph(stem, graph);
  if (compatibility.blocked) return compatibility.blocked;
  try {
    const execution = executeMapping(mapping, graph, compatibility.graph);
    const ledger = mappingLedger(execution.accepted, execution.resolvedByEntry,
      execution.links, execution.entries, execution.staged);
    return successResult(stem, graph, ledger, execution.staged,
      successCounts(execution), execution.gapPipeEvidence);
  } catch (error) {
    return blockedFailure(stem, graph, blockedStatus(diagnosticOf(error)), error);
  }
}

function markLegacy(result) {
  return { ...result, logs: { ...result.logs, stdout: ['UNBOUND_LEGACY_MAPPING', ...result.logs.stdout] } };
}

function isDecisionSet(value) {
  return value && typeof value === 'object' && value.schema === 'FbxMappingDecisionSet.v1';
}

async function decisionSetConversion({ bytes, stem, decisionSet, parse, parserEvidence, parserEvidenceError }) {
  if (parserEvidenceError) {
    const diagnostic = parserEvidenceError.replace(/^BLOCKED_PARSER_BINDING\s+/, '');
    return blockedResult(stem, null, 'BLOCKED_PARSER_BINDING', [diagnostic]);
  }
  if (!parserEvidence) {
    return blockedResult(stem, null, 'BLOCKED_PARSER_BINDING', ['Parser evidence is unavailable for decision-set compilation.']);
  }
  try { validateDecisionSetShape(decisionSet); } catch (error) {
    return blockedResult(stem, null, 'BLOCKED_DECISION_BINDING', [diagnosticOf(error)]);
  }
  let graph;
  try {
    graph = await parse(bytes);
  } catch (error) {
    return blockedResult(stem, null, 'BLOCKED_PARSE', [diagnosticOf(error)]);
  }
  let compiledManifest;
  try {
    const worklist = await buildMappingWorklist({ bytes, graph, parserEvidence });
    compiledManifest = await compileMappingDecisions({
      bytes, graph, parserEvidence, worklist, decisionSet,
    });
  } catch (error) {
    const compatibility = compatibilityGraph(stem, graph);
    const reportGraph = compatibility.blocked ? null : graph;
    return blockedResult(stem, reportGraph, 'BLOCKED_DECISION_BINDING', [diagnosticOf(error)]);
  }
  const compatibility = compatibilityGraph(stem, graph);
  if (compatibility.blocked) return compatibility.blocked;
  try {
    const execution = executeMapping(compiledManifest, graph, compatibility.graph);
    const ledger = mappingLedger(execution.accepted, execution.resolvedByEntry,
      execution.links, execution.entries, execution.staged);
    return successResult(stem, graph, ledger, execution.staged,
      successCounts(execution), execution.gapPipeEvidence);
  } catch (error) {
    return blockedFailure(stem, graph, blockedStatus(diagnosticOf(error)), error);
  }
}

export async function convertFbxToStagedJson({
  bytes, inputName, mapping, mappingError, parse, parserEvidence, parserEvidenceError,
}) {
  const stem = baseName(inputName);
  if (!mappingError && isDecisionSet(mapping)) {
    return decisionSetConversion({
      bytes, stem, decisionSet: mapping, parse, parserEvidence, parserEvidenceError,
    });
  }
  if (mappingError || !mapping) {
    const diagnostic = mappingError || 'Mapping manifest is absent. StagedJSON conversion skipped. FBX Source Graph extracted successfully.';
    return legacyMappingProblem({ bytes, stem, parse, parserEvidence, diagnostic });
  }
  if (isMappingPackage(mapping)) {
    return packageConversion({
      bytes, stem, packageValue: mapping, parse, parserEvidence, parserEvidenceError,
    });
  }
  return markLegacy(await legacyConversion({ bytes, stem, mapping, parse }));
}

async function legacyMappingProblem({ bytes, stem, parse, parserEvidence, diagnostic }) {
  let graph;
  try {
    graph = await parse(bytes);
  } catch (error) {
    return blockedResult(stem, null, 'BLOCKED_PARSE', [diagnosticOf(error)]);
  }
  const compatibility = compatibilityGraph(stem, graph);
  if (compatibility.blocked) return compatibility.blocked;
  const result = blockedResult(stem, graph, 'BLOCKED_MAPPING', [diagnostic]);
  if (parserEvidence) {
    try {
      const worklist = await buildMappingWorklist({ bytes, graph, parserEvidence });
      result.outputs.splice(1, 0, artifact(`${stem}.fbx-mapping-worklist.json`, worklist));
      const draft = generateDraftDecisions(worklist);
      result.outputs.splice(2, 0, artifact(`${stem}.fbx-draft-decisions.json`, draft));
      result.logs.stdout = ['PARSE_PASS', 'WORKLIST_GENERATED', 'DRAFT_DECISIONS_GENERATED'];
    } catch (_) {
      // Worklist generation is best-effort; don't fail the whole conversion.
    }
  }
  return result;
}
