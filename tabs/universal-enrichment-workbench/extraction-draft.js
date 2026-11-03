import { createDefaultExtractionRule, normalizeExtractionRule, normalizeExtractionStrategy } from './extraction-rule.js';

function reorder(items, from, to) {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function normalizeRuleDrafts(rules) {
  return (rules || []).map((rule, index) => normalizeExtractionRule(rule, index));
}

export function addRuleDraft(rules) {
  return normalizeRuleDrafts([...(rules || []), createDefaultExtractionRule((rules || []).length)]);
}

export function duplicateRuleDraft(rules, index) {
  const source = rules[index];
  if (!source) return normalizeRuleDrafts(rules);
  const duplicate = structuredClone(source);
  duplicate.fieldKey = `${source.fieldKey}-copy`;
  const next = [...rules];
  next.splice(index + 1, 0, duplicate);
  return normalizeRuleDrafts(next);
}

export function removeRuleDraft(rules, index) {
  return normalizeRuleDrafts((rules || []).filter((_, itemIndex) => itemIndex !== index));
}

export function moveRuleDraft(rules, index, direction) {
  return normalizeRuleDrafts(reorder(rules || [], index, index + direction));
}

export function updateRuleDraft(rules, index, patch) {
  return normalizeRuleDrafts((rules || []).map((rule, itemIndex) => itemIndex === index ? { ...rule, ...patch } : rule));
}

export function updateRuleNested(rules, index, key, patch) {
  const rule = rules[index];
  if (!rule) return normalizeRuleDrafts(rules);
  return updateRuleDraft(rules, index, { [key]: { ...rule[key], ...patch } });
}

export function addStrategyDraft(rules, ruleIndex, kind) {
  const rule = rules[ruleIndex];
  if (!rule) return normalizeRuleDrafts(rules);
  const strategy = kind === 'token'
    ? { kind: 'token', delimiterMode: 'literal', delimiter: '-', tokenIndex: 0, trim: true }
    : { kind: 'regex', pattern: '(.+)', flags: '', captureGroup: 1, trim: true };
  return updateRuleDraft(rules, ruleIndex, { strategies: [...rule.strategies, strategy] });
}

export function updateStrategyDraft(rules, ruleIndex, strategyIndex, patch) {
  const rule = rules[ruleIndex];
  if (!rule?.strategies[strategyIndex]) return normalizeRuleDrafts(rules);
  const strategies = rule.strategies.map((strategy, index) => index === strategyIndex
    ? normalizeExtractionStrategy({ ...strategy, ...patch }) : strategy);
  return updateRuleDraft(rules, ruleIndex, { strategies });
}

export function removeStrategyDraft(rules, ruleIndex, strategyIndex) {
  const rule = rules[ruleIndex];
  if (!rule) return normalizeRuleDrafts(rules);
  return updateRuleDraft(rules, ruleIndex, { strategies: rule.strategies.filter((_, index) => index !== strategyIndex) });
}

export function moveStrategyDraft(rules, ruleIndex, strategyIndex, direction) {
  const rule = rules[ruleIndex];
  if (!rule) return normalizeRuleDrafts(rules);
  return updateRuleDraft(rules, ruleIndex, { strategies: reorder(rule.strategies, strategyIndex, strategyIndex + direction) });
}
