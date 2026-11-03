import { sha256Hex } from './source-envelope.js';
import { deepFreezeArtifact, findJsonSafetyErrors } from './extraction-rule.js';
import {
  createExtractionEvidenceTraceId, createExtractionTraceNodeId,
  tracePathForAttempt, tracePathForResult, tracePathForRule,
} from './evidence-identity.js';

function referenceErrors(graph, config, run) {
  const errors = [];
  if (!Array.isArray(graph?.entities) || !Array.isArray(config?.rules) || !Array.isArray(run?.results)) {
    errors.push('Graph entities, configuration rules and run results must be arrays.');
    return errors;
  }
  const entities = new Set(graph.entities.map((entity) => entity.entityId));
  const rules = new Map(config.rules.map((rule) => [rule.ruleId, rule]));
  run.results.forEach((result, index) => {
    const rule = rules.get(result.ruleId);
    if (!entities.has(result.entityId)) errors.push(`Run result ${index} references unknown entity ${result.entityId}.`);
    if (!rule) errors.push(`Run result ${index} references unknown rule ${result.ruleId}.`);
    else if (!rule.enabled) errors.push(`Run result ${index} references disabled rule ${result.ruleId}.`);
  });
  return errors;
}

function authorityErrors(graph, config, run) {
  const errors = [];
  if (graph?.schema !== 'UniversalSourceGraph.v1' || !graph?.validation?.ok) errors.push('A valid UniversalSourceGraph.v1 is required.');
  if (config?.schema !== 'ExtractionConfig.v1' || !config?.validation?.ok) errors.push('A valid ExtractionConfig.v1 is required.');
  if (run?.schema !== 'ExtractionTestRun.v1' || !run?.validation?.ok) errors.push('A valid ExtractionTestRun.v1 is required.');
  if (run?.sourceFileId !== graph?.sourceFileId || run?.sourceRevision !== graph?.sourceRevision || run?.sourceContentHash !== graph?.contentHash || run?.sourceGraphSchema !== graph?.schema) errors.push('Run graph metadata does not match the current graph.');
  if (run?.configId !== config?.configId) errors.push('Run configId does not match the current configuration.');
  errors.push(...referenceErrors(graph, config, run));
  return errors;
}

function traceSummary(nodes) {
  const counts = (kind) => nodes.filter((node) => node.traceNodeKind === kind).length;
  const depth = { root: 0, rule: 1, result: 2, attempt: 3 };
  return {
    nodeCount: nodes.length, ruleNodeCount: counts('rule'), resultNodeCount: counts('result'),
    attemptNodeCount: counts('attempt'), maxDepth: nodes.reduce((max, node) => Math.max(max, depth[node.traceNodeKind] ?? 0), 0),
  };
}

export function summarizeExtractionEvidenceTrace(trace) {
  return traceSummary(trace?.nodes || []);
}

async function rootNode(run, hashText) {
  const traceNodeId = await createExtractionTraceNodeId(run.runId, 'root', 'root', hashText);
  return { traceNodeId, traceNodeKind: 'root', parentTraceNodeId: null, childTraceNodeIds: [], sourceOrder: 0,
    ruleId: null, entityId: null, resultIndex: null, attemptIndex: null, status: '', label: 'Extraction evidence',
    evidence: { scope: { kind: run.scope.kind, entityIds: [...run.scope.entityIds] } } };
}

async function ruleNode(run, rule, rootId, sourceOrder, hashText) {
  const traceNodeId = await createExtractionTraceNodeId(run.runId, tracePathForRule(rule.sourceOrder), 'rule', hashText);
  return { traceNodeId, traceNodeKind: 'rule', parentTraceNodeId: rootId, childTraceNodeIds: [], sourceOrder,
    ruleId: rule.ruleId, entityId: null, resultIndex: null, attemptIndex: null, status: rule.enabled ? 'enabled' : 'disabled',
    label: `${rule.fieldKey} · rule ${rule.sourceOrder}`, evidence: { fieldKey: rule.fieldKey, sourceOrder: rule.sourceOrder, enabled: rule.enabled } };
}

async function resultNode(run, rule, result, resultIndex, parentId, sourceOrder, hashText) {
  const traceNodeId = await createExtractionTraceNodeId(run.runId, tracePathForResult(rule.sourceOrder, resultIndex), 'result', hashText);
  return { traceNodeId, traceNodeKind: 'result', parentTraceNodeId: parentId, childTraceNodeIds: [], sourceOrder,
    ruleId: result.ruleId, entityId: result.entityId, resultIndex, attemptIndex: null, status: result.status,
    label: `${result.fieldKey} · ${result.entityId} · ${result.status}`,
    evidence: { fieldKey: result.fieldKey, sourcePath: result.sourcePath, input: result.input, value: result.value,
      winningStrategyIndex: result.winningStrategyIndex, attemptCount: (result.attempts || []).length } };
}

