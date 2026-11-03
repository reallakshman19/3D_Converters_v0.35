export function summarizeGlbValidationReport(report = {}) {
  const messages = Array.isArray(report?.issues?.messages) ? report.issues.messages : [];
  const counts = messages.reduce((acc, issue) => {
    const severity = String(issue?.severity || '').toUpperCase();
    if (severity === 'ERROR') acc.errorCount += 1;
    else if (severity === 'WARNING') acc.warningCount += 1;
    else if (severity === 'INFO') acc.infoCount += 1;
    else if (severity === 'HINT') acc.hintCount += 1;
    return acc;
  }, {
    errorCount: Number(report.errorCount || 0),
    warningCount: Number(report.warningCount || 0),
    infoCount: Number(report.infoCount || 0),
    hintCount: Number(report.hintCount || 0),
  });

  return {
    schema: 'glb-validation-summary/v1',
    valid: counts.errorCount === 0,
    ...counts,
    asset: report.asset || report.info || {},
    messages,
  };
}

export function validationTone(summary = {}) {
  if ((summary.errorCount || 0) > 0) return 'error';
  if ((summary.warningCount || 0) > 0) return 'warning';
  return 'ok';
}

export function formatGlbValidationSummary(summary = {}) {
  const valid = summary.valid !== false && (summary.errorCount || 0) === 0;
  const status = valid ? 'PASS' : 'FAIL';
  return `GLB validation: ${status} | errors=${summary.errorCount || 0} warnings=${summary.warningCount || 0} info=${summary.infoCount || 0} hints=${summary.hintCount || 0}`;
}

export function renderGlbValidationSummary(container, report = {}) {
  if (!container) return null;
  const summary = summarizeGlbValidationReport(report);
  const tone = validationTone(summary);
  const root = document.createElement('section');
  root.className = `glb-validation-summary glb-validation-summary--${tone}`;
  root.dataset.validationTone = tone;
  root.innerHTML = `
    <h3>GLB Validation</h3>
    <p><strong>${summary.valid ? 'PASS' : 'FAIL'}</strong></p>
    <dl>
      <div><dt>Errors</dt><dd>${summary.errorCount}</dd></div>
      <div><dt>Warnings</dt><dd>${summary.warningCount}</dd></div>
      <div><dt>Info</dt><dd>${summary.infoCount}</dd></div>
      <div><dt>Hints</dt><dd>${summary.hintCount}</dd></div>
    </dl>
  `;
  container.appendChild(root);
  return { root, summary };
}
