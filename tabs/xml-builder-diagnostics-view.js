const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function renderXmlBuilderDiagnosticsHtml(diagnostics = {}) {
  const records = Array.isArray(diagnostics.records) ? diagnostics.records : [];
  const summary = diagnostics.summary || { total: records.length, error: 0, warning: 0, info: 0, ok: 0 };
  const open = Number(summary.error || 0) > 0 || Number(summary.warning || 0) > 0;
  const rows = records.slice(0, 500).map((row) => `<tr>
    <td>${esc(row.severity)}</td><td>${esc(row.code)}</td><td>${esc(row.stage)}</td>
    <td>${esc(row.branch)}</td><td>${esc(row.node)}</td><td>${esc(row.message)}</td>
  </tr>`).join('');
  return `<details class="xml-cii-native-card xml-builder-diagnostics" ${open ? 'open' : ''}>
    <summary><strong>XML Builder diagnostics</strong> · ${Number(summary.total || 0)} event(s) · ${Number(summary.error || 0)} error · ${Number(summary.warning || 0)} warning</summary>
    <div class="xml-cii-native-toolbar">
      <button type="button" class="model-converters-download-btn" data-xml-builder-download-diagnostics ${records.length ? '' : 'disabled'}>Download xml_builder_diagnostics.json</button>
    </div>
    ${records.length ? `<div class="xml-cii-native-table-wrap"><table class="xml-cii-native-table"><thead><tr><th>Severity</th><th>Code</th><th>Stage</th><th>Branch</th><th>Node</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="xml-cii-native-hint">No diagnostics recorded yet.</div>'}
  </details>`;
}
