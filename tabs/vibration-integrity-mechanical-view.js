import { MECHANICAL_T23_SOURCE_OPTIONS } from '../converters/vibration/mechanical/facility.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function selectedKeys(state, scopeId) {
  return new Set(state.mechanicalSourceKeysByScope?.[scopeId] ?? []);
}

function optionRow(option, selected, disabledByApplicability) {
  const unavailable = !option.directBaselineAvailable;
  const disabled = unavailable || disabledByApplicability;
  const baseline = Number.isFinite(option.baselineLof) ? `LOF ${option.baselineLof}` : 'Rule only';
  return `<label class="vi-user-data-row" title="${esc(option.qualificationGate)}">
    <input type="checkbox" data-vi-mechanical-source="${esc(option.sourceKey)}"
      ${selected.has(option.sourceKey) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
    <span><strong>${esc(option.label)}</strong><small class="vi-mono">${esc(baseline)}</small>
    ${unavailable ? `<small>${esc(option.reason)}</small>` : ''}</span>
  </label>`;
}

function resultPanel(result, notApplicable) {
  if (notApplicable) {
    return '<p><strong>Mechanical T2.3 marked NOT APPLICABLE for this facility scope.</strong></p>';
  }
  if (!result) return '<p class="vi-empty">No current Mechanical T2.3 candidate evaluation for this facility scope.</p>';
  return `<div class="vi-summary">
    <div class="vi-metric"><small>Candidate LOF</small><strong>${esc(result.governingLof)}</strong></div>
    <div class="vi-metric"><small>Governing source</small><strong>${esc(result.governingSourceKey)}</strong></div>
    <div class="vi-metric"><small>Authority</small><strong>CANDIDATE</strong></div>
  </div>
  <div class="vi-table-wrap"><table class="vi-table"><thead><tr>
    <th>Selected source</th><th>Baseline LOF</th><th>Qualification gate</th>
  </tr></thead><tbody>${result.rows.map((row) => `<tr>
    <td class="vi-mono">${esc(row.sourceKey)}</td><td>${esc(row.baselineLof)}</td><td>${esc(row.qualificationGate)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

export function renderMechanicalFacilityPanel(state) {
  const scopeId = String(state.mechanicalFacilityScopeId ?? '').trim();
  if (!scopeId) {
    return `<section class="vi-card"><div class="vi-section-head"><div><h3>Mechanical T2.3 facility inputs</h3>
      <p>Open a Mechanical cell from the screening register to select equipment sources for that exact facility row.</p>
    </div></div></section>`;
  }
  const selected = selectedKeys(state, scopeId);
  const result = state.mechanicalCandidateResultsByScope?.[scopeId] ?? null;
  const busy = Boolean(state.mechanicalPendingByScope?.[scopeId]);
  const notApplicable = Boolean(state.mechanicalNotApplicableByScope?.[scopeId]);
  return `<section class="vi-card">
    <div class="vi-section-head"><div><h3>Mechanical excitation · EI AVIFF T2.3</h3>
      <p class="vi-mono">${esc(scopeId)}</p></div></div>
    <div class="vi-banner warn"><strong>Candidate master path.</strong><span>Select only equipment that is connected or adjacent to this facility line. The T2.3 master remains CANDIDATE; this result cannot replace authorized FIT screening. Dynamic-study reductions are not applied here.</span></div>
    <label class="vi-user-data-row"><input type="checkbox" data-vi-mechanical-not-applicable ${notApplicable ? 'checked' : ''}>
      <span><strong>No connected or adjacent T2.3 mechanical excitation source</strong><small>Explicitly mark this facility row NOT APPLICABLE.</small></span></label>
    <div class="vi-user-data-grid">${MECHANICAL_T23_SOURCE_OPTIONS.map((item) => optionRow(item, selected, notApplicable)).join('')}</div>
    <div class="vi-actions">
      <button type="button" data-vi-mechanical-evaluate ${busy || notApplicable ? 'disabled' : ''}>${busy ? 'Evaluating…' : 'Evaluate T2.3 candidate'}</button>
      <button type="button" data-vi-mechanical-clear ${busy ? 'disabled' : ''}>Clear selection</button>
    </div>
    ${resultPanel(result, notApplicable)}
  </section>`;
}
