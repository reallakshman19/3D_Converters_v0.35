import {
  HP_PIPING_CLASS_AUTHORITY_POLICY,
  HP_PIPING_CLASS_PROJECT_VERSION,
} from '../converters/b313-chapter-ix/hp-piping-class-project.js';
import {
  createHpPipingClassWorkspaceController,
  parseHpPipingClassWorkspaceProject,
  serializeHpPipingClassWorkspaceProject,
} from './hp-piping-class-workspace-controller.js';
import {
  HP_PIPING_CLASS_NPS4_REFERENCE_ID,
  createHpPipingClassReferenceProject,
  getHpPipingClassReferenceProjectId,
  getHpPipingClassReferenceSample,
  getHpPipingClassReferenceSamples,
} from './hp-piping-class-reference-samples.js';
import {
  applyHpPipingClassRelationalEdit,
  cascadeRemoveHpPipingClassProduct,
  cascadeRemoveHpPipingClassState,
  cascadeRemoveHpPipingClassTransition,
  createHpPipingClassExternalResultShell,
} from './hp-piping-class-workbench-state.js';

const STEPS = Object.freeze([
  { id: 'design', number: 1, label: 'Design Basis', caption: 'Code, class and product data' },
  { id: 'static', number: 2, label: 'Static Wall', caption: 'Straight-pipe pressure review' },
  { id: 'cycles', number: 3, label: 'Pressure Cycles', caption: 'Class transient spectrum' },
  { id: 'kd', number: 4, label: 'KD Review', caption: 'CORE Salt + external Seq / N' },
  { id: 'envelope', number: 5, label: 'Review Envelope', caption: 'Class result and evidence' },
]);
const STEP_IDS = new Set(STEPS.map((step) => step.id));
const STEP_STORAGE_KEY = 'format-converters.hpPipingClass.workbench.step';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function attr(value) {
  return esc(value ?? '');
}

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
}

function numValue(value) {
  return Number.isFinite(value) ? value : '';
}

function field(label, path, value, { type = 'text', readonly = false, step = 'any', placeholder = '' } = {}) {
  return `<label class="hpwb-field"><span>${esc(label)}</span><input ${type === 'number' ? `type="number" step="${step}"` : 'type="text"'} data-hpwb-bind="${attr(path)}" data-hpwb-type="${type}" value="${attr(type === 'number' ? numValue(value) : value)}" placeholder="${attr(placeholder)}" ${readonly ? 'readonly' : ''}></label>`;
}

