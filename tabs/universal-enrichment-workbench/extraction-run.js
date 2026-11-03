import { sha256Hex } from './source-envelope.js';
import { deepFreezeArtifact, findJsonSafetyErrors } from './extraction-rule.js';
import { testExtractionRule } from './extraction-strategy.js';

export const EXTRACTION_ENTITY_LIMIT = 5000;
export const EXTRACTION_INPUT_LIMIT = 10000;
const GRAPH_SCHEMA = 'UniversalSourceGraph.v1';
const CONFIG_SCHEMA = 'ExtractionConfig.v1';

function graphIdentity(graph) {
  return [graph?.sourceFileId, graph?.sourceRevision, graph?.contentHash, graph?.schema].join('|');
}

function orderedGraphEntities(graph) {
  return [...(graph?.entities || [])].sort((a, b) => a.sourceOrder - b.sourceOrder || a.entityId.localeCompare(b.entityId));
}

function validGraph(graph) {
  return graph?.schema === GRAPH_SCHEMA && graph?.validation?.ok && Array.isArray(graph.entities);
}

function validConfig(config) {
  return config?.schema === CONFIG_SCHEMA && config?.validation?.ok && Array.isArray(config.rules);
}

export function normalizeExtractionScope(graph, scope = {}) {
  const kind = String(scope.kind || 'all');
  const byId = new Map((graph?.entities || []).map((entity) => [entity.entityId, entity]));
  let entityIds;
  if (kind === 'all' && !(scope.entityIds || []).length) entityIds = orderedGraphEntities(graph).map((entity) => entity.entityId);
  else entityIds = [...new Set((scope.entityIds || []).map(String))];
  if (kind === 'selected' && entityIds.length !== 1) throw new Error('Selected scope requires one entity.');
  if (!['selected', 'filtered', 'all'].includes(kind)) throw new Error('Extraction scope kind is invalid.');
  const unknown = entityIds.find((id) => !byId.has(id));
  if (unknown) throw new Error(`Extraction scope contains unknown entity ${unknown}.`);
  const requestedEntityCount = Number.isInteger(scope.requestedEntityCount) ? scope.requestedEntityCount : entityIds.length;
  if (requestedEntityCount < entityIds.length) throw new Error('Extraction scope requestedEntityCount is invalid.');
  return { kind, entityIds, requestedEntityCount };
}

async function createRunId(graph, configId, scope, hashText) {
  const identity = `${graphIdentity(graph)}\0${configId}\0${scope.kind}\0${scope.entityIds.join('\0')}`;
  const digest = await hashText(identity);
  return `extract-run-${digest.slice(0, 32)}`;
}

function runSummary(scopeCount, results, truncated) {
  return {
    testedEntityCount: scopeCount,
    attemptCount: results.reduce((sum, result) => sum + result.attempts.length, 0),
    matchedCount: results.filter((result) => result.status === 'matched').length,
    rejectedCount: results.filter((result) => result.status === 'rejected').length,
    truncated,
  };
}

function runWarnings(truncated) {
  return truncated ? [`Entity scope exceeded ${EXTRACTION_ENTITY_LIMIT}; the run was truncated.`] : [];
}

function authoritativeInputScope(inputScope = {}) {
  return inputScope.kind === 'all' ? { kind: 'all', entityIds: [] } : inputScope;
}

export async function createExtractionTestRun(graph, config, inputScope, dependencies = {}) {
  if (!validGraph(graph)) throw new Error(`A valid ${GRAPH_SCHEMA} is required.`);
  if (!validConfig(config)) throw new Error(`A valid ${CONFIG_SCHEMA} is required.`);
  const hashText = dependencies.hashText || sha256Hex;
  const scope = normalizeExtractionScope(graph, authoritativeInputScope(inputScope));
  const requestedEntityCount = scope.entityIds.length;
  const truncated = requestedEntityCount > EXTRACTION_ENTITY_LIMIT;
  const entityIds = scope.entityIds.slice(0, EXTRACTION_ENTITY_LIMIT);
  const byId = new Map(graph.entities.map((entity) => [entity.entityId, entity]));
  const rules = config.rules.filter((rule) => rule.enabled).sort((a, b) => a.sourceOrder - b.sourceOrder);
  const results = [];
  entityIds.forEach((entityId) => {
    const entity = byId.get(entityId);
    rules.forEach((rule) => {
      const result = testExtractionRule(rule, entity, EXTRACTION_INPUT_LIMIT);
      if (result) results.push(result);
    });
  });
  const frozenScope = { kind: scope.kind, entityIds, requestedEntityCount };
  const run = {
    schema: 'ExtractionTestRun.v1',
    runId: await createRunId(graph, config.configId, frozenScope, hashText),
    sourceFileId: graph.sourceFileId, sourceRevision: graph.sourceRevision,
    sourceContentHash: graph.contentHash, sourceGraphSchema: graph.schema,
    configId: config.configId, scope: frozenScope, results,
    summary: runSummary(entityIds.length, results, truncated),
    validation: { ok: true, errors: [], warnings: runWarnings(truncated) },
  };
  run.validation = await validateExtractionTestRun(run, graph, config, { hashText });
  return deepFreezeArtifact(run);
}

