import {
  HP_PIPING_CLASS_AUTHORITY_POLICY,
  HP_PIPING_CLASS_PROJECT_VERSION,
} from '../converters/b313-chapter-ix/hp-piping-class-project.js';
import {
  createHpPipingClassWorkspaceController,
  parseHpPipingClassWorkspaceProject,
  serializeHpPipingClassWorkspaceProject,
} from './hp-piping-class-workspace-controller.js';

const PANELS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Class Matrix' },
  { id: 'fatigue', label: 'Cycles & Fatigue' },
  { id: 'evidence', label: 'Evidence & Results' },
  { id: 'legacy', label: 'Legacy compatibility' },
]);

const PANEL_IDS = new Set(PANELS.map((panel) => panel.id));
const PANEL_STORAGE_KEY = 'format-converters.hpPipingClass.panel';
const LEGACY_WORKSPACE_SRC = './engineering/hp-class-standardization/engineering-library.html';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function attr(value) {
  return escapeHtml(value ?? '');
}

function numberValue(value) {
  return Number.isFinite(value) ? value : '';
}

function ensureStylesheet() {
  if (document.querySelector('style[data-hp-piping-class-tab-style="true"]')) return;
  const style = document.createElement('style');
  style.dataset.hpPipingClassTabStyle = 'true';
  style.textContent = `
    .hp-piping-class-tab{display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:12px;min-height:calc(100vh - 150px);padding:0 18px 18px}
    .hp-piping-class-tab-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;padding:8px 0 2px}.hp-piping-class-tab-header h2{margin:0;font-size:20px}.hp-piping-class-tab-header p{margin:4px 0 0;color:var(--text-muted,#9aa8b8);max-width:900px}
    .hp-piping-class-authority,.hp-piping-class-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.hp-piping-class-authority{justify-content:flex-end}.hp-piping-class-badge{display:inline-flex;align-items:center;min-height:28px;padding:4px 9px;border:1px solid rgba(148,163,184,.26);border-radius:999px;background:rgba(15,23,42,.42);font-size:12px;font-weight:700}.hp-piping-class-badge.is-blocked{border-color:rgba(248,113,113,.38);background:rgba(127,29,29,.18)}.hp-piping-class-badge.is-info{border-color:rgba(96,165,250,.32);background:rgba(30,64,175,.16)}.hp-piping-class-badge.is-good{border-color:rgba(74,222,128,.36);background:rgba(20,83,45,.2)}
    .hp-piping-class-tabs{display:flex;gap:6px;flex-wrap:wrap;padding-bottom:10px;border-bottom:1px solid rgba(148,163,184,.16)}.hp-piping-class-tab-button,.hp-piping-class-action{font:inherit;color:inherit;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.45);border-radius:9px;padding:8px 12px;cursor:pointer}.hp-piping-class-tab-button:hover,.hp-piping-class-action:hover{background:rgba(148,163,184,.1)}.hp-piping-class-tab-button.is-active{background:rgba(148,163,184,.16);font-weight:750}.hp-piping-class-action.is-primary{background:rgba(37,99,235,.22);border-color:rgba(96,165,250,.42);font-weight:700}.hp-piping-class-action.is-danger{border-color:rgba(248,113,113,.32)}.hp-piping-class-action:disabled{opacity:.55;cursor:not-allowed}
    .hp-piping-class-panel{min-height:0}.hp-piping-class-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.8fr);gap:14px}.hp-piping-class-card{border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.26);padding:16px;margin-bottom:12px}.hp-piping-class-card h3,.hp-piping-class-card h4{margin:0 0 10px}.hp-piping-class-card h3{font-size:16px}.hp-piping-class-card h4{font-size:14px}.hp-piping-class-card p{margin:5px 0;color:var(--text-muted,#9aa8b8)}
    .hp-piping-class-metrics{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:10px;margin-bottom:14px}.hp-piping-class-metric{border:1px solid rgba(148,163,184,.18);border-radius:10px;padding:12px;background:rgba(15,23,42,.22)}.hp-piping-class-metric span{display:block;color:var(--text-muted,#9aa8b8);font-size:12px}.hp-piping-class-metric strong{display:block;margin-top:4px;font-size:17px}
    .hp-piping-class-form-grid{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:10px}.hp-piping-class-form-grid.is-2{grid-template-columns:repeat(2,minmax(220px,1fr))}.hp-piping-class-field{display:grid;gap:5px}.hp-piping-class-field>span{font-size:12px;color:var(--text-muted,#9aa8b8)}.hp-piping-class-field input,.hp-piping-class-field select,.hp-piping-class-field textarea,.hp-piping-class-inline-select{width:100%;box-sizing:border-box;font:inherit;color:inherit;background:rgba(2,6,23,.46);border:1px solid rgba(148,163,184,.24);border-radius:8px;padding:8px}.hp-piping-class-field textarea{min-height:110px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
    .hp-piping-class-list{margin:8px 0 0;padding-left:18px}.hp-piping-class-list li{margin:5px 0}.hp-piping-class-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.hp-piping-class-editor-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.hp-piping-class-subcard{border:1px solid rgba(148,163,184,.14);border-radius:10px;padding:12px;margin:10px 0;background:rgba(2,6,23,.16)}
    .hp-piping-class-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:10px}.hp-piping-class-table{width:100%;border-collapse:collapse;min-width:920px}.hp-piping-class-table th,.hp-piping-class-table td{padding:8px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;vertical-align:top}.hp-piping-class-table th{font-size:12px;color:var(--text-muted,#9aa8b8)}.hp-piping-class-table input,.hp-piping-class-table select{width:100%;box-sizing:border-box;font:inherit;color:inherit;background:rgba(2,6,23,.46);border:1px solid rgba(148,163,184,.2);border-radius:7px;padding:7px}
    .hp-piping-class-notice{padding:10px 12px;border:1px solid rgba(148,163,184,.18);border-radius:9px;background:rgba(15,23,42,.25);margin:8px 0}.hp-piping-class-notice.is-error{border-color:rgba(248,113,113,.34);background:rgba(127,29,29,.14)}.hp-piping-class-notice.is-good{border-color:rgba(74,222,128,.32);background:rgba(20,83,45,.16)}
    .hp-piping-class-result-grid{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:8px}.hp-piping-class-result-cell{border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:9px}.hp-piping-class-result-cell span{display:block;font-size:11px;color:var(--text-muted,#9aa8b8)}
    .hp-piping-class-legacy-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.hp-piping-class-legacy-host{min-height:120px}.hp-piping-class-frame{width:100%;height:min(1000px,calc(100vh - 230px));min-height:760px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#fff}
    .hp-piping-class-hidden{display:none!important}
    @media(max-width:1100px){.hp-piping-class-grid{grid-template-columns:1fr}.hp-piping-class-metrics{grid-template-columns:repeat(2,minmax(140px,1fr))}.hp-piping-class-form-grid{grid-template-columns:repeat(2,minmax(180px,1fr))}}
    @media(max-width:640px){.hp-piping-class-tab{padding:0 10px 14px}.hp-piping-class-metrics,.hp-piping-class-form-grid,.hp-piping-class-form-grid.is-2,.hp-piping-class-result-grid{grid-template-columns:1fr}.hp-piping-class-authority{justify-content:flex-start}.hp-piping-class-tab-button{flex:1 1 140px}.hp-piping-class-frame{min-height:700px}}
  `;
  document.head.appendChild(style);
}

