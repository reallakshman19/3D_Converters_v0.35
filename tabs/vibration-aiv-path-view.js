import { assertAivTopologyViewModel } from '../converters/vibration/aiv/aiv-topology-view-model.js';
import { renderAivInlineSymbol } from './vibration-aiv-inline-symbols.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cell(value) {
  return value === null || value === undefined || value === '' ? '<span class="aiv-path-empty">—</span>' : esc(value);
}

function rows(model) {
  if (!model.rows.length) {
    return '<tr><td colspan="9" class="aiv-path-empty-row">No unambiguous certified source-to-assessment path is available.</td></tr>';
  }
  return model.rows.map((row) => `<tr data-aiv-canonical-id="${esc(row.canonicalId)}" data-aiv-role="${esc(row.role)}">
    <td>${row.sequence}</td>
    <td>${renderAivInlineSymbol(row)}</td>
    <td class="aiv-path-mono">${cell(row.canonicalId)}</td>
    <td>${cell(row.tag)}</td>
    <td>${cell(row.type)}</td>
    <td>${cell(row.line)}</td>
    <td>${cell(row.declaredLengthMm)}</td>
    <td>${cell(row.roleLabel)}</td>
    <td>${cell(row.sourceStatus)}</td>
  </tr>`).join('');
}

function diagnostics(model) {
  if (!model.diagnostics.length) return '';
  return `<div class="aiv-path-diagnostics"><strong>Topology resolution blocked</strong><ul>${model.diagnostics.map((item) => `<li><code>${esc(item.code)}</code> ${esc(item.message)}</li>`).join('')}</ul></div>`;
}

export function renderAivTopologyPathHtml(modelInput) {
  const model = assertAivTopologyViewModel(modelInput);
  return `<section class="aiv-path-card" data-aiv-path-status="${esc(model.pathStatus)}">
    <header class="aiv-path-head">
      <div><h4>AIV source → assessment topology</h4><p>Certified table connectivity only. Inline SVG symbols are schematic identifiers, not geometry.</p></div>
      <div class="aiv-path-authority"><strong>${esc(model.pathStatus)}</strong><span>READ ONLY · NOT GEOMETRY AUTHORITY</span></div>
    </header>
    <div class="aiv-path-facts">
      <span>Source <code>${esc(model.sourceCanonicalId)}</code></span>
      <span>Assessment <code>${esc(model.assessmentCanonicalId)}</code></span>
      <span>Physical AIV distance <strong>UNRESOLVED</strong></span>
    </div>
    ${diagnostics(model)}
    <div class="aiv-path-table-wrap"><table class="aiv-path-table">
      <thead><tr><th>#</th><th>Symbol</th><th>Canonical ID</th><th>Tag</th><th>Type</th><th>Line</th><th>Declared length (mm)</th><th>AIV role</th><th>Source status</th></tr></thead>
      <tbody>${rows(model)}</tbody>
    </table></div>
    <footer class="aiv-path-foot">
      <span>Canonical hash: <code>${cell(model.topologyAuthority.canonicalHash)}</code></span>
      <span>Projection hash: <code>${cell(model.topologyAuthority.projectionHash)}</code></span>
      <span>Dataset: <code>${cell(model.topologyAuthority.datasetId)}</code></span>
    </footer>
  </section>`;
}
