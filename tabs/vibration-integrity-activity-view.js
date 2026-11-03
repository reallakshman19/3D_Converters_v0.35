import { deriveVibrationIntegrityWorkflowState } from './vibration-integrity-workflow-state.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function eventRows(events) {
  if (!events.length) return '<tr><td colspan="6" class="vi-table-empty">No activity recorded yet.</td></tr>';
  return events.slice(-50).reverse().map((event) => `<tr data-vi-audit-event="${esc(event.eventId)}">
    <td>${esc(event.sequence)}</td>
    <td class="vi-mono">${esc(event.timestamp)}</td>
    <td>${esc(event.eventType)}</td>
    <td>${esc(event.workflowBefore ?? '—')} → ${esc(event.workflowAfter)}</td>
    <td class="vi-mono">${esc(event.scopeId ?? '—')}</td>
    <td><code>${esc(JSON.stringify(event.details))}</code></td>
  </tr>`).join('');
}

export function renderVibrationIntegrityActivity(state = {}) {
  const workflow = deriveVibrationIntegrityWorkflowState(state);
  const events = state.auditLog?.events ?? [];
  return `<section class="vi-card" data-vi-workflow-state="${esc(workflow.state)}">
    <div class="vi-section-head"><div><h3>Assessment workflow</h3>
      <p>Stable product state derived from working inputs, readiness and result state. It is observational only: workflow state does not determine FIT result currency and performs no engineering calculation.</p></div>
      <button type="button" class="vi-btn" data-vi-action="export-audit">Export activity log JSON</button>
    </div>
    <div class="vi-summary">
      <div class="vi-metric"><small>Workflow state</small><strong>${esc(workflow.state)}</strong></div>
      <div class="vi-metric"><small>Next action</small><strong>${esc(workflow.nextActionLabel)}</strong></div>
      <div class="vi-metric"><small>Result state</small><strong>${esc(workflow.resultState)}</strong></div>
      <div class="vi-metric"><small>Activity events</small><strong>${esc(events.length)}</strong></div>
    </div>
    ${workflow.readiness ? `<div class="vi-import-facts"><span>Ready: <strong>${esc(workflow.readiness.ready)}</strong></span><span>Not ready: <strong>${esc(workflow.readiness.notReady)}</strong></span><span>Assessment points: <strong>${esc(workflow.readiness.assessmentPoints)}</strong></span></div>` : ''}
  </section>
  <section class="vi-card" data-vi-audit-log="${esc(state.auditLog?.schema ?? 'UNAVAILABLE')}">
    <div class="vi-section-head"><div><h3>Activity journal</h3><p>Ordered, scope-aware product actions. This activity export is non-authoritative observational metadata; it is not FIT run reproducibility evidence and cannot alter engineering results.</p></div></div>
    <div class="vi-table-wrap"><table class="vi-table"><thead><tr>
      <th>#</th><th>Time</th><th>Action</th><th>Workflow</th><th>Scope</th><th>Details</th>
    </tr></thead><tbody>${eventRows(events)}</tbody></table></div>
  </section>`;
}
