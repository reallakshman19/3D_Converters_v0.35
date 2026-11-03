import {
  EMPIRICAL_WEIGHT_MODEL,
  evaluateEmpiricalWeightSandbox,
  listEmpiricalWeightSandboxOptions,
} from '../converters/empirical-weight/index.js';
import {
  cloneEmpiricalWeightModel,
  createEmpiricalWeightTuningSession,
  validateEmpiricalWeightTuningModel,
} from '../converters/empirical-weight/empirical-weight-tuning.js';

const DRAFT_KEY = 'format-converters.empirical-weight-tuning-draft.v1';

function ensureStylesheet() {
  if (document.querySelector('link[data-engineering-masters-style="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/engineering-masters.css?v=engineering-2';
  link.dataset.engineeringMastersStyle = 'true';
  document.head.appendChild(link);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function saveText(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(2)}%` : '—';
}

function familyOptions(model) {
  const set = new Set((model.approach1?.models || []).map((row) => row.typeDesc));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function stackRows(model, target) {
  return Object.entries(model.approach2?.stackWeights?.[target] || {})
    .map(([typeDesc, weights]) => ({ typeDesc, weights }));
}

function a1Rows(model, target, typeDesc) {
  return (model.approach1?.models || [])
    .filter((row) => (!target || row.target === target) && (!typeDesc || row.typeDesc === typeDesc));
}

function fmtKg(result) {
  return result?.ok && Number.isFinite(result.weightKg) ? result.weightKg.toFixed(3) : '—';
}

function statusText(result) {
  if (result?.ok) return `${result.approach || 'OK'}${result.confidence ? ` · ${result.confidence}` : ''}`;
  return result?.code || 'UNAVAILABLE';
}

function deltaText(delta) {
  if (!delta) return '—';
  const pctText = delta.pct == null ? '' : ` (${(delta.pct * 100).toFixed(2)}%)`;
  return `${delta.kg >= 0 ? '+' : ''}${delta.kg.toFixed(3)}${pctText}`;
}

export function renderEmpiricalWeightTuningTab(container, { context = null, emit } = {}) {
  ensureStylesheet();
  const stored = loadDraft();
  const active = EMPIRICAL_WEIGHT_MODEL;
  let session = createEmpiricalWeightTuningSession(active);
  if (stored?.model) session.replace(stored.model);

  let view = 'overview';
  let target = context?.target || 'RF/RTJ KG';
  let family = context?.typeDesc || 'Flanged Gate Valve';
  let sandboxRating = Number(context?.rating ?? 300);
  let sandboxNs = Number(context?.ns ?? 4);

  const candidate = () => session.snapshot();
  const validation = () => session.validation();
  const activeValidation = () => validateEmpiricalWeightTuningModel(active);
  const replaceModel = (model) => session.replace(model);

  function sandboxOptions() {
    let options = listEmpiricalWeightSandboxOptions({
      model: candidate(),
      target,
      typeDesc: family,
      rating: sandboxRating,
    });
    target = options.selected.target;
    family = options.selected.typeDesc;
    sandboxRating = options.selected.rating;
    options = listEmpiricalWeightSandboxOptions({
      model: candidate(),
      target,
      typeDesc: family,
      rating: sandboxRating,
    });
    if (!options.sizes.includes(Number(sandboxNs))) sandboxNs = options.sizes[0] ?? null;
    return options;
  }

  function sandboxResult() {
    return evaluateEmpiricalWeightSandbox({
      input: { target, typeDesc: family, rating: sandboxRating, ns: sandboxNs },
      activeModel: active,
      candidateModel: candidate(),
    });
  }

  function navHtml() {
    return [
      ['overview', 'Overview'],
      ['approach1', 'Approach 1'],
      ['approach2', 'Approach 2'],
      ['sandbox', 'Sandbox'],
      ['validation', 'Validation'],
    ].map(([id, label]) =>
      `<button class="engineering-master-nav-btn ${view === id ? 'is-active' : ''}" data-view="${id}">${esc(label)}</button>`
    ).join('');
  }

  function metricsHtml(model) {
    const a1 = model.approach1?.validation || {};
    const a2 = model.approach2?.validation || {};
    return `<div class="engineering-master-grid">
      <div class="engineering-master-card"><h3>A1 RF/RTJ MAPE</h3><div class="engineering-master-metric">${pct(a1['RF/RTJ KG']?.mape)}</div></div>
      <div class="engineering-master-card"><h3>A2 RF/RTJ MAPE</h3><div class="engineering-master-metric">${pct(a2['RF/RTJ KG']?.mape)}</div></div>
      <div class="engineering-master-card"><h3>A1 BW MAPE</h3><div class="engineering-master-metric">${pct(a1['BW KG']?.mape)}</div></div>
      <div class="engineering-master-card"><h3>A2 BW MAPE</h3><div class="engineering-master-metric">${pct(a2['BW KG']?.mape)}</div></div>
    </div>`;
  }

  function overviewHtml() {
    const v = validation();
    const model = candidate();
    return `${metricsHtml(model)}
      <div class="engineering-master-grid">
        <div class="engineering-master-card"><h3>Approach 1 rows</h3><div class="engineering-master-metric">${model.approach1?.models?.length || 0}</div></div>
        <div class="engineering-master-card"><h3>Stack rows</h3><div class="engineering-master-metric">${v.stats.approach2StackRows || 0}</div></div>
        <div class="engineering-master-card"><h3>Tunable constants</h3><div class="engineering-master-metric">${v.stats.approach2Constants || 0}</div></div>
        <div class="engineering-master-card"><h3>Candidate validation</h3><div class="engineering-master-metric">${v.ok ? 'PASS' : 'BLOCKED'}</div><div class="engineering-master-muted">${v.errors.length} errors · ${v.warnings.length} warnings</div></div>
      </div>
      <div class="engineering-master-banner warn">Published validation metrics belong to the frozen active model. Use Sandbox for point inspection; run the full benchmark suite before publishing a tuned model.</div>`;
  }

  function approach2Html() {
    const model = candidate();
    const rows = stackRows(model, target);
    return `<div class="engineering-master-banner warn">Edit candidate constants and stack weights. Production exports continue using the frozen active model until a reviewed model file is published.</div>
      <h3>Constants</h3>
      <div class="engineering-master-table-wrap"><table class="engineering-master-table"><thead><tr><th>Constant</th><th>Value</th></tr></thead><tbody>
      ${Object.entries(model.approach2?.constants || {}).map(([name, value]) => `<tr><td>${esc(name)}</td><td><input class="engineering-master-input" type="number" step="any" data-constant="${esc(name)}" value="${esc(value)}"></td></tr>`).join('')}
      </tbody></table></div>
      <h3>Stack weights · ${esc(target)}</h3>
      <div class="engineering-master-table-wrap"><table class="engineering-master-table"><thead><tr><th>Family</th><th>A1 prior</th><th>Collaborative ratio</th><th>Cross-ratio matrix</th><th>Sum</th></tr></thead><tbody>
      ${rows.map(({ typeDesc, weights }) => `<tr><td>${esc(typeDesc)}</td>${weights.map((weight, index) => `<td><input class="engineering-master-input" type="number" min="0" max="1" step="0.01" data-stack-family="${esc(typeDesc)}" data-stack-index="${index}" value="${esc(weight)}"></td>`).join('')}<td>${weights.reduce((sum, value) => sum + Number(value), 0).toFixed(3)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function approach1Html() {
    const rows = a1Rows(candidate(), target, family);
    return `<div class="engineering-master-banner">Approach 1 coefficients are tunable in the candidate. Band/range boundaries remain visible and unchanged.</div>
      <div class="engineering-master-table-wrap"><table class="engineering-master-table"><thead><tr><th>Target</th><th>Family</th><th>Rating</th><th>Band</th><th>NS range</th><th>Model</th><th>a</th><th>b</th><th>c</th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td>${esc(row.target)}</td><td>${esc(row.typeDesc)}</td><td>${esc(row.rating)}</td><td>${esc(row.band)}</td><td>${esc(row.nsMin)}–${esc(row.nsMax)}</td><td>${esc(row.model)}</td>${['a', 'b', 'c'].map((key) => `<td><input class="engineering-master-input" type="number" step="any" data-a1-key="${key}" data-a1-target="${esc(row.target)}" data-a1-family="${esc(row.typeDesc)}" data-a1-rating="${esc(row.rating)}" data-a1-band="${esc(row.band)}" value="${row[key] == null ? '' : esc(row[key])}"></td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }

  function sandboxSummaryRows(result) {
    return [
      ['Exact master cell', 'exact'],
      ['Approach 1 · size-band equation', 'approach1'],
      ['Approach 2 · matrix stack', 'approach2'],
      ['Final API estimate', 'final'],
    ].map(([label, key]) => {
      const activeResult = result.active[key];
      const candidateResult = result.candidate[key];
      return `<tr>
        <td>${esc(label)}</td>
        <td>${fmtKg(activeResult)}</td>
        <td>${fmtKg(candidateResult)}</td>
        <td>${esc(deltaText(result.delta[key]))}</td>
        <td>${esc(statusText(activeResult))}</td>
        <td>${esc(statusText(candidateResult))}</td>
      </tr>`;
    }).join('');
  }

  function a2DetailHtml(label, result) {
    const a2 = result?.approach2;
    if (!a2?.ok) return `<div class="engineering-master-card"><h3>${esc(label)} A2 detail</h3><div class="engineering-master-banner warn">${esc(a2?.code || 'A2 unavailable')}</div></div>`;
    const predictions = a2.predictions || {};
    const weights = a2.weights || {};
    const configured = a2.configuredWeights || {};
    return `<div class="engineering-master-card"><h3>${esc(label)} A2 detail</h3>
      <table class="engineering-master-table"><thead><tr><th>Contributor</th><th>Prediction kg</th><th>Configured</th><th>Effective</th></tr></thead><tbody>
        <tr><td>A1 prior</td><td>${esc(predictions.band == null ? '—' : Number(predictions.band).toFixed(3))}</td><td>${esc(configured.band ?? '—')}</td><td>${esc(weights.band ?? '—')}</td></tr>
        <tr><td>Collaborative ratio</td><td>${esc(predictions.ratio == null ? '—' : Number(predictions.ratio).toFixed(3))}</td><td>${esc(configured.ratio ?? '—')}</td><td>${esc(weights.ratio ?? '—')}</td></tr>
        <tr><td>Cross-ratio matrix</td><td>${esc(predictions.cross == null ? '—' : Number(predictions.cross).toFixed(3))}</td><td>${esc(configured.cross ?? '—')}</td><td>${esc(weights.cross ?? '—')}</td></tr>
      </tbody></table>
      <div class="engineering-master-muted">Ratio anchors: ${esc(a2.support?.ratioAnchors ?? 0)} · Cross rectangles: ${esc(a2.support?.crossRectangles ?? 0)}</div>
    </div>`;
  }

  function sandboxHtml() {
    const options = sandboxOptions();
    const result = sandboxResult();
    return `<div class="engineering-master-banner">Sandbox runs the real production API paths against the built-in weight master. Candidate results are isolated and cannot change the active estimator.</div>
      <div class="engineering-master-card"><h3>Sandbox inputs</h3><div class="engineering-master-toolbar">
        <label>Target <select class="engineering-master-select" data-sandbox="target">${options.targets.map((value) => `<option value="${esc(value)}" ${value === target ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Type <select class="engineering-master-select" data-sandbox="family">${options.types.map((value) => `<option value="${esc(value)}" ${value === family ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Rating <select class="engineering-master-select" data-sandbox="rating">${options.ratings.map((value) => `<option value="${value}" ${Number(value) === Number(sandboxRating) ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label>Size NS <select class="engineering-master-select" data-sandbox="ns">${options.sizes.map((value) => `<option value="${value}" ${Number(value) === Number(sandboxNs) ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      </div></div>
      <h3>Arrived weights</h3>
      <div class="engineering-master-table-wrap"><table class="engineering-master-table"><thead><tr><th>Path</th><th>Active kg</th><th>Candidate kg</th><th>Candidate Δ</th><th>Active status</th><th>Candidate status</th></tr></thead><tbody>${sandboxSummaryRows(result)}</tbody></table></div>
      <div class="engineering-master-preview">${a2DetailHtml('Active', result.active)}${a2DetailHtml('Candidate', result.candidate)}</div>
      <details class="engineering-master-card"><summary>Raw Sandbox result</summary><pre class="engineering-master-json">${esc(JSON.stringify(result, null, 2))}</pre></details>`;
  }

  function validationHtml() {
    const v = validation();
    const issues = [...v.errors.map((item) => ({ ...item, bad: true })), ...v.warnings];
    return `<div class="engineering-master-grid">
      <div class="engineering-master-card"><h3>Errors</h3><div class="engineering-master-metric">${v.errors.length}</div></div>
      <div class="engineering-master-card"><h3>Warnings</h3><div class="engineering-master-metric">${v.warnings.length}</div></div>
      <div class="engineering-master-card"><h3>Active model structure</h3><div class="engineering-master-metric">${activeValidation().ok ? 'PASS' : 'FAIL'}</div></div>
    </div><div class="engineering-master-validation">${issues.map((item) => `<div class="engineering-master-issue ${item.bad ? 'bad' : ''}"><strong>${esc(item.path)}</strong><div>${esc(item.message)}</div></div>`).join('') || '<div class="engineering-master-banner">Candidate structure is valid. Run the full empirical benchmark suite before publication.</div>'}</div>`;
  }

  function panelHtml() {
    if (view === 'overview') return overviewHtml();
    if (view === 'approach1') return approach1Html();
    if (view === 'approach2') return approach2Html();
    if (view === 'sandbox') return sandboxHtml();
    return validationHtml();
  }

  function render() {
    const v = validation();
    if (view === 'sandbox') sandboxOptions();
    container.innerHTML = `<div class="engineering-master-root">
      <div class="engineering-master-header"><div><div class="engineering-master-title">Empirical Weight Tuning</div><div class="engineering-master-subtitle">Tune Approach 1 and the matrix-assisted Approach 2, then inspect Exact / A1 / A2 / final outputs in Sandbox before publication.</div></div>
      <div class="engineering-master-actions"><button class="engineering-master-btn" data-action="revert" ${session.isDirty() ? '' : 'disabled'}>Revert</button><button class="engineering-master-btn" data-action="save" ${session.isDirty() ? '' : 'disabled'}>Save Draft</button><button class="engineering-master-btn" data-action="export">Export Candidate</button><label class="engineering-master-btn">Import Candidate<input hidden type="file" accept=".json" data-action="import"></label></div></div>
      <div class="engineering-master-layout"><aside class="engineering-master-sidebar">${navHtml()}<div class="engineering-master-banner ${v.ok ? '' : 'bad'}">${session.isDirty() ? 'Candidate differs from active' : 'Candidate matches active'}<br>${v.errors.length} errors · ${v.warnings.length} warnings</div></aside>
      <main class="engineering-master-panel"><div class="engineering-master-toolbar"><label>Target <select class="engineering-master-select" data-filter="target"><option ${target === 'RF/RTJ KG' ? 'selected' : ''}>RF/RTJ KG</option><option ${target === 'BW KG' ? 'selected' : ''}>BW KG</option></select></label><label>Family <select class="engineering-master-select" data-filter="family">${familyOptions(candidate()).map((name) => `<option value="${esc(name)}" ${name === family ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label></div>${panelHtml()}</main></div></div>`;
    bind();
  }

  function bind() {
    container.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { view = button.dataset.view; render(); }));
    container.querySelector('[data-filter="target"]')?.addEventListener('change', (event) => { target = event.target.value; render(); });
    container.querySelector('[data-filter="family"]')?.addEventListener('change', (event) => { family = event.target.value; render(); });
    container.querySelectorAll('[data-constant]').forEach((input) => input.addEventListener('change', () => { session.updateConstant(input.dataset.constant, input.value); render(); }));
    container.querySelectorAll('[data-stack-family]').forEach((input) => input.addEventListener('change', () => {
      const model = candidate();
      const weights = [...(model.approach2.stackWeights[target][input.dataset.stackFamily] || [])];
      weights[Number(input.dataset.stackIndex)] = Number(input.value);
      session.updateStackWeights(target, input.dataset.stackFamily, weights);
      render();
    }));
    container.querySelectorAll('[data-a1-key]').forEach((input) => input.addEventListener('change', () => {
      session.updateA1Coefficient({ target: input.dataset.a1Target, typeDesc: input.dataset.a1Family, rating: Number(input.dataset.a1Rating), band: Number(input.dataset.a1Band) }, input.dataset.a1Key, input.value);
      render();
    }));
    container.querySelector('[data-sandbox="target"]')?.addEventListener('change', (event) => { target = event.target.value; render(); });
    container.querySelector('[data-sandbox="family"]')?.addEventListener('change', (event) => { family = event.target.value; render(); });
    container.querySelector('[data-sandbox="rating"]')?.addEventListener('change', (event) => { sandboxRating = Number(event.target.value); sandboxNs = null; render(); });
    container.querySelector('[data-sandbox="ns"]')?.addEventListener('change', (event) => { sandboxNs = Number(event.target.value); render(); });
    container.querySelector('[data-action="revert"]')?.addEventListener('click', () => { session.revert(); render(); });
    container.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      const model = session.snapshot();
      const savedAt = new Date().toISOString();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt, model }));
      emit?.('empirical-weight-tuning:draft-saved', { savedAt, validation: session.validation() });
      render();
    });
    container.querySelector('[data-action="export"]')?.addEventListener('click', () => saveText('empirical-weight-candidate.json', JSON.stringify(session.snapshot(), null, 2)));
    container.querySelector('[data-action="import"]')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const result = validateEmpiricalWeightTuningModel(parsed);
        if (!result.ok) throw new Error(`Candidate has ${result.errors.length} validation errors.`);
        replaceModel(cloneEmpiricalWeightModel(parsed));
        render();
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      } finally {
        event.target.value = '';
      }
    });
  }

  render();
}
