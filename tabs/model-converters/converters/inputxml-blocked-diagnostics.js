/**
 * Functionality: summarize governed InputXML preflight evidence for blocked UI results.
 * Inputs: worker outputs and typed execution logs.
 * Outputs: a deterministic primary diagnostic, downloadable summary, and review rows.
 * Fallback: no policy inference; absent diagnostics produce an explicit PRECHECK_BLOCKED summary.
 */

const ROLE_PRIORITY = Object.freeze({
  compatibilityPolicy: 0,
  canonicalValidation: 1,
  diagnosticReport: 2,
  assuranceLedger: 3,
  normalizationPlan: 4,
  canonicalizationLedger: 5,
  preflightResult: 6,
});

const DIAGNOSTIC_KEYS = Object.freeze(new Set([
  'diagnostics', 'blockingDiagnostics', 'errors', 'issues', 'findings', 'failures',
]));

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function parseJsonArtifact(output) {
  if (!output || typeof output.text !== 'string') return null;
  if (!String(output.mime || '').includes('json') && !/\.json$/i.test(String(output.name || ''))) return null;
  try {
    return JSON.parse(output.text);
  } catch {
    return null;
  }
}

function diagnosticMessage(value) {
  return text(value?.message || value?.detail || value?.reason || value?.description || value?.summary);
}

function diagnosticCode(value) {
  return text(value?.code || value?.ruleId || value?.diagnosticCode || value?.id || value?.kind).toUpperCase();
}

function diagnosticSeverity(value) {
  return text(value?.severity || value?.level || value?.status || 'BLOCKING').toUpperCase();
}

function addDiagnostic(target, value, sourceRole, sourceName) {
  const code = diagnosticCode(value);
  const message = diagnosticMessage(value);
  if (!code || !message) return;
  target.push(Object.freeze({
    code,
    message,
    severity: diagnosticSeverity(value),
    sourceRole: text(sourceRole) || 'preflightEvidence',
    sourceName: text(sourceName),
    context: record(value?.context) || null,
  }));
}

function collectDiagnostics(value, sourceRole, sourceName, target, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectDiagnostics(entry, sourceRole, sourceName, target, depth + 1);
    return;
  }
  const item = record(value);
  if (!item) return;

  addDiagnostic(target, item, sourceRole, sourceName);

  const gates = record(item.gates);
  if (gates) {
    for (const [gate, statusValue] of Object.entries(gates)) {
      const status = text(statusValue).toUpperCase();
      if (!status || status === 'PASS') continue;
      const gateCode = `ASSURANCE_GATE_${String(gate).replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_${status}`;
      target.push(Object.freeze({
        code: gateCode,
        message: `Assurance gate ${gate} has status ${status}.`,
        severity: 'BLOCKING',
        sourceRole: text(sourceRole) || 'assuranceLedger',
        sourceName: text(sourceName),
        context: Object.freeze({ gate, status }),
      }));
    }
  }

  for (const [key, child] of Object.entries(item)) {
    if (DIAGNOSTIC_KEYS.has(key) || key === 'result' || key === 'validation' || key === 'report') {
      collectDiagnostics(child, sourceRole, sourceName, target, depth + 1);
    }
  }
}

