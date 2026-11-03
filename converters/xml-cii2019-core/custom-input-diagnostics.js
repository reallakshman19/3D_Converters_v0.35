export const XML_BUILDER_INPUTXML_DIAGNOSTICS_SCHEMA = 'xml-builder-inputxml-diagnostics/v1';

const SEVERITIES = new Set(['ERROR', 'WARNING', 'INFO', 'OK']);
const clean = (value) => String(value ?? '').trim();
const optionalNumber = (value) => {
  const raw = clean(value);
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

export function createXmlBuilderDiagnostic(input = {}) {
  const severity = SEVERITIES.has(String(input.severity || '').toUpperCase())
    ? String(input.severity).toUpperCase()
    : 'INFO';
  return Object.freeze({
    severity,
    code: clean(input.code) || 'XML_BUILDER_DIAGNOSTIC',
    message: clean(input.message),
    module: clean(input.module) || 'xml-builder',
    stage: clean(input.stage),
    action: clean(input.action),
    sourceField: clean(input.sourceField),
    outputField: clean(input.outputField),
    sourceRow: optionalNumber(input.sourceRow),
    branch: clean(input.branch),
    node: clean(input.node),
    count: optionalNumber(input.count),
    context: input.context && typeof input.context === 'object' ? Object.freeze({ ...input.context }) : null,
  });
}

export function createXmlBuilderDiagnostics(records = [], metadata = {}) {
  const normalized = records.filter(Boolean).map((row) => createXmlBuilderDiagnostic(row));
  const summary = { total: normalized.length, error: 0, warning: 0, info: 0, ok: 0 };
  for (const row of normalized) summary[row.severity.toLowerCase()] += 1;
  return Object.freeze({
    schema: XML_BUILDER_INPUTXML_DIAGNOSTICS_SCHEMA,
    generatedAt: new Date().toISOString(),
    sourceName: clean(metadata.sourceName),
    buildProfile: clean(metadata.buildProfile) || 'xml-builder',
    outputReady: metadata.outputReady === true,
    summary: Object.freeze(summary),
    records: Object.freeze(normalized),
  });
}

export function mergeXmlBuilderDiagnosticRecords(...sources) {
  return sources.flatMap((source) => {
    if (Array.isArray(source)) return source;
    if (Array.isArray(source?.records)) return source.records;
    return [];
  }).filter(Boolean);
}

export function serializeXmlBuilderDiagnostics(diagnostics) {
  const document = diagnostics?.schema === XML_BUILDER_INPUTXML_DIAGNOSTICS_SCHEMA
    ? diagnostics
    : createXmlBuilderDiagnostics(diagnostics?.records || diagnostics || []);
  return `${JSON.stringify(document, null, 2)}\n`;
}