function initialPanel(context) {
  const requested = String(context?.hpPipingClassPanel || '').trim();
  if (PANEL_IDS.has(requested)) return requested;
  try {
    const stored = localStorage.getItem(PANEL_STORAGE_KEY);
    if (PANEL_IDS.has(stored)) return stored;
  } catch {}
  return 'overview';
}

function projectSummary(snapshot) {
  const project = snapshot.project;
  const calculation = snapshot.calculation;
  return {
    validation: snapshot.validation,
    projectId: project.metadata?.projectId || 'Not initialized',
    classId: project.metadata?.classId || 'Not initialized',
    revision: project.metadata?.revision || '—',
    productCount: Array.isArray(project.products) ? project.products.length : 0,
    cycleCount: Array.isArray(project.transient?.transitions) ? project.transient.transitions.length : 0,
    fatigueCount: Array.isArray(project.fatigueEvidence) ? project.fatigueEvidence.length : 0,
    calculation,
  };
}

function field(label, path, value, { type = 'text', step = 'any', placeholder = '', disabled = false } = {}) {
  return `<label class="hp-piping-class-field"><span>${escapeHtml(label)}</span><input type="${type}" ${type === 'number' ? `step="${step}"` : ''} data-hp-bind="${attr(path)}" data-hp-type="${type === 'number' ? 'number' : 'text'}" value="${attr(type === 'number' ? numberValue(value) : value)}" placeholder="${attr(placeholder)}" ${disabled ? 'disabled' : ''}></label>`;
}