function uniqueDiagnostics(values) {
  const seen = new Set();
  return values.filter((item) => {
    const key = `${item.code}\u0000${item.message}\u0000${item.sourceRole}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => {
    const role = (ROLE_PRIORITY[left.sourceRole] ?? 99) - (ROLE_PRIORITY[right.sourceRole] ?? 99);
    if (role) return role;
    const leftBlocking = /BLOCK|ERROR|FAIL/.test(left.severity) ? 0 : 1;
    const rightBlocking = /BLOCK|ERROR|FAIL/.test(right.severity) ? 0 : 1;
    return leftBlocking - rightBlocking || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);
  });
}

function artifactDocuments(outputs) {
  return (Array.isArray(outputs) ? outputs : []).flatMap((output) => {
    const document = parseJsonArtifact(output);
    return document ? [{ output, document }] : [];
  });
}

function compatibilityContext(documents, logs) {
  const policy = documents.find(({ output }) => output?.role === 'compatibilityPolicy')?.document || null;
  const argv = Array.isArray(logs?.argv) ? logs.argv : [];
  const modeIndex = argv.indexOf('--mode');
  return Object.freeze({
    mode: text(policy?.mode || (modeIndex >= 0 ? argv[modeIndex + 1] : 'UNKNOWN')) || 'UNKNOWN',
    detectedDialect: text(policy?.detectedDialect || 'unresolved') || 'unresolved',
  });
}

function safeCode(value) {
  return (text(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'PREFLIGHT_BLOCKED').slice(0, 96);
}

export function collectInputXmlPreflightDiagnostics(outputs) {
  const values = [];
  for (const { output, document } of artifactDocuments(outputs)) {
    collectDiagnostics(document, output.role, output.name, values);
  }
  return Object.freeze(uniqueDiagnostics(values));
}

export function buildInputXmlBlockedSummary(outputs, logs = {}) {
  const diagnostics = collectInputXmlPreflightDiagnostics(outputs);
  const preflight = record(logs?.preflight) || {};
  const context = compatibilityContext(artifactDocuments(outputs), logs);
  const primary = diagnostics[0] || Object.freeze({
    code: 'PREFLIGHT_BLOCKED',
    message: `InputXML release preflight status is ${text(preflight.status || 'BLOCKED')}.`,
    severity: 'BLOCKING',
    sourceRole: 'preflightResult',
    sourceName: 'preflight-result.json',
    context: null,
  });
  const code = safeCode(primary.code);
  const headline = `${code}: ${primary.message}`;
  const lines = [
    'InputXML -> CII(2019) release blocked',
    `Status: ${text(preflight.status || 'BLOCKED')}`,
    `Code: ${code}`,
    `Message: ${primary.message}`,
    `Compatibility mode: ${context.mode}`,
    `Detected dialect: ${context.detectedDialect}`,
    '',
    'Blocking diagnostics:',
    ...diagnostics.map((item, index) => `${index + 1}. [${item.code}] ${item.message} (${item.sourceRole})`),
  ];
  if (!diagnostics.length) lines.push('1. No structured diagnostic was returned; inspect the attached preflight evidence files.');
  const artifact = Object.freeze({
    name: `inputxml-release-blocked-${code}.txt`,
    text: `${lines.join('\n')}\n`,
    mime: 'text/plain;charset=utf-8',
    role: 'blockedSummary',
  });
  return Object.freeze({
    schema: 'InputXmlBlockedSummary.v1',
    status: text(preflight.status || 'BLOCKED') || 'BLOCKED',
    code,
    message: primary.message,
    headline,
    sourceRole: primary.sourceRole,
    compatibilityMode: context.mode,
    detectedDialect: context.detectedDialect,
    diagnostics,
    artifact,
  });
}

export function buildInputXmlPreflightRows(outputs, logs = {}) {
  const preflight = record(logs?.preflight);
  if (!preflight) return [];
  const blocked = preflight.releaseEligible !== true;
  const rows = [];
  if (blocked) {
    const summary = buildInputXmlBlockedSummary(outputs, logs);
    for (const item of summary.diagnostics.length ? summary.diagnostics : [{
      code: summary.code,
      message: summary.message,
      sourceRole: summary.sourceRole,
    }]) {
      rows.push(Object.freeze({
        type: `inputxml-${item.sourceRole || 'preflight'}`,
        method: item.code,
        needsReview: true,
        message: item.message,
      }));
    }
  } else {
    rows.push(Object.freeze({
      type: 'inputxml-release-preflight',
      method: 'PASS',
      needsReview: false,
      message: 'PASS: all mandatory InputXML v2 gates passed; CII released.',
    }));
  }
  rows.push(Object.freeze({
    type: 'inputxml-runtime-manifest',
    method: text(logs?.runtime?.sourceRevision),
    needsReview: !logs?.runtime?.manifestHashSha256,
    message: text(logs?.runtime?.manifestHashSha256) || 'Runtime manifest evidence unavailable.',
  }));
  return Object.freeze(rows);
}
