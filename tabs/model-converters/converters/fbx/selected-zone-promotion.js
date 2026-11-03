import { canonicalJson } from './canonical-json.js';

const SUPERSEDED_MAPPING_LOGS = new Set([
  'WORKLIST_GENERATED', 'DRAFT_DECISIONS_GENERATED',
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function baseName(name) {
  return String(name || 'model.fbx').replace(/\.[^.]+$/, '') || 'model';
}
function supersededMappingDiagnostic(value) {
  const text = String(value || '');
  return text === 'BLOCKED_MAPPING'
    || text.startsWith('Mapping manifest is absent. StagedJSON conversion skipped.')
    || SUPERSEDED_MAPPING_LOGS.has(text);
}
export function promoteSelectedZoneReport(output, status, tags) {
  if (!/\.fbx-conversion-report\.json$/i.test(output.name || '')) return output;
  try {
    const report = JSON.parse(output.text); report.status = status;
    const existing = Array.isArray(report.diagnostics) ? report.diagnostics : [];
    report.diagnostics = unique([
      ...existing.filter((item) => !supersededMappingDiagnostic(item)), ...tags,
    ]).sort();
    return { ...output, text: canonicalJson(report) };
  } catch { return output; }
}
export function isSupersededMappingOutput(output) {
  return /\.fbx-(mapping-worklist|draft-decisions)\.json$/i.test(output?.name || '');
}
export function selectedZonePromotionLogs(result, tags, errors) {
  const logs = result?.logs || {};
  return {
    stdout: unique([...tags,
      ...(logs.stdout || []).filter((item) => !SUPERSEDED_MAPPING_LOGS.has(item))]),
    stderr: unique([...(logs.stderr || []).filter(
      (item) => !supersededMappingDiagnostic(item)), ...errors]),
  };
}
export function managedReferenceBindingOutput(managed, status) {
  if (!managed) return [];
  const value = {
    schema: 'FbxManagedStageReferenceBinding.v1',
    status,
    profileId: managed.profile?.profileId || null,
    archiveBound: managed.profile?.archiveBound || false,
    selectedZoneLabel: managed.zoneLabel,
    executionScope: 'BROWSER_SELECTED_ZONE_REFERENCE',
    t0Qualified: false,
    source: managed.profile?.source || null,
    managed: managed.profile?.managed || null,
  };
  return [{
    name: `${baseName(managed.primaryName)}.managed-reference-binding.json`,
    text: canonicalJson(value),
    mime: 'application/json;charset=utf-8',
  }];
}