async function attemptNode(run, rule, result, resultIndex, attempt, parentId, sourceOrder, hashText) {
  const attemptIndex = attempt.strategyIndex;
  const traceNodeId = await createExtractionTraceNodeId(run.runId, tracePathForAttempt(rule.sourceOrder, resultIndex, attemptIndex), 'attempt', hashText);
  return { traceNodeId, traceNodeKind: 'attempt', parentTraceNodeId: parentId, childTraceNodeIds: [], sourceOrder,
    ruleId: result.ruleId, entityId: result.entityId, resultIndex, attemptIndex, status: attempt.outcome,
    label: `Strategy ${attemptIndex} · ${attempt.kind} · ${attempt.outcome}`,
    evidence: JSON.parse(JSON.stringify(attempt)) };
}

async function createNodes(config, run, hashText) {
  const nodes = []; const root = await rootNode(run, hashText); nodes.push(root);
  const enabledRules = config.rules.filter((rule) => rule.enabled).sort((a, b) => a.sourceOrder - b.sourceOrder);
  for (const rule of enabledRules) {
    const ruleNodeValue = await ruleNode(run, rule, root.traceNodeId, nodes.length, hashText);
    nodes.push(ruleNodeValue); root.childTraceNodeIds.push(ruleNodeValue.traceNodeId);
    for (let resultIndex = 0; resultIndex < run.results.length; resultIndex += 1) {
      const result = run.results[resultIndex]; if (result.ruleId !== rule.ruleId) continue;
      const resultNodeValue = await resultNode(run, rule, result, resultIndex, ruleNodeValue.traceNodeId, nodes.length, hashText);
      nodes.push(resultNodeValue); ruleNodeValue.childTraceNodeIds.push(resultNodeValue.traceNodeId);
      const attempts = [...(result.attempts || [])].sort((a, b) => a.strategyIndex - b.strategyIndex);
      for (const attempt of attempts) {
        const attemptNodeValue = await attemptNode(run, rule, result, resultIndex, attempt, resultNodeValue.traceNodeId, nodes.length, hashText);
        nodes.push(attemptNodeValue); resultNodeValue.childTraceNodeIds.push(attemptNodeValue.traceNodeId);
      }
    }
  }
  return nodes;
}

export async function createExtractionEvidenceTrace(graph, config, run, dependencies = {}) {
  const errors = authorityErrors(graph, config, run); if (errors.length) throw new Error(errors.join(' '));
  const hashText = dependencies.hashText || sha256Hex;
  const nodes = await createNodes(config, run, hashText);
  const trace = { schema: 'ExtractionEvidenceTrace.v1', traceId: '', sourceFileId: graph.sourceFileId,
    sourceRevision: graph.sourceRevision, sourceContentHash: graph.contentHash, configId: config.configId, runId: run.runId,
    rootTraceNodeIds: [nodes[0].traceNodeId], nodes, summary: traceSummary(nodes), validation: { ok: true, errors: [], warnings: [] } };
  trace.traceId = await createExtractionEvidenceTraceId(graph, config.configId, run.runId, nodes, hashText);
  trace.validation = await validateExtractionEvidenceTrace(trace, graph, config, run, { hashText });
  return deepFreezeArtifact(trace);
}

function metadataErrors(trace, graph, config, run) {
  const errors = authorityErrors(graph, config, run);
  if (trace?.schema !== 'ExtractionEvidenceTrace.v1') errors.push('Trace schema must be ExtractionEvidenceTrace.v1.');
  if (trace?.sourceFileId !== graph?.sourceFileId || trace?.sourceRevision !== graph?.sourceRevision || trace?.sourceContentHash !== graph?.contentHash) errors.push('Trace graph metadata mismatch.');
  if (trace?.configId !== config?.configId || trace?.runId !== run?.runId) errors.push('Trace config/run metadata mismatch.');
  return errors;
}

