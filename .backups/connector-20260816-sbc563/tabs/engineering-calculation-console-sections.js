import {
  canExecuteEngineeringCalculation,
  engineeringResultLabel,
  isEngineeringCalculationExecutable,
} from './engineering-calculation-console-model.js';

export function esc(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}
export function pretty(value) { try { return JSON.stringify(value ?? null, null, 2); } catch { return String(value); } }
export function definitionState(definition) { return definition?.authority?.qualificationState ?? definition?.authority?.calculationState ?? 'CONCEPT'; }
export function pill(text, kind='') { return `<span class="engineering-console-pill ${kind}">${esc(text)}</span>`; }
function scalar(value) { return typeof value === 'object' && value !== null ? `<pre class="engineering-console-inline-json">${esc(pretty(value))}</pre>` : esc(value ?? '—'); }

function fieldControl(field, state) {
  const value = state.draft.values[field.key];
  const id = `engineering-console-${field.key.replace(/[^a-z0-9_-]/gi,'-')}`;
  if (field.type === 'boolean') return `<label class="engineering-console-checkbox"><input id="${id}" type="checkbox" data-field="${field.key}" ${value === true ? 'checked' : ''}><span>Enabled</span></label>`;
  if (field.type === 'enum') return `<select id="${id}" class="engineering-console-input" data-field="${field.key}">${value === '' ? '<option value="" selected disabled>Select…</option>' : ''}${(field.values||[]).map((item)=>`<option value="${esc(item)}" ${item === value ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select>`;
  if (field.type === 'object' || field.type === 'table') return `<textarea id="${id}" class="engineering-console-input engineering-console-json-editor" data-field="${field.key}" spellcheck="false">${esc(value)}</textarea>`;
  const type = ['number','integer'].includes(field.type ?? 'number') ? 'number' : 'text';
  return `<input id="${id}" class="engineering-console-input" type="${type}" ${type === 'number' ? 'step="any"' : ''} data-field="${field.key}" value="${esc(value)}">`;
}

export function renderInputForm(definition, state) {
  if (!isEngineeringCalculationExecutable(definition)) {
    return `<div class="engineering-console-banner bad"><strong>Execution blocked.</strong> No authorized numerical kernel is registered.${definition.qualificationIssue ? ` Qualification issue #${definition.qualificationIssue}.` : ''}</div>`;
  }
  const authorityBanner = definition?.ui?.warning
    ? `<div class="engineering-console-banner warn"><strong>Authority restriction.</strong> ${esc(definition.ui.warning)}</div>`
    : '';
  const fields = (definition.inputs||[]).map((field)=>{
    const errors = state.editorErrors.filter((item)=>item.field === field.key);
    const unit = field.quantity && field.quantity !== 'dimensionless'
      ? `<input class="engineering-console-input engineering-console-unit" data-unit="${field.key}" value="${esc(state.draft.units[field.key] ?? '')}" aria-label="${esc(field.label || field.key)} unit">`
      : '';
    return `<div class="engineering-console-field ${errors.length ? 'has-error' : ''}"><label>${esc(field.label || field.key)}${field.required ? ' *' : ''}</label><div class="engineering-console-control-row">${fieldControl(field,state)}${unit}</div><div class="engineering-console-field-meta">${field.engineeringDefault !== undefined ? `Declared default: ${esc(String(field.engineeringDefault))}` : 'No UI default'}${field.quantity ? ` · ${esc(field.quantity)}` : ''}</div>${errors.map((item)=>`<div class="engineering-console-field-error">${esc(item.message)}</div>`).join('')}</div>`;
  }).join('');
  return `${authorityBanner}<div class="engineering-console-form-grid">${fields}</div>`;
}

export function renderResults(result, validation) {
  const validationBanner = validation ? `<div class="engineering-console-banner ${validation.ok ? '' : 'bad'}">Validation: ${validation.ok ? 'PASS' : 'BLOCKED'} · ${(validation.errors||[]).length} errors · ${(validation.warnings||[]).length} warnings</div>` : '';
  if (!result) return `${validationBanner}<div class="engineering-console-empty">No calculation result yet.</div>`;
  const rows = Object.entries(result.outputs || {});
  return `${validationBanner}<div class="engineering-console-metrics"><div class="engineering-console-card"><small>Status</small><strong>${esc(engineeringResultLabel(result))}</strong></div><div class="engineering-console-card"><small>Qualification</small><strong>${esc(result.qualification?.effective ?? '—')}</strong></div><div class="engineering-console-card"><small>Design authority</small><strong>${result.qualification?.designAuthority === true ? 'YES' : 'NO'}</strong></div><div class="engineering-console-card"><small>Execution</small><strong>${esc(result.execution?.executionId ?? '—')}</strong></div></div>${(result.errors||[]).map((error)=>`<div class="engineering-console-banner bad">${esc(error.code)} — ${esc(error.message)}</div>`).join('')}${(result.warnings||[]).map((warning)=>`<div class="engineering-console-banner warn">${esc(warning.message || warning.code || warning)}</div>`).join('')}${rows.length ? `<div class="engineering-console-table-wrap"><table class="engineering-console-table"><thead><tr><th>Output</th><th>Value</th></tr></thead><tbody>${rows.map(([key,value])=>`<tr><td>${esc(key)}</td><td>${scalar(value)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="engineering-console-empty">No authoritative outputs returned.</div>'}`;
}

export function renderChecks(result) {
  const checks = result?.checks || [];
  if (!checks.length) return '<div class="engineering-console-empty">No qualified assessment checks returned by the calculator.</div>';
  return `<div class="engineering-console-table-wrap"><table class="engineering-console-table"><thead><tr><th>Check</th><th>Actual</th><th>Allowable</th><th>Utilization</th><th>Status</th><th>Authority</th></tr></thead><tbody>${checks.map((check)=>`<tr><td>${esc(check.label || check.id)}</td><td>${scalar(check.actual)}</td><td>${scalar(check.allowable)}</td><td>${scalar(check.utilization)}</td><td>${pill(check.status || '—', check.status === 'PASS' ? 'ok' : check.status === 'FAIL' ? 'bad' : '')}</td><td>${esc(check.authority || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

export function renderBasis(definition, resolution) {
  return `<div class="engineering-console-metrics"><div class="engineering-console-card"><small>Calculation ID</small><strong>${esc(definition.id)}</strong></div><div class="engineering-console-card"><small>Method revision</small><strong>${esc(definition.methodRevision)}</strong></div><div class="engineering-console-card"><small>Method state</small><strong>${esc(definitionState(definition))}</strong></div><div class="engineering-console-card"><small>Qualification issue</small><strong>${esc(definition.qualificationIssue ?? '—')}</strong></div></div><div class="engineering-console-card"><h3>Purpose</h3><p>${esc(definition.purpose || '')}</p></div><div class="engineering-console-card"><h3>Applicability</h3><p>${esc(definition.applicability?.description || 'Not declared.')}</p><ul>${(definition.applicability?.limitations||[]).map((item)=>`<li>${esc(item)}</li>`).join('')}</ul></div>${resolution ? `<div class="engineering-console-card"><h3>Latest resolved inputs</h3><pre class="engineering-console-json">${esc(pretty(resolution))}</pre></div>` : ''}`;
}

export function renderEvidence(result) {
  if (!result) return '<div class="engineering-console-empty">Run a calculation to inspect qualification, provenance and evidence.</div>';
  return `<div class="engineering-console-preview-grid"><div class="engineering-console-card"><h3>Qualification</h3><pre class="engineering-console-json">${esc(pretty(result.qualification))}</pre></div><div class="engineering-console-card"><h3>Provenance</h3><pre class="engineering-console-json">${esc(pretty(result.provenance))}</pre></div></div><div class="engineering-console-card"><h3>Evidence</h3><pre class="engineering-console-json">${esc(pretty(result.evidence))}</pre></div>`;
}

export function renderBatch(state, definition) {
  const batch = state.batchResult;
  const executable = canExecuteEngineeringCalculation(definition, state.qualificationMode);
  const authorityBanner = executable
    ? 'Batch uses the central batch API; every item follows the same registered single-calculation path.'
    : 'Current calculator is not executable in the selected qualification mode and cannot be added to batch.';
  return `<div class="engineering-console-banner ${executable ? '' : 'warn'}">${esc(authorityBanner)}</div><textarea class="engineering-console-input engineering-console-batch-editor" data-batch-editor spellcheck="false">${esc(state.batchText)}</textarea><div class="engineering-console-actions"><button class="engineering-console-btn" data-action="add-current-batch" ${executable ? '' : 'disabled'}>Add current request</button><button class="engineering-console-btn primary" data-action="run-batch">Run Batch</button></div>${state.batchError ? `<div class="engineering-console-banner bad">${esc(state.batchError)}</div>` : ''}${batch ? `<div class="engineering-console-metrics"><div class="engineering-console-card"><small>Total</small><strong>${batch.total}</strong></div><div class="engineering-console-card"><small>Succeeded</small><strong>${batch.succeeded}</strong></div><div class="engineering-console-card"><small>Failed</small><strong>${batch.failed}</strong></div></div><pre class="engineering-console-json">${esc(pretty(batch))}</pre>` : ''}`;
}