function selectField(label, path, value, options) {
  return `<label class="hp-piping-class-field"><span>${escapeHtml(label)}</span><select data-hp-bind="${attr(path)}" data-hp-type="text">${options.map((option) => `<option value="${attr(option.value)}" ${String(value ?? '') === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
}

function jsonField(label, path, value) {
  const json = value && typeof value === 'object' ? JSON.stringify(value, null, 2) : '';
  return `<label class="hp-piping-class-field"><span>${escapeHtml(label)}</span><textarea data-hp-bind="${attr(path)}" data-hp-type="json" spellcheck="false">${escapeHtml(json)}</textarea></label>`;
}

function overviewHtml(snapshot) {
  const summary = projectSummary(snapshot);
  const project = snapshot.project;
  const issues = summary.validation.issues ?? [];
  const calcState = summary.calculation?.projectState ?? 'NOT RUN';
  return `
    <div class="hp-piping-class-metrics">
      <div class="hp-piping-class-metric"><span>Class</span><strong>${escapeHtml(summary.classId)}</strong></div>
      <div class="hp-piping-class-metric"><span>Products</span><strong>${summary.productCount}</strong></div>
      <div class="hp-piping-class-metric"><span>Cycles</span><strong>${summary.cycleCount}</strong></div>
      <div class="hp-piping-class-metric"><span>v2 setup</span><strong>${summary.validation.ok ? 'Complete' : `${issues.length} open`}</strong></div>
      <div class="hp-piping-class-metric"><span>Review calc</span><strong>${escapeHtml(calcState)}</strong></div>
    </div>
    <div class="hp-piping-class-grid">
      <section class="hp-piping-class-card">
        <div class="hp-piping-class-editor-toolbar"><div><h3>Class basis</h3><p>Native state editor. No engineering equations execute in this UI layer.</p></div></div>
        <div class="hp-piping-class-form-grid">
          ${field('Project ID', 'metadata.projectId', project.metadata?.projectId)}
          ${field('Class ID', 'metadata.classId', project.metadata?.classId)}
          ${field('Revision', 'metadata.revision', project.metadata?.revision)}
          ${field('B31.3 edition', 'methodManifest.b313Edition', project.methodManifest?.b313Edition)}
          ${field('VIII-3 edition', 'methodManifest.viii3Edition', project.methodManifest?.viii3Edition)}
          ${field('Design pressure (MPa)', 'classBasis.designPressureMpa', project.classBasis?.designPressureMpa, { type: 'number' })}
          ${field('Internal allowance (mm)', 'classBasis.internalAllowanceMm', project.classBasis?.internalAllowanceMm, { type: 'number' })}
          ${field('External allowance (mm)', 'classBasis.externalAllowanceMm', project.classBasis?.externalAllowanceMm, { type: 'number' })}
          ${field('Calculation mode', 'methodManifest.calculationMode', HP_PIPING_CLASS_AUTHORITY_POLICY.calculationMode, { disabled: true })}
        </div>
      </section>
      <aside class="hp-piping-class-card">
        <h3>Readiness</h3>
        <p><strong>Project:</strong> ${escapeHtml(summary.projectId)}</p><p><strong>Revision:</strong> ${escapeHtml(summary.revision)}</p><p><strong>Fatigue evidence packages:</strong> ${summary.fatigueCount}</p>
        ${issues.length ? `<div class="hp-piping-class-notice is-error"><strong>${issues.length} setup issue(s)</strong><ul class="hp-piping-class-list">${issues.slice(0, 10).map((item) => `<li><span class="hp-piping-class-code">${escapeHtml(item.path || 'project')}</span>: ${escapeHtml(item.message)}</li>`).join('')}</ul>${issues.length > 10 ? `<p>+ ${issues.length - 10} more</p>` : ''}</div>` : '<div class="hp-piping-class-notice is-good">Project schema is complete and may be submitted to the review-only orchestrator.</div>'}
      </aside>
    </div>`;
}

function productCard(product, index) {
  const basis = product.calculationBasis ?? {};
  const wall = product.wallState ?? {};
  const direct = basis.mode !== 'GOVERNED_BASIS_PACKAGE';
  return `<section class="hp-piping-class-subcard" data-hp-product-index="${index}">
    <div class="hp-piping-class-editor-toolbar"><div><h4>Product ${index + 1}: ${escapeHtml(product.productId || 'Unidentified')}</h4></div><button type="button" class="hp-piping-class-action is-danger" data-hp-action="remove-product" data-index="${index}">Remove product</button></div>
    <div class="hp-piping-class-form-grid">
      ${field('Product ID', `products.${index}.productId`, product.productId)}
      ${selectField('Basis mode', `products.${index}.calculationBasis.mode`, basis.mode || 'DIRECT_ENGINEERING_INPUT', [
        { value: 'DIRECT_ENGINEERING_INPUT', label: 'Direct engineering input' },
        { value: 'GOVERNED_BASIS_PACKAGE', label: 'Governed basis package' },
      ])}
      ${selectField('Fatigue wall basis', `products.${index}.wallState.fatigueWallBasis`, wall.fatigueWallBasis || 'END_OF_LIFE_EFFECTIVE', [
        { value: 'END_OF_LIFE_EFFECTIVE', label: 'End-of-life effective' },
        { value: 'PROJECTED_END_OF_LIFE', label: 'Projected end-of-life' },
      ])}
      ${direct ? field('Outside diameter (mm)', `products.${index}.calculationBasis.outsideDiameterMm`, basis.outsideDiameterMm, { type: 'number' }) : ''}
      ${direct ? field('Allowable stress (MPa)', `products.${index}.calculationBasis.allowableStressMpa`, basis.allowableStressMpa, { type: 'number' }) : ''}
      ${direct ? field('Nominal wall (mm)', `products.${index}.calculationBasis.nominalWallMm`, basis.nominalWallMm, { type: 'number' }) : ''}
      ${direct ? field('Minus tolerance (%)', `products.${index}.calculationBasis.minusTolerancePct`, basis.minusTolerancePct, { type: 'number' }) : ''}
      ${field('Measured current wall (mm)', `products.${index}.wallState.measuredCurrentWallMm`, wall.measuredCurrentWallMm, { type: 'number', placeholder: 'optional brownfield' })}
      ${field('Future internal loss (mm)', `products.${index}.wallState.futureInternalLossMm`, wall.futureInternalLossMm, { type: 'number', placeholder: 'required with measured wall' })}
      ${field('Future external loss (mm)', `products.${index}.wallState.futureExternalLossMm`, wall.futureExternalLossMm, { type: 'number', placeholder: 'required with measured wall' })}
    </div>
    ${direct ? '' : `<div style="margin-top:10px">${jsonField('Governed basis package JSON', `products.${index}.calculationBasis.basisPackage`, basis.basisPackage)}</div>`}
  </section>`;
}

function productsHtml(snapshot) {
  const products = snapshot.project.products ?? [];
  return `<section class="hp-piping-class-card">
    <div class="hp-piping-class-editor-toolbar"><div><h3>Class Matrix</h3><p>Each row is a piping-class product identity with explicit basis and wall-state custody.</p></div><button type="button" class="hp-piping-class-action is-primary" data-hp-action="add-product">Add product</button></div>
    ${products.length ? products.map(productCard).join('') : '<div class="hp-piping-class-notice">No products yet. Add a product; no numerical engineering defaults will be inserted.</div>'}
  </section>`;
}

function statesTable(project) {
  const states = project.transient?.states ?? [];
  return `<div class="hp-piping-class-editor-toolbar"><h4>Operating states</h4><button type="button" class="hp-piping-class-action" data-hp-action="add-state">Add state</button></div>
  <div class="hp-piping-class-table-wrap"><table class="hp-piping-class-table"><thead><tr><th>State ID</th><th>Pressure MPa</th><th>Material T °C</th><th>Structural T °C</th><th></th></tr></thead><tbody>
  ${states.map((row, index) => `<tr><td><input data-hp-bind="transient.states.${index}.stateId" data-hp-type="text" value="${attr(row.stateId)}"></td><td><input type="number" step="any" data-hp-bind="transient.states.${index}.pressureMpa" data-hp-type="number" value="${attr(numberValue(row.pressureMpa))}"></td><td><input type="number" step="any" data-hp-bind="transient.states.${index}.materialTemperatureC" data-hp-type="number" value="${attr(numberValue(row.materialTemperatureC))}"></td><td><input type="number" step="any" data-hp-bind="transient.states.${index}.structuralTemperatureC" data-hp-type="number" value="${attr(numberValue(row.structuralTemperatureC))}"></td><td><button type="button" class="hp-piping-class-action is-danger" data-hp-action="remove-state" data-index="${index}">Remove</button></td></tr>`).join('') || '<tr><td colspan="5">No states defined.</td></tr>'}
  </tbody></table></div>`;
}

function transitionsTable(project) {
  const rows = project.transient?.transitions ?? [];
  return `<div class="hp-piping-class-editor-toolbar" style="margin-top:16px"><h4>Governed transitions</h4><button type="button" class="hp-piping-class-action" data-hp-action="add-transition">Add transition</button></div>
  <div class="hp-piping-class-table-wrap"><table class="hp-piping-class-table"><thead><tr><th>Cycle ID</th><th>From</th><th>To</th><th>Total cycles</th><th>Category</th><th></th></tr></thead><tbody>
  ${rows.map((row, index) => `<tr><td><input data-hp-bind="transient.transitions.${index}.cycleId" data-hp-type="text" value="${attr(row.cycleId)}"></td><td><input data-hp-bind="transient.transitions.${index}.fromStateId" data-hp-type="text" value="${attr(row.fromStateId)}"></td><td><input data-hp-bind="transient.transitions.${index}.toStateId" data-hp-type="text" value="${attr(row.toStateId)}"></td><td><input type="number" step="any" data-hp-bind="transient.transitions.${index}.totalCycles" data-hp-type="number" value="${attr(numberValue(row.totalCycles))}"></td><td><input data-hp-bind="transient.transitions.${index}.category" data-hp-type="text" value="${attr(row.category)}"></td><td><button type="button" class="hp-piping-class-action is-danger" data-hp-action="remove-transition" data-index="${index}">Remove</button></td></tr>`).join('') || '<tr><td colspan="6">No transitions defined.</td></tr>'}
  </tbody></table></div>`;
}

function externalResultCard(result, evidenceIndex, resultIndex) {
  const basis = result.calculationBasis ?? {};
  return `<details class="hp-piping-class-subcard" open><summary><strong>${escapeHtml(result.cycleId || `External result ${resultIndex + 1}`)}</strong> · USER_CALCULATED_KD3</summary>
    <div class="hp-piping-class-editor-toolbar" style="margin-top:10px"><span></span><button type="button" class="hp-piping-class-action is-danger" data-hp-action="remove-external-result" data-evidence-index="${evidenceIndex}" data-result-index="${resultIndex}">Remove result</button></div>
    <div class="hp-piping-class-form-grid">
      ${field('Cycle ID', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.cycleId`, result.cycleId)}
      ${field('Location ID', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.locationId`, result.locationId)}
      ${field('From state', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.fromStateId`, result.fromStateId)}
      ${field('To state', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.toStateId`, result.toStateId)}
      ${field('User Salt (MPa, optional cross-check)', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.userAlternatingStressIntensityMpa`, result.userAlternatingStressIntensityMpa, { type: 'number' })}
      ${field('External Seq (MPa)', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.equivalentAlternatingStressMpa`, result.equivalentAlternatingStressMpa, { type: 'number' })}
      ${field('External N', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.permissibleCycles`, result.permissibleCycles, { type: 'number', placeholder: 'blank only for zero-damage' })}
      ${field('Code', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.code`, basis.code)}
      ${field('Edition', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.edition`, basis.edition)}
      ${field('Method / clause', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.methodRef`, basis.methodRef)}
      ${field('Calculation ref', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.calculationRef`, basis.calculationRef)}
      ${field('Calculated by', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.calculatedBy`, basis.calculatedBy)}
      ${field('Checked by', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.checkedBy`, basis.checkedBy)}
      ${field('Checked at (ISO 8601)', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.checkedAt`, basis.checkedAt)}
    </div>
  </details>`;
}

function fatigueEvidenceHtml(project) {
  const evidence = project.fatigueEvidence ?? [];
  const used = new Set(evidence.map((row) => row.productId));
  const unused = (project.products ?? []).filter((row) => row.productId && !used.has(row.productId));
  return `<div class="hp-piping-class-editor-toolbar" style="margin-top:16px"><div><h4>External KD-3 evidence</h4><p>CORE will derive Salt and Miner usage. Seq and N remain externally supplied.</p></div><div class="hp-piping-class-actions">${unused.length ? `<select class="hp-piping-class-inline-select" data-hp-evidence-product-select>${unused.map((row) => `<option value="${attr(row.productId)}">${escapeHtml(row.productId)}</option>`).join('')}</select><button type="button" class="hp-piping-class-action" data-hp-action="add-evidence">Add product evidence</button>` : ''}</div></div>
  ${evidence.map((pkg, evidenceIndex) => `<section class="hp-piping-class-subcard"><div class="hp-piping-class-editor-toolbar"><div><h4>${escapeHtml(pkg.productId || 'Unidentified product')}</h4><p>${pkg.externalResults?.length ?? 0} external cycle result(s)</p></div><div class="hp-piping-class-actions"><button type="button" class="hp-piping-class-action" data-hp-action="add-external-result" data-evidence-index="${evidenceIndex}">Add cycle result</button><button type="button" class="hp-piping-class-action is-danger" data-hp-action="remove-evidence" data-evidence-index="${evidenceIndex}">Remove evidence</button></div></div>${(pkg.externalResults ?? []).map((result, resultIndex) => externalResultCard(result, evidenceIndex, resultIndex)).join('') || '<div class="hp-piping-class-notice">No external cycle results yet.</div>'}</section>`).join('') || '<div class="hp-piping-class-notice">No external KD-3 evidence attached. Static review can still run after the project schema is complete.</div>'}`;
}

function fatigueHtml(snapshot) {
  const project = snapshot.project;
  const spectrum = project.transient?.spectrum ?? {};
  return `<section class="hp-piping-class-card">
    <h3>Cycles & Fatigue</h3><p>Governed transient identities live in v2 state. External Seq/N custody is edited separately from CORE Salt and Miner calculations.</p>
    <div class="hp-piping-class-form-grid is-2">
      ${field('Spectrum ID', 'transient.spectrum.spectrumId', spectrum.spectrumId)}
      ${field('Design life (years)', 'transient.spectrum.designLifeYears', spectrum.designLifeYears, { type: 'number' })}
    </div>
    ${statesTable(project)}
    ${transitionsTable(project)}
    ${fatigueEvidenceHtml(project)}
  </section>`;
}

function resultProductHtml(row) {
  const staticLabel = row.assessment?.staticPass === null ? '—' : row.assessment?.staticPass ? 'PASS' : 'FAIL';
  const fatigueLabel = row.assessment?.fatigueEvaluated ? (row.assessment?.fatigueUsageWithinUnity ? 'U ≤ 1' : 'U > 1 / blocked') : 'Not supplied';
  return `<section class="hp-piping-class-subcard"><div class="hp-piping-class-editor-toolbar"><h4>${escapeHtml(row.productId)}</h4><span class="hp-piping-class-badge is-blocked">REVIEW ONLY</span></div><div class="hp-piping-class-result-grid">
    <div class="hp-piping-class-result-cell"><span>Calculation</span><strong>${row.calculationOk ? 'Executed' : 'Blocked'}</strong></div>
    <div class="hp-piping-class-result-cell"><span>Engineering state</span><strong>${escapeHtml(row.engineeringState)}</strong></div>
    <div class="hp-piping-class-result-cell"><span>Static reference</span><strong>${staticLabel}</strong></div>
    <div class="hp-piping-class-result-cell"><span>Fatigue</span><strong>${fatigueLabel}</strong></div>
    <div class="hp-piping-class-result-cell"><span>Fatigue wall</span><strong>${Number.isFinite(row.selectedFatigueWallMm) ? `${row.selectedFatigueWallMm.toFixed(4)} mm` : '—'}</strong></div>
    <div class="hp-piping-class-result-cell"><span>Cumulative U</span><strong>${Number.isFinite(row.assessment?.cumulativeUsage) ? row.assessment.cumulativeUsage.toFixed(6) : '—'}</strong></div>
    <div class="hp-piping-class-result-cell"><span>Basis mode</span><strong>${escapeHtml(row.basisMode)}</strong></div>
    <div class="hp-piping-class-result-cell"><span>Design authority</span><strong>FALSE</strong></div>
  </div></section>`;
}

function evidenceHtml(snapshot) {
  const issues = snapshot.validation.issues ?? [];
  const result = snapshot.calculation;
  return `<section class="hp-piping-class-card">
    <div class="hp-piping-class-editor-toolbar"><div><h3>Evidence & Results</h3><p>Project JSON is the editable domain state. Calculation results are regenerated and are not persisted as engineering authority.</p></div><div class="hp-piping-class-actions"><button type="button" class="hp-piping-class-action" data-hp-action="export-project">Export v2 JSON</button><button type="button" class="hp-piping-class-action" data-hp-action="import-project">Import v2 JSON</button><input class="hp-piping-class-hidden" type="file" accept="application/json,.json" data-hp-project-file></div></div>
    ${issues.length ? `<div class="hp-piping-class-notice is-error"><strong>Calculation blocked until ${issues.length} schema issue(s) are resolved.</strong><ul class="hp-piping-class-list">${issues.map((item) => `<li><span class="hp-piping-class-code">${escapeHtml(item.path || 'project')}</span>: ${escapeHtml(item.message)}</li>`).join('')}</ul></div>` : '<div class="hp-piping-class-notice is-good">Schema complete. Review calculation may execute, but remains non-authoritative.</div>'}
    ${!result ? '<div class="hp-piping-class-notice">No native review calculation has been run for the current project revision.</div>' : result.projectState === 'AUTHORITY_PROMOTION_BLOCKED' ? '<div class="hp-piping-class-notice is-error"><strong>Result rejected:</strong> authority promotion guard tripped.</div>' : `<div class="hp-piping-class-notice ${result.ok ? 'is-good' : 'is-error'}"><strong>${escapeHtml(result.projectState || 'CALCULATION RESULT')}</strong> · ${result.ok ? 'canonical calculation execution complete' : 'calculation blocked'} · DESIGN AUTHORITY FALSE</div>${(result.products ?? []).map(resultProductHtml).join('')}`}
  </section>`;
}

function legacyHtml() {
  return `<section class="hp-piping-class-card"><h3>Legacy compatibility workspace</h3><p>The previous engineering-library → authority-package → calculator chain is retained temporarily for comparison and reviewer continuity. It no longer owns native v2 state.</p><div class="hp-piping-class-legacy-actions"><button type="button" class="hp-piping-class-action is-primary" data-hp-load-legacy>Open legacy workspace</button><span data-hp-legacy-status>Not loaded</span></div><div class="hp-piping-class-legacy-host" data-hp-legacy-host></div></section>`;
}

function panelHtml(panelId, snapshot) {
  if (panelId === 'overview') return overviewHtml(snapshot);
  if (panelId === 'products') return productsHtml(snapshot);
  if (panelId === 'fatigue') return fatigueHtml(snapshot);
  if (panelId === 'evidence') return evidenceHtml(snapshot);
  return legacyHtml();
}

function mountLegacyWorkspace(panel) {
  const host = panel.querySelector('[data-hp-legacy-host]');
  const status = panel.querySelector('[data-hp-legacy-status]');
  const button = panel.querySelector('[data-hp-load-legacy]');
  if (!host || host.querySelector('iframe')) return;
  const frame = document.createElement('iframe');
  frame.className = 'hp-piping-class-frame';
  frame.src = LEGACY_WORKSPACE_SRC;
  frame.title = 'HP Piping Class legacy compatibility workspace';
  frame.loading = 'lazy';
  frame.addEventListener('load', () => { if (status) status.textContent = 'Legacy workspace loaded'; }, { once: true });
  host.appendChild(frame);
  if (button) button.disabled = true;
  if (status) status.textContent = 'Loading legacy workspace…';
}

function setPath(target, path, value) {
  const tokens = String(path).split('.').filter(Boolean).map((token) => /^\d+$/.test(token) ? Number(token) : token);
  if (!tokens.length) return;
  let cursor = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (cursor[token] == null || typeof cursor[token] !== 'object') cursor[token] = typeof next === 'number' ? [] : {};
    cursor = cursor[token];
  }
  const last = tokens.at(-1);
  if (value === undefined) delete cursor[last];
  else cursor[last] = value;
}