function relationshipErrors(trace) {
  const errors = []; const nodes = Array.isArray(trace?.nodes) ? trace.nodes : [];
  const byId = new Map(nodes.map((node) => [node.traceNodeId, node])); const ids = new Set();
  nodes.forEach((node, index) => {
    if (ids.has(node.traceNodeId)) errors.push(`Duplicate trace node ID ${node.traceNodeId}.`); ids.add(node.traceNodeId);
    if (!['root','rule','result','attempt'].includes(node.traceNodeKind)) errors.push(`Trace node ${index} kind is invalid.`);
    if (node.sourceOrder !== index) errors.push(`Trace node ${index} source order mismatch.`);
    const childIds = node.childTraceNodeIds || []; if (new Set(childIds).size !== childIds.length) errors.push(`Trace node ${node.traceNodeId} has duplicate children.`);
    if (node.parentTraceNodeId && !byId.has(node.parentTraceNodeId)) errors.push(`Trace node ${node.traceNodeId} has a missing parent.`);
    childIds.forEach((childId) => {
      const child = byId.get(childId); if (!child) errors.push(`Trace node ${node.traceNodeId} has a missing child ${childId}.`);
      else if (child.parentTraceNodeId !== node.traceNodeId) errors.push(`Trace parent-child disagreement for ${childId}.`);
    });
  });
  const roots = nodes.filter((node) => node.traceNodeKind === 'root');
  if (roots.length !== 1 || (trace?.rootTraceNodeIds || []).length !== 1 || trace.rootTraceNodeIds[0] !== roots[0]?.traceNodeId) errors.push('Trace requires exactly one declared root.');
  errors.push(...reachabilityErrors(nodes, byId, roots[0])); return errors;
}

function reachabilityErrors(nodes, byId, root) {
  if (!root) return [];
  const errors = []; const visiting = new Set(); const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push('Trace contains a cycle.'); return; }
    if (visited.has(id)) return; visiting.add(id);
    (byId.get(id)?.childTraceNodeIds || []).forEach(visit);
    visiting.delete(id); visited.add(id);
  }
  visit(root.traceNodeId);
  if (visited.size !== nodes.length) errors.push('Trace contains unreachable nodes.');
  return errors;
}

function resultEvidence(result) {
  return { fieldKey: result.fieldKey, sourcePath: result.sourcePath, input: result.input, value: result.value,
    winningStrategyIndex: result.winningStrategyIndex, attemptCount: (result.attempts || []).length };
}

async function ruleCoverageErrors(nodes, config, run, root, hashText) {
  const errors = []; const ruleNodes = nodes.filter((node) => node.traceNodeKind === 'rule');
  const enabledRules = config.rules.filter((rule) => rule.enabled).sort((a, b) => a.sourceOrder - b.sourceOrder);
  const enabledIds = new Set(enabledRules.map((rule) => rule.ruleId));
  if (ruleNodes.length !== enabledRules.length) errors.push('Trace rule-node count must equal enabled rule count.');
  ruleNodes.forEach((node) => { if (!enabledIds.has(node.ruleId)) errors.push(`Trace contains unknown or disabled rule node ${node.ruleId}.`); });
  const expectedRootChildren = [];
  for (const rule of enabledRules) {
    const matches = ruleNodes.filter((node) => node.ruleId === rule.ruleId);
    if (matches.length !== 1) { errors.push(`Enabled rule ${rule.ruleId} must have exactly one trace node.`); continue; }
    const node = matches[0]; const expectedId = await createExtractionTraceNodeId(run.runId, tracePathForRule(rule.sourceOrder), 'rule', hashText);
    expectedRootChildren.push(expectedId);
    if (node.traceNodeId !== expectedId) errors.push(`Rule trace ${rule.ruleId} identity mismatch.`);
    if (node.parentTraceNodeId !== root?.traceNodeId) errors.push(`Rule trace ${rule.ruleId} has incorrect parent.`);
    const expectedEvidence = { fieldKey: rule.fieldKey, sourceOrder: rule.sourceOrder, enabled: rule.enabled };
    if (node.status !== 'enabled' || JSON.stringify(node.evidence) !== JSON.stringify(expectedEvidence)) errors.push(`Rule trace ${rule.ruleId} evidence mismatch.`);
  }
  if (JSON.stringify(root?.childTraceNodeIds || []) !== JSON.stringify(expectedRootChildren)) errors.push('Root rule-child order mismatch.');
  return errors;
}