function metadataErrors(run, graph, config) {
  const errors = [];
  if (run?.schema !== 'ExtractionTestRun.v1') errors.push('Test run schema must be ExtractionTestRun.v1.');
  if (graph?.schema !== GRAPH_SCHEMA) errors.push(`Current graph schema must be ${GRAPH_SCHEMA}.`);
  if (config?.schema !== CONFIG_SCHEMA) errors.push(`Current configuration schema must be ${CONFIG_SCHEMA}.`);
  if (run?.sourceGraphSchema !== GRAPH_SCHEMA) errors.push(`Test run sourceGraphSchema must be ${GRAPH_SCHEMA}.`);
  if (run?.sourceFileId !== graph?.sourceFileId || run?.sourceRevision !== graph?.sourceRevision || run?.sourceContentHash !== graph?.contentHash || run?.sourceGraphSchema !== graph?.schema) {
    errors.push('Test run graph metadata does not match the current graph.');
  }
  if (run?.configId !== config?.configId) errors.push('Test run configId does not match the current configuration.');
  return errors;
}

function resultErrors(run, graph, config) {
  const errors = [];
  const entityIds = new Set((graph?.entities || []).map((entity) => entity.entityId));
  const scopeIds = new Set(run?.scope?.entityIds || []);
  const ruleIds = new Set((config?.rules || []).map((rule) => rule.ruleId));
  const pairs = new Set();
  (run?.results || []).forEach((result) => {
    const pair = `${result.ruleId}\0${result.entityId}`;
    if (!ruleIds.has(result.ruleId)) errors.push(`Unknown rule ID ${result.ruleId}.`);
    if (!entityIds.has(result.entityId)) errors.push(`Unknown entity ID ${result.entityId}.`);
    if (!scopeIds.has(result.entityId)) errors.push(`Result entity ${result.entityId} is outside the frozen scope.`);
    if (pairs.has(pair)) errors.push(`Duplicate result pair ${result.ruleId}/${result.entityId}.`);
    if (!['matched', 'rejected'].includes(result.status)) errors.push('Result status is invalid.');
    if (result.status === 'matched' && !Number.isInteger(result.winningStrategyIndex)) errors.push('Matched result requires a winning strategy.');
    if (result.status === 'rejected' && result.winningStrategyIndex !== null) errors.push('Rejected result cannot have a winning strategy.');
    (result.attempts || []).forEach((attempt, index) => {
      if (attempt.strategyIndex !== index) errors.push('Attempt order is invalid.');
      if (!['matched', 'rejected'].includes(attempt.outcome)) errors.push('Attempt outcome is invalid.');
    });
    if (result.status === 'matched') {
      const winning = result.attempts?.[result.winningStrategyIndex];
      if (!winning || winning.outcome !== 'matched') errors.push('Winning strategy is inconsistent with attempt evidence.');
      if ((result.attempts || []).length !== result.winningStrategyIndex + 1) errors.push('Attempts must stop after first success.');
    }
    if (result.status === 'rejected' && (result.attempts || []).some((attempt) => attempt.outcome === 'matched')) errors.push('Rejected result contains a successful attempt.');
    pairs.add(pair);
  });
  return errors;
}

function summaryErrors(run) {
  const truncated = (run?.scope?.requestedEntityCount || 0) > (run?.scope?.entityIds?.length || 0);
  const expected = runSummary(run?.scope?.entityIds?.length || 0, run?.results || [], truncated);
  return Object.entries(expected).flatMap(([key, value]) => run?.summary?.[key] === value ? [] : [`Test run summary ${key} is inconsistent.`]);
}

export async function validateExtractionTestRun(run, graph, config, dependencies = {}) {
  const errors = [...metadataErrors(run, graph, config), ...resultErrors(run, graph, config), ...summaryErrors(run)];
  errors.push(...findJsonSafetyErrors(run, 'Test run'));
  try {
    const scope = normalizeExtractionScope(graph, run.scope);
    const expectedId = await createRunId(graph, config?.configId, scope, dependencies.hashText || sha256Hex);
    if (run.runId !== expectedId) errors.push('Test run ID does not match graph, config and scope identity.');
  } catch (error) { errors.push(error.message); }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...(run?.validation?.warnings || [])] };
}

export function serializeExtractionTestRun(run) {
  return `${JSON.stringify(run, null, 2)}\n`;
}