function inputValue(element) {
  const kind = element.dataset.hpType || 'text';
  if (kind === 'number') {
    if (String(element.value).trim() === '') return undefined;
    const value = Number(element.value);
    return Number.isFinite(value) ? value : undefined;
  }
  if (kind === 'json') {
    if (!String(element.value).trim()) return {};
    return JSON.parse(element.value);
  }
  return element.value;
}

function downloadProject(project) {
  const blob = new Blob([serializeHpPipingClassWorkspaceProject(project)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const classId = String(project.metadata?.classId || 'hp-piping-class').replace(/[^a-z0-9_-]+/gi, '-');
  const revision = String(project.metadata?.revision || 'draft').replace(/[^a-z0-9_-]+/gi, '-');
  link.href = url;
  link.download = `${classId}-${revision}.hp-piping-class.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function renderHpPipingClassTab(container, { context = null } = {}) {
  ensureStylesheet();
  const controller = createHpPipingClassWorkspaceController({
    initialProject: context?.hpPipingClassProject ?? null,
  });
  let activePanel = initialPanel(context);
  let statusMessage = 'Draft state is persisted locally. Results remain review-only.';

  container.innerHTML = `<div class="hp-piping-class-tab" data-hp-piping-class-native="true" data-project-schema="${HP_PIPING_CLASS_PROJECT_VERSION}">
    <div class="hp-piping-class-tab-header"><div><h2>HP Piping Class</h2><p>Native class-level workspace for B31.3 Chapter IX basis, product matrix, pressure-cycle fatigue evidence, and qualification readiness.</p></div><div><div class="hp-piping-class-authority" aria-label="HP Piping Class authority status"><span class="hp-piping-class-badge is-info">${escapeHtml(HP_PIPING_CLASS_AUTHORITY_POLICY.calculationMode)}</span><span class="hp-piping-class-badge is-blocked">CORE KD-3 · NOT QUALIFIED</span><span class="hp-piping-class-badge is-blocked">DESIGN AUTHORITY · FALSE</span></div><div class="hp-piping-class-actions" style="justify-content:flex-end;margin-top:8px"><button type="button" class="hp-piping-class-action is-primary" data-hp-action="calculate">Run review calculation</button><span class="hp-piping-class-code" data-hp-workspace-status></span></div></div></div>
    <div class="hp-piping-class-tabs" role="tablist" aria-label="HP Piping Class sections">${PANELS.map((panel) => `<button type="button" class="hp-piping-class-tab-button" data-hp-panel="${panel.id}" role="tab">${escapeHtml(panel.label)}</button>`).join('')}</div>
    <div class="hp-piping-class-panel" data-hp-panel-host></div>
  </div>`;

  const panelHost = container.querySelector('[data-hp-panel-host]');
  const status = container.querySelector('[data-hp-workspace-status]');

  function snapshot() { return controller.getSnapshot(); }

  function updateChrome() {
    const current = snapshot();
    const issueCount = current.validation.issues?.length ?? 0;
    if (status) status.textContent = `${issueCount ? `${issueCount} setup issue(s)` : 'schema complete'} · ${statusMessage}`;
  }

  function renderPanel(nextPanel = activePanel) {
    activePanel = PANEL_IDS.has(nextPanel) ? nextPanel : 'overview';
    try { localStorage.setItem(PANEL_STORAGE_KEY, activePanel); } catch {}
    container.querySelectorAll('[data-hp-panel]').forEach((button) => {
      const active = button.dataset.hpPanel === activePanel;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
    panelHost.innerHTML = panelHtml(activePanel, snapshot());
    updateChrome();
  }

  function mutate(mutator, { rerender = false } = {}) {
    controller.mutateProject(mutator);
    statusMessage = 'draft saved · prior calculation cleared';
    if (rerender) renderPanel();
    else updateChrome();
  }

  function handleStructuralAction(action, target) {
    if (action === 'add-product') mutate((draft) => {
      draft.products ??= [];
      draft.products.push({ productId: '', calculationBasis: { mode: 'DIRECT_ENGINEERING_INPUT' }, wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' } });
    }, { rerender: true });
    if (action === 'remove-product') mutate((draft) => { draft.products.splice(Number(target.dataset.index), 1); }, { rerender: true });
    if (action === 'add-state') mutate((draft) => { draft.transient ??= { spectrum: {}, states: [], transitions: [] }; draft.transient.states ??= []; draft.transient.states.push({ spectrumId: draft.transient.spectrum?.spectrumId || '' }); }, { rerender: true });
    if (action === 'remove-state') mutate((draft) => { draft.transient.states.splice(Number(target.dataset.index), 1); }, { rerender: true });
    if (action === 'add-transition') mutate((draft) => { draft.transient ??= { spectrum: {}, states: [], transitions: [] }; draft.transient.transitions ??= []; draft.transient.transitions.push({ spectrumId: draft.transient.spectrum?.spectrumId || '' }); }, { rerender: true });
    if (action === 'remove-transition') mutate((draft) => { draft.transient.transitions.splice(Number(target.dataset.index), 1); }, { rerender: true });
    if (action === 'add-evidence') {
      const select = panelHost.querySelector('[data-hp-evidence-product-select]');
      const productId = select?.value;
      if (productId) mutate((draft) => { draft.fatigueEvidence ??= []; draft.fatigueEvidence.push({ productId, externalResults: [] }); }, { rerender: true });
    }
    if (action === 'remove-evidence') mutate((draft) => { draft.fatigueEvidence.splice(Number(target.dataset.evidenceIndex), 1); }, { rerender: true });
    if (action === 'add-external-result') mutate((draft) => {
      const evidenceIndex = Number(target.dataset.evidenceIndex);
      const transition = draft.transient?.transitions?.[0];
      const row = transition ? { cycleId: transition.cycleId || '', fromStateId: transition.fromStateId || '', toStateId: transition.toStateId || '' } : {};
      row.locationId = '';
      row.calculationBasis = {};
      draft.fatigueEvidence[evidenceIndex].externalResults.push(row);
    }, { rerender: true });
    if (action === 'remove-external-result') mutate((draft) => { draft.fatigueEvidence[Number(target.dataset.evidenceIndex)].externalResults.splice(Number(target.dataset.resultIndex), 1); }, { rerender: true });
  }

  async function importProjectFile(file) {
    try {
      const project = parseHpPipingClassWorkspaceProject(await file.text());
      controller.replaceProject(project, { reason: 'PROJECT_IMPORTED' });
      statusMessage = 'project imported · review calculation required';
      renderPanel('overview');
    } catch (error) {
      statusMessage = `import blocked: ${error.message}`;
      updateChrome();
    }
  }

  function onInput(event) {
    const element = event.target.closest('[data-hp-bind]');
    if (!element) return;
    try {
      const value = inputValue(element);
      mutate((draft) => {
        setPath(draft, element.dataset.hpBind, value);
        if (element.dataset.hpBind === 'transient.spectrum.spectrumId') {
          (draft.transient?.states ?? []).forEach((row) => { row.spectrumId = value ?? ''; });
          (draft.transient?.transitions ?? []).forEach((row) => { row.spectrumId = value ?? ''; });
        }
      }, { rerender: element.tagName === 'SELECT' && element.dataset.hpBind.endsWith('.mode') });
    } catch (error) {
      statusMessage = `edit blocked: ${error.message}`;
      updateChrome();
    }
  }

  function onClick(event) {
    const panelButton = event.target.closest('[data-hp-panel]');
    if (panelButton) { renderPanel(panelButton.dataset.hpPanel); return; }
    if (event.target.closest('[data-hp-load-legacy]')) { mountLegacyWorkspace(panelHost); return; }
    const target = event.target.closest('[data-hp-action]');
    if (!target) return;
    const action = target.dataset.hpAction;
    if (['add-product','remove-product','add-state','remove-state','add-transition','remove-transition','add-evidence','remove-evidence','add-external-result','remove-external-result'].includes(action)) { handleStructuralAction(action, target); return; }
    if (action === 'calculate') {
      const result = controller.calculate({ includeEvidence: true });
      statusMessage = result.ok ? `${result.projectState} · REVIEW ONLY` : `${result.projectState || 'CALCULATION_BLOCKED'} · REVIEW ONLY`;
      renderPanel(activePanel === 'legacy' ? 'evidence' : activePanel);
      return;
    }
    if (action === 'export-project') { downloadProject(snapshot().project); return; }
    if (action === 'import-project') { panelHost.querySelector('[data-hp-project-file]')?.click(); }
  }

  function onChange(event) {
    if (event.target.matches('[data-hp-project-file]') && event.target.files?.[0]) {
      importProjectFile(event.target.files[0]).finally(() => { event.target.value = ''; });
    }
  }

  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  container.addEventListener('click', onClick);
  renderPanel(activePanel);

  return () => {
    container.removeEventListener('input', onInput);
    container.removeEventListener('change', onChange);
    container.removeEventListener('click', onClick);
    container.innerHTML = '';
  };
}

export { LEGACY_WORKSPACE_SRC, PANELS as HP_PIPING_CLASS_PANELS };