async function resultCoverageErrors(nodes, graph, config, run, hashText) {
  const errors = []; const ruleMap = new Map(config.rules.map((rule) => [rule.ruleId, rule]));
  const entityIds = new Set(graph.entities.map((entity) => entity.entityId));
  const resultNodes = nodes.filter((node) => node.traceNodeKind === 'result');
  const attemptNodes = nodes.filter((node) => node.traceNodeKind === 'attempt');
  for (let resultIndex = 0; resultIndex < run.results.length; resultIndex += 1) {
    const result = run.results[resultIndex]; const rule = ruleMap.get(result.ruleId);
    const matches = resultNodes.filter((node) => node.resultIndex === resultIndex);
    if (matches.length !== 1) { errors.push(`Run result ${resultIndex} must have exactly one trace node.`); continue; }
    const node = matches[0]; const ruleNodeValue = nodes.find((item) => item.traceNodeKind === 'rule' && item.ruleId === result.ruleId);
    if (!rule) errors.push(`Unknown rule ID ${node.ruleId}.`); if (!entityIds.has(node.entityId)) errors.push(`Unknown entity ID ${node.entityId}.`);
    if (node.ruleId !== result.ruleId || node.entityId !== result.entityId || node.status !== result.status || JSON.stringify(node.evidence) !== JSON.stringify(resultEvidence(result))) errors.push(`Trace result ${resultIndex} evidence mismatch.`);
    if (node.parentTraceNodeId !== ruleNodeValue?.traceNodeId) errors.push(`Trace result ${resultIndex} has incorrect rule parent.`);
    const expectedId = rule ? await createExtractionTraceNodeId(run.runId, tracePathForResult(rule.sourceOrder, resultIndex), 'result', hashText) : '';
    if (node.traceNodeId !== expectedId) errors.push(`Trace result ${resultIndex} identity mismatch.`);
    const storedAttempts = [...(result.attempts || [])].sort((a, b) => a.strategyIndex - b.strategyIndex);
    const expectedChildren = [];
    for (const attempt of storedAttempts) {
      const attemptMatches = attemptNodes.filter((item) => item.resultIndex === resultIndex && item.attemptIndex === attempt.strategyIndex);
      if (attemptMatches.length !== 1) { errors.push(`Stored attempt ${resultIndex}/${attempt.strategyIndex} must have exactly one trace node.`); continue; }
      const attemptNodeValue = attemptMatches[0];
      const expectedAttemptId = rule ? await createExtractionTraceNodeId(run.runId, tracePathForAttempt(rule.sourceOrder, resultIndex, attempt.strategyIndex), 'attempt', hashText) : '';
      expectedChildren.push(expectedAttemptId);
      if (attemptNodeValue.traceNodeId !== expectedAttemptId) errors.push(`Stored attempt ${resultIndex}/${attempt.strategyIndex} identity mismatch.`);
      if (attemptNodeValue.parentTraceNodeId !== node.traceNodeId) errors.push(`Stored attempt ${resultIndex}/${attempt.strategyIndex} has incorrect result parent.`);
      if (attemptNodeValue.ruleId !== result.ruleId || attemptNodeValue.entityId !== result.entityId || attemptNodeValue.status !== attempt.outcome || JSON.stringify(attemptNodeValue.evidence) !== JSON.stringify(attempt)) errors.push(`Stored attempt ${resultIndex}/${attempt.strategyIndex} evidence mismatch.`);
      if ((attemptNodeValue.childTraceNodeIds || []).length) errors.push(`Stored attempt ${resultIndex}/${attempt.strategyIndex} cannot have children.`);
    }
    if (JSON.stringify(node.childTraceNodeIds || []) !== JSON.stringify(expectedChildren)) errors.push(`Trace result ${resultIndex} attempt-child order mismatch.`);
  }
  if (resultNodes.length !== run.results.length) errors.push('Trace result-node count must equal run result count.');
  const totalAttempts = run.results.reduce((sum, result) => sum + (result.attempts || []).length, 0);
  if (attemptNodes.length !== totalAttempts) errors.push('Trace attempt-node count must equal stored attempt count.');
  return errors;
}

async function coverageErrors(trace, graph, config, run, hashText) {
  const nodes = trace?.nodes || []; const root = nodes.find((node) => node.traceNodeKind === 'root');
  return [
    ...await ruleCoverageErrors(nodes, config, run, root, hashText),
    ...await resultCoverageErrors(nodes, graph, config, run, hashText),
  ];
}

export async function validateExtractionEvidenceTrace(trace, graph, config, run, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const errors = [...metadataErrors(trace, graph, config, run), ...findJsonSafetyErrors(trace, 'Trace')];
  if (!Array.isArray(trace?.nodes)) errors.push('Trace nodes must be an array.');
  else { errors.push(...relationshipErrors(trace)); errors.push(...await coverageErrors(trace, graph, config, run, hashText)); }
  const expectedSummary = traceSummary(trace?.nodes || []);
  for (const [key, value] of Object.entries(expectedSummary)) if (trace?.summary?.[key] !== value) errors.push(`Trace summary ${key} mismatch.`);
  if (Array.isArray(trace?.nodes)) {
    const expectedId = await createExtractionEvidenceTraceId(graph, config?.configId, run?.runId, trace.nodes, hashText);
    if (trace.traceId !== expectedId) errors.push('Trace ID does not match canonical evidence.');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [] };
}

export function serializeExtractionEvidenceTrace(trace) {
  return `${JSON.stringify(trace, null, 2)}\n`;
}