function selectField(label, path, value, options) {
  return `<label class="hpwb-field"><span>${esc(label)}</span><select data-hpwb-bind="${attr(path)}" data-hpwb-type="text">${options.map((item) => `<option value="${attr(item.value)}" ${String(value ?? '') === String(item.value) ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label>`;
}

function inputValue(element) {
  if (element.dataset.hpwbType === 'number') {
    if (!String(element.value).trim()) return undefined;
    const number = Number(element.value);
    return Number.isFinite(number) ? number : undefined;
  }
  return element.value;
}

function ensureStyles() {
  if (document.querySelector('style[data-hp-workbench-style="true"]')) return;
  const style = document.createElement('style');
  style.dataset.hpWorkbenchStyle = 'true';
  style.textContent = `
    .hpwb{padding:0 18px 24px;min-height:calc(100vh - 150px);color:inherit}.hpwb *{box-sizing:border-box}
    .hpwb-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(290px,430px);gap:16px;padding:10px 0 16px}.hpwb-eyebrow{margin:0 0 4px;text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:800;color:#60a5fa}.hpwb-hero h2{margin:0;font-size:25px;line-height:1.15}.hpwb-hero p{margin:7px 0 0;max-width:880px;color:var(--text-muted,#9aa8b8)}
    .hpwb-scope{border:1px solid rgba(96,165,250,.28);border-radius:14px;padding:13px 15px;background:linear-gradient(135deg,rgba(30,64,175,.18),rgba(15,23,42,.34));display:grid;gap:5px}.hpwb-scope span{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#93c5fd}.hpwb-scope strong{font-size:15px}.hpwb-scope small{color:var(--text-muted,#9aa8b8);line-height:1.45}
    .hpwb-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin-bottom:12px;border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(15,23,42,.28)}.hpwb-actions,.hpwb-badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.hpwb-button,.hpwb-inline-select{font:inherit;color:inherit;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.56);border-radius:9px;padding:8px 12px}.hpwb-button{cursor:pointer}.hpwb-button:hover{background:rgba(148,163,184,.12)}.hpwb-button.primary{background:rgba(37,99,235,.24);border-color:rgba(96,165,250,.48);font-weight:750}.hpwb-button.quiet{background:transparent}.hpwb-button.danger{border-color:rgba(248,113,113,.38)}.hpwb-button:disabled{opacity:.5;cursor:not-allowed}.hpwb-inline-select{min-width:230px}
    .hpwb-badge{display:inline-flex;align-items:center;min-height:27px;padding:4px 9px;border:1px solid rgba(148,163,184,.24);border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.02em}.hpwb-badge.info{border-color:rgba(96,165,250,.35);background:rgba(30,64,175,.16)}.hpwb-badge.blocked{border-color:rgba(248,113,113,.38);background:rgba(127,29,29,.16)}.hpwb-badge.good{border-color:rgba(74,222,128,.35);background:rgba(20,83,45,.18)}.hpwb-badge.warn{border-color:rgba(250,204,21,.35);background:rgba(113,63,18,.18)}
    .hpwb-workflow{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:8px;margin-bottom:14px}.hpwb-step{font:inherit;color:inherit;text-align:left;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.28);padding:10px;cursor:pointer;display:grid;grid-template-columns:30px 1fr;gap:9px;align-items:center}.hpwb-step:hover{background:rgba(148,163,184,.08)}.hpwb-step.active{border-color:rgba(96,165,250,.48);background:rgba(30,64,175,.16)}.hpwb-step-number{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:rgba(148,163,184,.12);font-size:12px;font-weight:850}.hpwb-step strong,.hpwb-step small{display:block}.hpwb-step small{margin-top:2px;color:var(--text-muted,#9aa8b8);font-size:10px}
    .hpwb-panel{border:1px solid rgba(148,163,184,.17);border-radius:14px;background:rgba(15,23,42,.22);padding:16px}.hpwb-panel-heading{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.hpwb-panel-heading h3{margin:0;font-size:18px}.hpwb-panel-heading p{margin:5px 0 0;color:var(--text-muted,#9aa8b8)}.hpwb-code-chip{border:1px solid rgba(96,165,250,.28);border-radius:999px;padding:5px 9px;font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:#93c5fd;white-space:nowrap}
    .hpwb-card{border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:13px;margin:10px 0;background:rgba(2,6,23,.16)}.hpwb-card h4{margin:0 0 9px;font-size:14px}.hpwb-card p{margin:5px 0;color:var(--text-muted,#9aa8b8)}.hpwb-grid{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:10px}.hpwb-grid.two{grid-template-columns:repeat(2,minmax(220px,1fr))}.hpwb-field{display:grid;gap:5px}.hpwb-field span{font-size:11px;color:var(--text-muted,#9aa8b8);font-weight:650}.hpwb-field input,.hpwb-field select,.hpwb-table input,.hpwb-table select{width:100%;font:inherit;color:inherit;background:rgba(2,6,23,.52);border:1px solid rgba(148,163,184,.23);border-radius:8px;padding:8px}.hpwb-field input[readonly]{opacity:.75}
    .hpwb-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:10px}.hpwb-table{width:100%;border-collapse:collapse;min-width:900px}.hpwb-table th,.hpwb-table td{padding:8px;border-bottom:1px solid rgba(148,163,184,.11);text-align:left;vertical-align:middle}.hpwb-table th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#9aa8b8)}.hpwb-table td{font-size:12px}.hpwb-table tr:last-child td{border-bottom:0}
    .hpwb-metrics{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:9px;margin:10px 0 14px}.hpwb-metric{border:1px solid rgba(148,163,184,.15);border-radius:11px;padding:10px 11px;background:rgba(2,6,23,.2)}.hpwb-metric span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#9aa8b8)}.hpwb-metric strong{display:block;margin-top:4px;font-size:17px}.hpwb-metric small{display:block;margin-top:3px;color:var(--text-muted,#9aa8b8);font-size:10px}
    .hpwb-notice{border:1px solid rgba(148,163,184,.17);border-radius:10px;padding:10px 12px;margin:9px 0;background:rgba(15,23,42,.3);line-height:1.45}.hpwb-notice.good{border-color:rgba(74,222,128,.32);background:rgba(20,83,45,.14)}.hpwb-notice.warn{border-color:rgba(250,204,21,.32);background:rgba(113,63,18,.13)}.hpwb-notice.error{border-color:rgba(248,113,113,.34);background:rgba(127,29,29,.14)}.hpwb-notice strong{font-weight:800}.hpwb-notice ul{margin:7px 0 0;padding-left:18px}.hpwb-notice li{margin:3px 0}
    .hpwb-chain{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px;border:1px solid rgba(148,163,184,.15);border-radius:11px;background:rgba(2,6,23,.18);margin:10px 0}.hpwb-chain-node{padding:7px 9px;border-radius:8px;border:1px solid rgba(148,163,184,.18);font-size:11px;font-weight:750}.hpwb-chain-node.core{border-color:rgba(74,222,128,.3);background:rgba(20,83,45,.14)}.hpwb-chain-node.external{border-color:rgba(250,204,21,.3);background:rgba(113,63,18,.12)}.hpwb-chain-arrow{color:var(--text-muted,#9aa8b8)}
    .hpwb-section-toolbar{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin:11px 0 8px}.hpwb-section-toolbar h4{margin:0}.hpwb-foot-actions{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:14px}.hpwb-status{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text-muted,#9aa8b8)}.hpwb-hidden{display:none!important}.hpwb-governed{font-size:11px;color:#93c5fd;line-height:1.4}
    @media(max-width:1180px){.hpwb-workflow{grid-template-columns:repeat(2,minmax(180px,1fr))}.hpwb-metrics{grid-template-columns:repeat(2,minmax(140px,1fr))}.hpwb-grid{grid-template-columns:repeat(2,minmax(180px,1fr))}.hpwb-hero{grid-template-columns:1fr}}
    @media(max-width:680px){.hpwb{padding:0 10px 18px}.hpwb-workflow,.hpwb-grid,.hpwb-grid.two,.hpwb-metrics{grid-template-columns:1fr}.hpwb-step{grid-template-columns:30px 1fr}.hpwb-toolbar{align-items:flex-start}.hpwb-actions{width:100%}.hpwb-button{flex:1 1 145px}.hpwb-inline-select{width:100%}}
  `;
  document.head.appendChild(style);
}

function initialStep(context) {
  const requested = String(context?.hpPipingClassPanel || context?.hpPipingClassStep || '').trim();
  if (STEP_IDS.has(requested)) return requested;
  try {
    const stored = localStorage.getItem(STEP_STORAGE_KEY);
    if (STEP_IDS.has(stored)) return stored;
  } catch {}
  return 'design';
}

function isUninitialized(project) {
  return !project?.metadata?.projectId
    && !project?.metadata?.classId
    && !(project?.products?.length)
    && !(project?.transient?.states?.length)
    && !(project?.fatigueEvidence?.length);
}

function productResult(snapshot, productId) {
  return (snapshot.calculation?.products ?? []).find((row) => row.productId === productId) ?? null;
}

function calcNotice(snapshot) {
  const issues = snapshot.validation?.issues ?? [];
  if (issues.length) return `<div class="hpwb-notice error"><strong>${issues.length} setup issue(s) block calculation.</strong><ul>${issues.slice(0, 10).map((item) => `<li>${esc(item.path || 'project')}: ${esc(item.message)}</li>`).join('')}</ul></div>`;
  if (!snapshot.calculation) return '<div class="hpwb-notice warn"><strong>Ready.</strong> Run the review calculation to refresh CORE static, wall-state and fatigue bookkeeping.</div>';
  if (!snapshot.calculation.ok) return `<div class="hpwb-notice error"><strong>${esc(snapshot.calculation.projectState || 'CALCULATION BLOCKED')}</strong> · Review the inputs/evidence before proceeding.</div>`;
  return `<div class="hpwb-notice good"><strong>${esc(snapshot.calculation.projectState)}</strong> · Canonical calculation path executed. Results remain review-only.</div>`;
}

function referenceNotice(project) {
  const definition = getHpPipingClassReferenceSample(getHpPipingClassReferenceProjectId(project));
  if (!definition) return '';
  return `<div class="hpwb-notice good"><strong>${esc(definition.shortLabel)} loaded.</strong> ${esc(definition.description)}</div>`;
}

function directProductCell(product, path, value) {
  return product.calculationBasis?.mode === 'DIRECT_ENGINEERING_INPUT'
    ? `<input type="number" step="any" data-hpwb-bind="${attr(path)}" data-hpwb-type="number" value="${attr(numValue(value))}">`
    : '<span class="hpwb-governed">Governed by master package</span>';
}

function designPanel(snapshot) {
  const project = snapshot.project;
  const products = project.products ?? [];
  return `<section class="hpwb-panel">
    <div class="hpwb-panel-heading"><div><h3>Design Basis</h3><p>Define class identity, pressure basis, products and wall custody. Engineering equations remain in the central calculation layer.</p></div><div class="hpwb-code-chip">B31.3 Ch IX · REVIEW</div></div>
    ${referenceNotice(project)}
    <div class="hpwb-card"><h4>Class identity</h4><div class="hpwb-grid">
      ${field('Project ID', 'metadata.projectId', project.metadata?.projectId)}
      ${field('Class ID', 'metadata.classId', project.metadata?.classId)}
      ${field('Revision', 'metadata.revision', project.metadata?.revision)}
      ${field('B31.3 edition', 'methodManifest.b313Edition', project.methodManifest?.b313Edition)}
      ${field('VIII-3 edition', 'methodManifest.viii3Edition', project.methodManifest?.viii3Edition)}
      ${field('Calculation mode', 'methodManifest.calculationMode', HP_PIPING_CLASS_AUTHORITY_POLICY.calculationMode, { readonly: true })}
      ${field('Design pressure (MPa)', 'classBasis.designPressureMpa', project.classBasis?.designPressureMpa, { type: 'number' })}
      ${field('Internal allowance (mm)', 'classBasis.internalAllowanceMm', project.classBasis?.internalAllowanceMm, { type: 'number' })}
      ${field('External allowance (mm)', 'classBasis.externalAllowanceMm', project.classBasis?.externalAllowanceMm, { type: 'number' })}
    </div></div>
    <div class="hpwb-section-toolbar"><h4>Pipe product matrix</h4><button class="hpwb-button" data-hpwb-action="add-product" type="button">+ Add direct-input product</button></div>
    <div class="hpwb-table-wrap"><table class="hpwb-table"><thead><tr><th>Product</th><th>Basis</th><th>OD mm</th><th>S MPa</th><th>Nominal wall mm</th><th>Minus tol %</th><th></th></tr></thead><tbody>
      ${products.map((product, index) => {
        const row = productResult(snapshot, product.productId);
        const resolved = row?.resolvedBasis ?? {};
        const direct = product.calculationBasis?.mode === 'DIRECT_ENGINEERING_INPUT';
        return `<tr><td><input data-hpwb-bind="products.${index}.productId" data-hpwb-type="text" value="${attr(product.productId)}"></td><td><span class="hpwb-badge ${direct ? 'info' : 'good'}">${direct ? 'DIRECT INPUT' : 'GOVERNED MASTER'}</span></td><td>${directProductCell(product, `products.${index}.calculationBasis.outsideDiameterMm`, product.calculationBasis?.outsideDiameterMm)}${direct ? '' : `<span>${fmt(resolved.outsideDiameterMm)} mm</span>`}</td><td>${directProductCell(product, `products.${index}.calculationBasis.allowableStressMpa`, product.calculationBasis?.allowableStressMpa)}${direct ? '' : `<span>${fmt(resolved.allowableStressMpa)} MPa</span>`}</td><td>${directProductCell(product, `products.${index}.calculationBasis.nominalWallMm`, product.calculationBasis?.nominalWallMm)}${direct ? '' : `<span>${fmt(resolved.nominalWallMm)} mm</span>`}</td><td>${directProductCell(product, `products.${index}.calculationBasis.minusTolerancePct`, product.calculationBasis?.minusTolerancePct)}${direct ? '' : `<span>${fmt(resolved.minusTolerancePct, 2)}%</span>`}</td><td><button class="hpwb-button danger" data-hpwb-action="remove-product" data-index="${index}" type="button">Remove</button></td></tr>`;
      }).join('') || '<tr><td colspan="7">No products. Load a reference example or add a product.</td></tr>'}
    </tbody></table></div>
    ${products.map((product, index) => `<div class="hpwb-card"><div class="hpwb-section-toolbar"><h4>${esc(product.productId || `Product ${index + 1}`)} · wall custody</h4><span class="hpwb-badge info">${esc(product.wallState?.fatigueWallBasis || 'UNSET')}</span></div><div class="hpwb-grid">
      ${selectField('Fatigue wall basis', `products.${index}.wallState.fatigueWallBasis`, product.wallState?.fatigueWallBasis || 'END_OF_LIFE_EFFECTIVE', [
        { value: 'END_OF_LIFE_EFFECTIVE', label: 'End-of-life effective wall' },
        { value: 'PROJECTED_END_OF_LIFE', label: 'Projected end-of-life wall' },
      ])}
      ${field('Measured current wall (mm)', `products.${index}.wallState.measuredCurrentWallMm`, product.wallState?.measuredCurrentWallMm, { type: 'number', placeholder: 'Brownfield only' })}
      ${field('Future internal loss (mm)', `products.${index}.wallState.futureInternalLossMm`, product.wallState?.futureInternalLossMm, { type: 'number', placeholder: 'Brownfield only' })}
      ${field('Future external loss (mm)', `products.${index}.wallState.futureExternalLossMm`, product.wallState?.futureExternalLossMm, { type: 'number', placeholder: 'Brownfield only' })}
    </div>${product.calculationBasis?.mode === 'GOVERNED_BASIS_PACKAGE' ? '<div class="hpwb-notice"><strong>Governed basis:</strong> product geometry, allowable stress and tolerance are owned by the bound canonical master package; this UI does not overwrite them.</div>' : ''}</div>`).join('')}
    ${calcNotice(snapshot)}
    <div class="hpwb-foot-actions"><span></span><button class="hpwb-button primary" data-hpwb-goto="static" type="button">Continue to Static Wall →</button></div>
  </section>`;
}

function staticPanel(snapshot) {
  const products = snapshot.project.products ?? [];
  return `<section class="hpwb-panel">
    <div class="hpwb-panel-heading"><div><h3>Static Wall</h3><p>Review canonical straight-pipe outputs and the selected wall state for each class product.</p></div><div class="hpwb-code-chip">STRAIGHT_PRESSURE</div></div>
    ${calcNotice(snapshot)}
    ${products.map((product) => {
      const row = productResult(snapshot, product.productId);
      const out = row?.calculations?.static?.outputs ?? {};
      const wall = row?.calculations?.wallState?.outputs ?? {};
      return `<div class="hpwb-card"><div class="hpwb-section-toolbar"><h4>${esc(product.productId || 'Unidentified product')}</h4><span class="hpwb-badge ${row?.assessment?.staticPass === true ? 'good' : row?.assessment?.staticPass === false ? 'warn' : 'blocked'}">${row?.assessment?.staticPass === true ? 'STATIC PASS' : row?.assessment?.staticPass === false ? 'STATIC FAIL' : 'NOT RUN'}</span></div>
        <div class="hpwb-metrics">
          <div class="hpwb-metric"><span>Pressure wall</span><strong>${fmt(out.pressureDesignThicknessMm)} mm</strong><small>CORE output</small></div>
          <div class="hpwb-metric"><span>Required minimum</span><strong>${fmt(out.requiredMinimumThicknessMm)} mm</strong><small>with allowances</small></div>
          <div class="hpwb-metric"><span>Required nominal</span><strong>${fmt(out.requiredNominalThicknessMm)} mm</strong><small>with tolerance</small></div>
          <div class="hpwb-metric"><span>As-manufactured min</span><strong>${fmt(out.minimumAsManufacturedThicknessMm)} mm</strong><small>provided product</small></div>
          <div class="hpwb-metric"><span>Pressure rating</span><strong>${fmt(out.pressureRatingMpa)} MPa</strong><small>review reference</small></div>
        </div>
        <div class="hpwb-grid">
          <div class="hpwb-notice"><strong>Net EOL wall:</strong> ${fmt(wall.endOfLifeEffectiveWallMm ?? out.effectiveNetWallMm, 5)} mm</div>
          <div class="hpwb-notice"><strong>Projected EOL wall:</strong> ${fmt(wall.projectedEndOfLifeWallMm, 5)} mm</div>
          <div class="hpwb-notice"><strong>Selected fatigue wall:</strong> ${fmt(row?.selectedFatigueWallMm, 5)} mm</div>
          <div class="hpwb-notice"><strong>Engineering state:</strong> ${esc(row?.engineeringState || 'Not calculated')}</div>
          <div class="hpwb-notice"><strong>Basis mode:</strong> ${esc(row?.basisMode || product.calculationBasis?.mode || '—')}</div>
          <div class="hpwb-notice"><strong>Design authority:</strong> FALSE</div>
        </div>
      </div>`;
    }).join('') || '<div class="hpwb-notice warn">No class products are defined.</div>'}
    <div class="hpwb-foot-actions"><button class="hpwb-button" data-hpwb-goto="design" type="button">← Design Basis</button><button class="hpwb-button primary" data-hpwb-goto="cycles" type="button">Continue to Pressure Cycles →</button></div>
  </section>`;
}

function cyclesPanel(snapshot, cycleProductId) {
  const project = snapshot.project;
  const states = project.transient?.states ?? [];
  const transitions = project.transient?.transitions ?? [];
  const selectedProduct = project.products?.find((row) => row.productId === cycleProductId) ?? project.products?.[0];
  const fatigueRows = productResult(snapshot, selectedProduct?.productId)?.calculations?.fatigue?.outputs?.cycles ?? [];
  const byCycle = new Map(fatigueRows.map((row) => [row.cycleId, row]));
  return `<section class="hpwb-panel">
    <div class="hpwb-panel-heading"><div><h3>Pressure Cycles</h3><p>Define explicit operating states and governed lifetime transitions. CORE derives pressure range and Salt from these states for the selected product.</p></div><div class="hpwb-code-chip">TRANSIENT SPECTRUM</div></div>
    <div class="hpwb-card"><div class="hpwb-grid">
      ${field('Spectrum ID', 'transient.spectrum.spectrumId', project.transient?.spectrum?.spectrumId)}
      ${field('Design life (years)', 'transient.spectrum.designLifeYears', project.transient?.spectrum?.designLifeYears, { type: 'number' })}
      <label class="hpwb-field"><span>Display CORE Salt for product</span><select data-hpwb-cycle-product>${(project.products ?? []).map((row) => `<option value="${attr(row.productId)}" ${row.productId === selectedProduct?.productId ? 'selected' : ''}>${esc(row.productId || 'Unidentified')}</option>`).join('')}</select></label>
    </div></div>
    <div class="hpwb-section-toolbar"><h4>Operating states</h4><button class="hpwb-button" data-hpwb-action="add-state" type="button">+ Add state</button></div>
    <div class="hpwb-table-wrap"><table class="hpwb-table"><thead><tr><th>State</th><th>Pressure MPa</th><th>Material T °C</th><th>Structural T °C</th><th></th></tr></thead><tbody>${states.map((state, index) => `<tr><td><input data-hpwb-bind="transient.states.${index}.stateId" data-hpwb-type="text" value="${attr(state.stateId)}"></td><td><input type="number" step="any" data-hpwb-bind="transient.states.${index}.pressureMpa" data-hpwb-type="number" value="${attr(numValue(state.pressureMpa))}"></td><td><input type="number" step="any" data-hpwb-bind="transient.states.${index}.materialTemperatureC" data-hpwb-type="number" value="${attr(numValue(state.materialTemperatureC))}"></td><td><input type="number" step="any" data-hpwb-bind="transient.states.${index}.structuralTemperatureC" data-hpwb-type="number" value="${attr(numValue(state.structuralTemperatureC))}"></td><td><button class="hpwb-button danger" data-hpwb-action="remove-state" data-index="${index}" type="button">Remove</button></td></tr>`).join('') || '<tr><td colspan="5">No states defined.</td></tr>'}</tbody></table></div>
    <div class="hpwb-section-toolbar"><h4>Governed transitions</h4><button class="hpwb-button" data-hpwb-action="add-transition" type="button">+ Add cycle</button></div>
    <div class="hpwb-table-wrap"><table class="hpwb-table"><thead><tr><th>Cycle</th><th>From</th><th>To</th><th>Lifetime n</th><th>Category</th><th>CORE ΔP MPa</th><th>CORE Salt MPa</th><th></th></tr></thead><tbody>${transitions.map((row, index) => { const calc = byCycle.get(row.cycleId); return `<tr><td><input data-hpwb-bind="transient.transitions.${index}.cycleId" data-hpwb-type="text" value="${attr(row.cycleId)}"></td><td><input data-hpwb-bind="transient.transitions.${index}.fromStateId" data-hpwb-type="text" value="${attr(row.fromStateId)}"></td><td><input data-hpwb-bind="transient.transitions.${index}.toStateId" data-hpwb-type="text" value="${attr(row.toStateId)}"></td><td><input type="number" step="any" data-hpwb-bind="transient.transitions.${index}.totalCycles" data-hpwb-type="number" value="${attr(numValue(row.totalCycles))}"></td><td><input data-hpwb-bind="transient.transitions.${index}.category" data-hpwb-type="text" value="${attr(row.category)}"></td><td>${fmt(calc?.pressureRangeMpa)}</td><td><strong>${fmt(calc?.coreSaltMpa, 6)}</strong></td><td><button class="hpwb-button danger" data-hpwb-action="remove-transition" data-index="${index}" type="button">Remove</button></td></tr>`; }).join('') || '<tr><td colspan="8">No transitions defined.</td></tr>'}</tbody></table></div>
    ${calcNotice(snapshot)}
    <div class="hpwb-foot-actions"><button class="hpwb-button" data-hpwb-goto="static" type="button">← Static Wall</button><button class="hpwb-button primary" data-hpwb-goto="kd" type="button">Continue to KD Review →</button></div>
  </section>`;
}

function kdPanel(snapshot) {
  const project = snapshot.project;
  const evidence = project.fatigueEvidence ?? [];
  const unusedProducts = (project.products ?? []).filter((product) => product.productId && !evidence.some((pkg) => pkg.productId === product.productId));
  return `<section class="hpwb-panel">
    <div class="hpwb-panel-heading"><div><h3>KD Review</h3><p>Use the qualified product route: CORE pressure-cycle mechanics and Miner bookkeeping with externally calculated and checked KD-3 Seq / N.</p></div><div class="hpwb-code-chip">USER_CALCULATED_KD3</div></div>
    <div class="hpwb-notice warn"><strong>Native CORE KD320 remains blocked.</strong> This screen does not calculate mean-stress correction or fatigue-curve life. Seq and permissible cycles N retain external calculation custody.</div>
    <div class="hpwb-chain"><span class="hpwb-chain-node core">CORE pressure states</span><span class="hpwb-chain-arrow">→</span><span class="hpwb-chain-node core">CORE Salt</span><span class="hpwb-chain-arrow">→</span><span class="hpwb-chain-node external">External Seq</span><span class="hpwb-chain-arrow">→</span><span class="hpwb-chain-node external">External N</span><span class="hpwb-chain-arrow">→</span><span class="hpwb-chain-node core">CORE Σ n/N</span></div>
    ${unusedProducts.length ? `<div class="hpwb-section-toolbar"><span class="hpwb-status">Products without KD-3 evidence: ${unusedProducts.length}</span><div class="hpwb-actions">${unusedProducts.map((product) => `<button class="hpwb-button" data-hpwb-action="add-evidence" data-product-id="${attr(product.productId)}" type="button">Attach ${esc(product.productId)}</button>`).join('')}</div></div>` : ''}
    ${evidence.map((pkg, evidenceIndex) => {
      const result = productResult(snapshot, pkg.productId)?.calculations?.fatigue;
      const derivedByCycle = new Map((result?.outputs?.cycles ?? []).map((row) => [row.cycleId, row]));
      return `<div class="hpwb-card"><div class="hpwb-section-toolbar"><div><h4>${esc(pkg.productId)} · external KD-3 evidence</h4><p>${pkg.externalResults?.length ?? 0} governed result row(s)</p></div><div class="hpwb-actions"><button class="hpwb-button" data-hpwb-action="add-external-result" data-evidence-index="${evidenceIndex}" type="button">+ Add uncovered cycle</button><button class="hpwb-button danger" data-hpwb-action="remove-evidence" data-evidence-index="${evidenceIndex}" type="button">Remove package</button></div></div>
      ${(pkg.externalResults ?? []).map((row, resultIndex) => {
        const derived = derivedByCycle.get(row.cycleId);
        const basis = row.calculationBasis ?? {};
        return `<div class="hpwb-card"><div class="hpwb-grid">
          ${field('Cycle ID', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.cycleId`, row.cycleId)}
          ${field('From state', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.fromStateId`, row.fromStateId)}
          ${field('To state', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.toStateId`, row.toStateId)}
          ${field('Location', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.locationId`, row.locationId)}
          ${field('User Salt cross-check (MPa)', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.userAlternatingStressIntensityMpa`, row.userAlternatingStressIntensityMpa, { type: 'number' })}
          ${field('External Seq (MPa)', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.equivalentAlternatingStressMpa`, row.equivalentAlternatingStressMpa, { type: 'number' })}
          ${field('External N', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.permissibleCycles`, row.permissibleCycles, { type: 'number' })}
          ${field('Code', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.code`, basis.code)}
          ${field('Edition', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.edition`, basis.edition)}
          ${field('Method / clause', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.methodRef`, basis.methodRef)}
          ${field('External calculation ref', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.calculationRef`, basis.calculationRef)}
          ${field('Calculated by', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.calculatedBy`, basis.calculatedBy)}
          ${field('Checked by', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.checkedBy`, basis.checkedBy)}
          ${field('Checked at', `fatigueEvidence.${evidenceIndex}.externalResults.${resultIndex}.calculationBasis.checkedAt`, basis.checkedAt)}
        </div><div class="hpwb-metrics">
          <div class="hpwb-metric"><span>CORE Salt</span><strong>${fmt(derived?.coreSaltMpa, 6)} MPa</strong><small>${esc(derived?.saltCrossCheckStatus || 'not run')}</small></div>
          <div class="hpwb-metric"><span>External Seq</span><strong>${fmt(derived?.equivalentAlternatingStressMpa ?? row.equivalentAlternatingStressMpa)} MPa</strong><small>user supplied</small></div>
          <div class="hpwb-metric"><span>External N</span><strong>${Number.isFinite(derived?.permissibleCycles ?? row.permissibleCycles) ? Number(derived?.permissibleCycles ?? row.permissibleCycles).toLocaleString() : '—'}</strong><small>user supplied</small></div>
          <div class="hpwb-metric"><span>Applied n</span><strong>${Number.isFinite(derived?.appliedCycles) ? derived.appliedCycles.toLocaleString() : '—'}</strong><small>governed spectrum</small></div>
          <div class="hpwb-metric"><span>Ui = n/N</span><strong>${fmt(derived?.usage, 6)}</strong><small>CORE derived</small></div>
        </div><div class="hpwb-section-toolbar"><span class="hpwb-status">${esc(derived?.evidence?.status || 'Calculation not run')}</span><button class="hpwb-button danger" data-hpwb-action="remove-external-result" data-evidence-index="${evidenceIndex}" data-result-index="${resultIndex}" type="button">Remove row</button></div></div>`;
      }).join('') || '<div class="hpwb-notice warn">No external result rows. Add an uncovered governed cycle.</div>'}
      </div>`;
    }).join('') || '<div class="hpwb-notice warn"><strong>No external KD-3 package attached.</strong> Attach evidence to a class product to evaluate pressure-cycle fatigue.</div>'}
    ${calcNotice(snapshot)}
    <div class="hpwb-foot-actions"><button class="hpwb-button" data-hpwb-goto="cycles" type="button">← Pressure Cycles</button><button class="hpwb-button primary" data-hpwb-goto="envelope" type="button">Continue to Review Envelope →</button></div>
  </section>`;
}

function envelopePanel(snapshot) {
  const result = snapshot.calculation;
  const summary = result?.summary ?? {};
  return `<section class="hpwb-panel">
    <div class="hpwb-panel-heading"><div><h3>Review Envelope</h3><p>One class-level view of static status, pressure-cycle fatigue usage, evidence custody and qualification boundary.</p></div><div class="hpwb-code-chip">NO DESIGN RELEASE</div></div>
    ${calcNotice(snapshot)}
    <div class="hpwb-metrics">
      <div class="hpwb-metric"><span>Products</span><strong>${summary.totalProducts ?? snapshot.project.products?.length ?? 0}</strong><small>class rows</small></div>
      <div class="hpwb-metric"><span>Static passed</span><strong>${summary.staticReferencePassed ?? '—'}</strong><small>software regression</small></div>
      <div class="hpwb-metric"><span>Fatigue evaluated</span><strong>${summary.fatigueEvaluated ?? '—'}</strong><small>external KD-3 intake</small></div>
      <div class="hpwb-metric"><span>Within U ≤ 1</span><strong>${summary.fatigueWithinUnity ?? '—'}</strong><small>review criterion</small></div>
      <div class="hpwb-metric"><span>Design authority</span><strong>FALSE</strong><small>qualification boundary</small></div>
    </div>
    ${(result?.products ?? []).map((row) => `<div class="hpwb-card"><div class="hpwb-section-toolbar"><h4>${esc(row.productId)}</h4><span class="hpwb-badge ${row.calculationOk ? 'good' : 'blocked'}">${esc(row.engineeringState)}</span></div><div class="hpwb-grid">
      <div class="hpwb-notice"><strong>Static:</strong> ${row.assessment?.staticPass === true ? 'PASS' : row.assessment?.staticPass === false ? 'FAIL' : 'Not evaluated'}</div>
      <div class="hpwb-notice"><strong>Fatigue wall:</strong> ${fmt(row.selectedFatigueWallMm, 5)} mm</div>
      <div class="hpwb-notice"><strong>Cumulative U:</strong> ${fmt(row.assessment?.cumulativeUsage, 6)}</div>
      <div class="hpwb-notice"><strong>Basis:</strong> ${esc(row.basisMode)}</div>
      <div class="hpwb-notice"><strong>KD-3:</strong> ${row.assessment?.fatigueEvaluated ? 'EXTERNAL USER_CALCULATED' : 'NOT SUPPLIED'}</div>
      <div class="hpwb-notice"><strong>Authority:</strong> REVIEW ONLY</div>
    </div></div>`).join('') || '<div class="hpwb-notice warn">Run a review calculation to populate the class envelope.</div>'}
    <div class="hpwb-notice warn"><strong>Qualification boundary:</strong> Native CORE KD320 is NOT QUALIFIED. Overall Code compliance and design authority are not established by this workspace.</div>
    <div class="hpwb-foot-actions"><button class="hpwb-button" data-hpwb-goto="kd" type="button">← KD Review</button><button class="hpwb-button primary" data-hpwb-action="calculate" type="button">Refresh review calculation</button></div>
  </section>`;
}

function stepPanel(stepId, snapshot, view) {
  if (stepId === 'design') return designPanel(snapshot);
  if (stepId === 'static') return staticPanel(snapshot);
  if (stepId === 'cycles') return cyclesPanel(snapshot, view.cycleProductId);
  if (stepId === 'kd') return kdPanel(snapshot);
  return envelopePanel(snapshot);
}

function workflowStatus(step, snapshot) {
  if (step.id === 'design') return snapshot.validation?.ok ? 'Ready' : `${snapshot.validation?.issues?.length ?? 0} open`;
  if (step.id === 'static') {
    if (!snapshot.calculation) return 'Pending';
    const rows = snapshot.calculation.products ?? [];
    return rows.length && rows.every((row) => row.assessment?.staticPass === true) ? 'Pass' : 'Review';
  }
  if (step.id === 'cycles') {
    const count = snapshot.project.transient?.transitions?.length ?? 0;
    return count ? `${count} cycle${count === 1 ? '' : 's'}` : 'Pending';
  }
  if (step.id === 'kd') return snapshot.project.fatigueEvidence?.length ? 'External' : 'Pending';
  return snapshot.calculation?.ok ? 'Review only' : 'Blocked';
}

function downloadProject(project) {
  const blob = new Blob([serializeHpPipingClassWorkspaceProject(project)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const classId = String(project.metadata?.classId || 'hp-piping-class').replace(/[^a-z0-9_-]+/gi, '-');
  const revision = String(project.metadata?.revision || 'draft').replace(/[^a-z0-9_-]+/gi, '-');
  link.download = `${classId}-${revision}.hp-piping-class.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function renderHpPipingClassWorkbenchTab(container, { context = null } = {}) {
  ensureStyles();
  const controller = createHpPipingClassWorkspaceController({ initialProject: context?.hpPipingClassProject ?? null });
  const referenceSamples = getHpPipingClassReferenceSamples();
  let activeStep = initialStep(context);
  let cycleProductId = null;
  let statusMessage = 'Ready';

  if (!context?.hpPipingClassProject && isUninitialized(controller.getSnapshot().project)) {
    controller.replaceProject(createHpPipingClassReferenceProject(HP_PIPING_CLASS_NPS4_REFERENCE_ID), { reason: 'REFERENCE_SAMPLE_AUTO_LOADED' });
    controller.calculate({ includeEvidence: true });
    statusMessage = 'Baseline pressure-fatigue reference auto-loaded and calculated';
  }

  container.innerHTML = `<div class="hpwb" data-hp-piping-class-workbench="true" data-project-schema="${HP_PIPING_CLASS_PROJECT_VERSION}">
    <div class="hpwb-hero"><div><p class="hpwb-eyebrow">Engineering qualification workspace</p><h2>High Pressure Piping Class Standardization</h2><p>Native B31.3 Chapter IX class workflow using the canonical v2 project model and central calculation APIs. Reference examples execute the same path as regression tests.</p></div><div class="hpwb-scope"><span>Scope boundary</span><strong>Piping-class pressure and fatigue review</strong><small>No routed-system fatigue, local FEA, native KD320 qualification, Code-compliance declaration, or design-authority release.</small></div></div>
    <div class="hpwb-toolbar"><div class="hpwb-actions"><select class="hpwb-inline-select" data-hpwb-reference-select aria-label="Reference example">${referenceSamples.map((sample) => `<option value="${attr(sample.id)}">${esc(sample.label)}</option>`).join('')}</select><button class="hpwb-button primary" data-hpwb-action="load-sample" type="button">Load example</button><button class="hpwb-button" data-hpwb-action="calculate" type="button">Run review calculation</button><button class="hpwb-button quiet" data-hpwb-action="new-project" type="button">New blank class</button><button class="hpwb-button quiet" data-hpwb-action="export-project" type="button">Export JSON</button><button class="hpwb-button quiet" data-hpwb-action="import-project" type="button">Import JSON</button><input class="hpwb-hidden" data-hpwb-file type="file" accept="application/json,.json"></div><div class="hpwb-badges"><span class="hpwb-badge info">${esc(HP_PIPING_CLASS_AUTHORITY_POLICY.calculationMode)}</span><span class="hpwb-badge blocked">CORE KD-3 · NOT QUALIFIED</span><span class="hpwb-badge blocked">DESIGN AUTHORITY · FALSE</span></div></div>
    <div class="hpwb-workflow" data-hpwb-workflow></div>
    <div data-hpwb-panel></div>
    <div class="hpwb-toolbar" style="margin-top:12px"><span class="hpwb-status" data-hpwb-status></span><span class="hpwb-status">Reference catalog: ${referenceSamples.length} executable examples</span></div>
  </div>`;

  const panel = container.querySelector('[data-hpwb-panel]');
  const workflow = container.querySelector('[data-hpwb-workflow]');
  const status = container.querySelector('[data-hpwb-status]');
  const fileInput = container.querySelector('[data-hpwb-file]');
  const referenceSelect = container.querySelector('[data-hpwb-reference-select]');

  function snapshot() {
    return controller.getSnapshot();
  }

  function normalizeView() {
    const products = snapshot().project.products ?? [];
    if (!products.some((row) => row.productId === cycleProductId)) cycleProductId = products[0]?.productId ?? null;
  }

  function renderWorkflow() {
    const current = snapshot();
    workflow.innerHTML = STEPS.map((step) => `<button class="hpwb-step ${step.id === activeStep ? 'active' : ''}" data-hpwb-goto="${step.id}" type="button"><span class="hpwb-step-number">${step.number}</span><span><strong>${esc(step.label)}</strong><small>${esc(step.caption)} · ${esc(workflowStatus(step, current))}</small></span></button>`).join('');
  }

  function render(step = activeStep) {
    activeStep = STEP_IDS.has(step) ? step : 'design';
    normalizeView();
    try { localStorage.setItem(STEP_STORAGE_KEY, activeStep); } catch {}
    renderWorkflow();
    panel.innerHTML = stepPanel(activeStep, snapshot(), { cycleProductId });
    const current = snapshot();
    const referenceId = getHpPipingClassReferenceProjectId(current.project);
    const reference = getHpPipingClassReferenceSample(referenceId);
    if (referenceId && referenceSelect) referenceSelect.value = referenceId;
    status.textContent = `${current.project.metadata?.classId || 'UNINITIALIZED'} · revision ${current.project.metadata?.revision || '—'} · ${statusMessage}${reference ? ` · ${reference.shortLabel}` : ''}`;
  }

  function mutate(mutator, { rerender = false } = {}) {
    controller.mutateProject(mutator);
    statusMessage = 'Draft saved · calculation cleared';
    normalizeView();
    if (rerender) render();
    else {
      renderWorkflow();
      const current = snapshot();
      status.textContent = `${current.project.metadata?.classId || 'UNINITIALIZED'} · ${statusMessage}`;
    }
  }

  function structural(action, target) {
    if (action === 'add-product') mutate((draft) => {
      draft.products ??= [];
      draft.products.push({ productId: '', calculationBasis: { mode: 'DIRECT_ENGINEERING_INPUT' }, wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' } });
    }, { rerender: true });
    if (action === 'remove-product') mutate((draft) => cascadeRemoveHpPipingClassProduct(draft, Number(target.dataset.index)), { rerender: true });
    if (action === 'add-state') mutate((draft) => {
      draft.transient ??= { spectrum: { spectrumId: '' }, states: [], transitions: [] };
      draft.transient.states ??= [];
      draft.transient.states.push({ spectrumId: draft.transient.spectrum?.spectrumId || '' });
    }, { rerender: true });
    if (action === 'remove-state') mutate((draft) => cascadeRemoveHpPipingClassState(draft, Number(target.dataset.index)), { rerender: true });
    if (action === 'add-transition') mutate((draft) => {
      draft.transient ??= { spectrum: { spectrumId: '' }, states: [], transitions: [] };
      draft.transient.transitions ??= [];
      draft.transient.transitions.push({ spectrumId: draft.transient.spectrum?.spectrumId || '' });
    }, { rerender: true });
    if (action === 'remove-transition') mutate((draft) => cascadeRemoveHpPipingClassTransition(draft, Number(target.dataset.index)), { rerender: true });
    if (action === 'add-evidence') mutate((draft) => {
      const productId = String(target.dataset.productId || '');
      if (!productId) return;
      draft.fatigueEvidence ??= [];
      if (!draft.fatigueEvidence.some((row) => row.productId === productId)) draft.fatigueEvidence.push({ productId, externalResults: [] });
    }, { rerender: true });
    if (action === 'remove-evidence') mutate((draft) => {
      draft.fatigueEvidence.splice(Number(target.dataset.evidenceIndex), 1);
    }, { rerender: true });
    if (action === 'add-external-result') {
      const evidenceIndex = Number(target.dataset.evidenceIndex);
      const shell = createHpPipingClassExternalResultShell(snapshot().project, evidenceIndex);
      if (!shell) {
        statusMessage = 'No uncovered governed cycle is available for this evidence package';
        render('kd');
        return;
      }
      mutate((draft) => {
        draft.fatigueEvidence[evidenceIndex].externalResults ??= [];
        draft.fatigueEvidence[evidenceIndex].externalResults.push(shell);
      }, { rerender: true });
    }
    if (action === 'remove-external-result') mutate((draft) => {
      draft.fatigueEvidence[Number(target.dataset.evidenceIndex)].externalResults.splice(Number(target.dataset.resultIndex), 1);
    }, { rerender: true });
  }

  async function importProject(file) {
    try {
      const parsed = parseHpPipingClassWorkspaceProject(await file.text());
      controller.replaceProject(parsed, { reason: 'PROJECT_IMPORTED' });
      cycleProductId = null;
      statusMessage = 'Project imported · calculation required';
      render('design');
    } catch (error) {
      statusMessage = `Import blocked: ${error.message}`;
      render();
    }
  }

  function onInput(event) {
    const element = event.target.closest('[data-hpwb-bind]');
    if (!element) return;
    const value = inputValue(element);
    mutate((draft) => applyHpPipingClassRelationalEdit(draft, element.dataset.hpwbBind, value));
  }

  function onClick(event) {
    const goto = event.target.closest('[data-hpwb-goto]');
    if (goto) { render(goto.dataset.hpwbGoto); return; }
    const target = event.target.closest('[data-hpwb-action]');
    if (!target) return;
    const action = target.dataset.hpwbAction;
    if (['add-product','remove-product','add-state','remove-state','add-transition','remove-transition','add-evidence','remove-evidence','add-external-result','remove-external-result'].includes(action)) {
      structural(action, target);
      return;
    }
    if (action === 'load-sample') {
      const referenceId = referenceSelect?.value || HP_PIPING_CLASS_NPS4_REFERENCE_ID;
      controller.replaceProject(createHpPipingClassReferenceProject(referenceId), { reason: 'REFERENCE_SAMPLE_LOADED' });
      cycleProductId = null;
      const result = controller.calculate({ includeEvidence: true });
      const definition = getHpPipingClassReferenceSample(referenceId);
      statusMessage = result.ok ? `${definition?.shortLabel || 'Reference'} loaded · calculation complete` : `${definition?.shortLabel || 'Reference'} loaded · calculation blocked`;
      render('design');
      return;
    }
    if (action === 'new-project') {
      controller.replaceProject({
        metadata: { projectId: '', classId: '', revision: 'A' },
        methodManifest: { b313Edition: '2024', viii3Edition: '2025', calculationMode: 'USER_CALCULATED_KD3' },
        classBasis: {}, products: [], transient: { spectrum: null, states: [], transitions: [] }, fatigueEvidence: [],
      }, { reason: 'NEW_BLANK_PROJECT' });
      cycleProductId = null;
      statusMessage = 'New blank class created';
      render('design');
      return;
    }
    if (action === 'calculate') {
      const result = controller.calculate({ includeEvidence: true });
      statusMessage = result.ok ? `${result.projectState} · REVIEW ONLY` : `${result.projectState || 'CALCULATION_BLOCKED'} · REVIEW ONLY`;
      render();
      return;
    }
    if (action === 'export-project') { downloadProject(snapshot().project); return; }
    if (action === 'import-project') { fileInput?.click(); }
  }

  function onChange(event) {
    if (event.target.matches('[data-hpwb-cycle-product]')) {
      cycleProductId = event.target.value;
      render('cycles');
      return;
    }
    if (event.target === fileInput && fileInput.files?.[0]) {
      importProject(fileInput.files[0]).finally(() => { fileInput.value = ''; });
    }
  }

  container.addEventListener('input', onInput);
  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  render(activeStep);

  return () => {
    container.removeEventListener('input', onInput);
    container.removeEventListener('click', onClick);
    container.removeEventListener('change', onChange);
    container.innerHTML = '';
  };
}

export { STEPS as HP_PIPING_CLASS_WORKBENCH_STEPS };
