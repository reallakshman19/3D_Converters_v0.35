import { sha256Hex } from './source-envelope.js';
import {
  EXTRACTION_ENTITY_KINDS, EXTRACTION_VALUE_SOURCES,
  canonicalExtractionRule, createExtractionRuleId, deepFreezeArtifact,
  findJsonSafetyErrors, normalizeExtractionRule,
} from './extraction-rule.js';
import { validateExtractionStrategyDefinition } from './extraction-strategy.js';

const ENTITY_KIND_SET = new Set(EXTRACTION_ENTITY_KINDS);
const VALUE_SOURCE_SET = new Set(EXTRACTION_VALUE_SOURCES);

function selectorErrors(rule) {
  const errors = [];
  const selector = rule.sourceSelector || {};
  const hasCriterion = (selector.entityKinds || []).length || selector.nameEquals || selector.sourcePathPrefix;
  if (!hasCriterion) errors.push(`Rule ${rule.sourceOrder} requires at least one source selector criterion.`);
  for (const kind of selector.entityKinds || []) {
    if (!ENTITY_KIND_SET.has(kind)) errors.push(`Rule ${rule.sourceOrder} uses unsupported entity kind ${kind}.`);
  }
  return errors;
}

function valueSourceErrors(rule) {
  const errors = [];
  const source = rule.valueSource || {};
  if (!VALUE_SOURCE_SET.has(source.kind)) errors.push(`Rule ${rule.sourceOrder} has unsupported value source ${source.kind}.`);
  if (source.kind === 'attribute' && !source.attributeName) errors.push(`Rule ${rule.sourceOrder} requires an attribute name.`);
  return errors;
}

function strategyErrors(rule) {
  const errors = [];
  if (!rule.strategies?.length) errors.push(`Rule ${rule.sourceOrder} requires at least one strategy.`);
  (rule.strategies || []).forEach((strategy, index) => {
    validateExtractionStrategyDefinition(strategy)
      .forEach((message) => errors.push(`Rule ${rule.sourceOrder} strategy ${index}: ${message}`));
  });
  return errors;
}

function structuralErrors(config) {
  const errors = [];
  if (config?.schema !== 'ExtractionConfig.v1') errors.push('Configuration schema must be ExtractionConfig.v1.');
  if (!Array.isArray(config?.rules) || !config.rules.length) errors.push('Configuration requires at least one rule.');
  return errors;
}

function uniquenessErrors(rules) {
  const errors = [];
  const ids = new Set();
  const keys = new Set();
  const orders = new Set();
  rules.forEach((rule, index) => {
    if (!rule.fieldKey) errors.push(`Rule ${index} fieldKey is required.`);
    if (keys.has(rule.fieldKey)) errors.push(`Field key ${rule.fieldKey} is duplicated.`);
    if (ids.has(rule.ruleId)) errors.push(`Rule ID ${rule.ruleId} is duplicated.`);
    if (!Number.isInteger(rule.sourceOrder) || rule.sourceOrder < 0) errors.push(`Rule ${index} sourceOrder is invalid.`);
    if (orders.has(rule.sourceOrder)) errors.push(`Rule sourceOrder ${rule.sourceOrder} is duplicated.`);
    if (rule.sourceOrder !== index) errors.push('Rule sourceOrder must be contiguous and match displayed order.');
    keys.add(rule.fieldKey); ids.add(rule.ruleId); orders.add(rule.sourceOrder);
  });
  return errors;
}

function jsonSafetyErrors(value) {
  return findJsonSafetyErrors(value, 'Configuration');
}

async function recomputeConfigIdentity(config, hashText) {
  const ruleIds = [];
  for (const rule of config.rules || []) ruleIds.push(await createExtractionRuleId(rule, hashText));
  const rules = (config.rules || []).map((rule, index) => ({ ...normalizeExtractionRule(rule, index), ruleId: ruleIds[index] }));
  const digest = await hashText(JSON.stringify(rules));
  return { ruleIds, configId: `extract-config-${digest.slice(0, 32)}` };
}

export async function validateExtractionConfig(config, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const errors = [...structuralErrors(config), ...uniquenessErrors(rules), ...jsonSafetyErrors(config)];
  rules.forEach((rule) => errors.push(...selectorErrors(rule), ...valueSourceErrors(rule), ...strategyErrors(rule)));
  if (rules.length) {
    const identity = await recomputeConfigIdentity(config, hashText);
    identity.ruleIds.forEach((id, index) => {
      if (rules[index]?.ruleId !== id) errors.push(`Rule ${index} identity does not match its definition.`);
    });
    if (config.configId !== identity.configId) errors.push('Configuration ID does not match ordered rule content.');
  }
  const warnings = rules.length && rules.every((rule) => !rule.enabled) ? ['All extraction rules are disabled.'] : [];
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings };
}

export async function createExtractionConfig(ruleDrafts, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const rules = [];
  for (let index = 0; index < (ruleDrafts || []).length; index += 1) {
    const normalized = normalizeExtractionRule(ruleDrafts[index], index);
    rules.push({ ...normalized, ruleId: await createExtractionRuleId(normalized, hashText) });
  }
  const digest = await hashText(JSON.stringify(rules));
  const config = {
    schema: 'ExtractionConfig.v1', configId: `extract-config-${digest.slice(0, 32)}`, rules,
    summary: { ruleCount: rules.length, enabledRuleCount: rules.filter((rule) => rule.enabled).length },
    validation: { ok: true, errors: [], warnings: [] },
  };
  config.validation = await validateExtractionConfig(config, { hashText });
  return deepFreezeArtifact(config);
}

export function serializeExtractionConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function extractionDraftIdentity(ruleDrafts) {
  return JSON.stringify((ruleDrafts || []).map((rule, index) => canonicalExtractionRule({ ...rule, sourceOrder: index })));
}
