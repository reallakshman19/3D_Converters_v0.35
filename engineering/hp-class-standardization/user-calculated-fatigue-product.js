import './user-calculated-fatigue-evidence-bridge.js';
import { calculateChapterIxPressureCycleStress } from '../../converters/b313-chapter-ix/cycle-stress.js';
import {
  USER_SALT_CROSSCHECK_RELATIVE_TOLERANCE,
  evaluateChapterIxUserCalculatedFatigueSpectrum,
} from '../../converters/b313-chapter-ix/user-calculated-fatigue.js';
import {
  createUserCalculatedFatigueExchangePackage,
  parseUserCalculatedFatigueCsv,
  parseUserCalculatedFatigueJson,
  serializeUserCalculatedFatigueCsv,
  serializeUserCalculatedFatigueJson,
} from '../../converters/b313-chapter-ix/user-calculated-fatigue-exchange.js';

const byId = (id) => document.getElementById(id);
const SPECTRUM_ID = 'HP-UI-USER-KD3';
const stateByKey = new Map();
let suppressRender = false;

function text(value) {
  return String(value ?? '').trim();
}

function finiteNumber(value) {
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rowState(key) {
  if (!stateByKey.has(key)) {
    stateByKey.set(key, {
      userSalt: '',
      seq: '',
      N: '',
      code: '',
      edition: '',
      methodRef: '',
      calculationRef: '',
      calculatedBy: '',
      checkedBy: '',
      checkedAt: '',
      associatedMeanStressMpa: null,
      beta: null,
      saPrimeMpa: null,
    });
  }
  return stateByKey.get(key);
}

function cycleRows() {
  return [...document.querySelectorAll('#cycleBody tr')].map((row, index) => ({
    cycleId: text(row.dataset.cycleId) || `C${index + 1}`,
    name: text(row.querySelector('.cycle-name')?.value) || `Cycle ${index + 1}`,
    pA: finiteNumber(row.querySelector('.cycle-pmin')?.value),
    pB: finiteNumber(row.querySelector('.cycle-pmax')?.value),
    tA: finiteNumber(row.querySelector('.cycle-tmin')?.value),
    tB: finiteNumber(row.querySelector('.cycle-tmax')?.value),
    n: finiteNumber(row.querySelector('.cycle-n')?.value),
  }));
}

function identifyLegacyRow(row, cycles) {
  const key = text(row.dataset.key);
  const cycle = cycles.find((item) => key.endsWith(`-${item.cycleId}`));
  if (!cycle) return null;
  const wallText = key.slice(0, -(cycle.cycleId.length + 1));
  const wall = Number(wallText);
  const effectiveWall = Number(row.cells?.[3]?.textContent);
  if (!Number.isFinite(wall) || !Number.isFinite(effectiveWall)) return null;
  return { key, wall, effectiveWall, cycle };
}

function matrixRows() {
  const cycles = cycleRows();
  return [...document.querySelectorAll('#fatigueBody tr')]
    .map((row) => identifyLegacyRow(row, cycles))
    .filter(Boolean);
}

function spectrumForCycles(cycles) {
  const states = [];
  const transitions = [];
  for (const cycle of cycles) {
    const fromStateId = `${cycle.cycleId}:A`;
    const toStateId = `${cycle.cycleId}:B`;
    states.push({
      spectrumId: SPECTRUM_ID,
      stateId: fromStateId,
      pressureMpa: cycle.pA,
      materialTemperatureC: cycle.tA,
      structuralTemperatureC: cycle.tA,
    });
    states.push({
      spectrumId: SPECTRUM_ID,
      stateId: toStateId,
      pressureMpa: cycle.pB,
      materialTemperatureC: cycle.tB,
      structuralTemperatureC: cycle.tB,
    });
    transitions.push({
      spectrumId: SPECTRUM_ID,
      cycleId: cycle.cycleId,
      category: cycle.name,
      fromStateId,
      toStateId,
      totalCycles: cycle.n,
      provenanceId: `HP-UI-${cycle.cycleId}`,
    });
  }
  return {
    spectrum: {
      spectrumId: SPECTRUM_ID,
      status: 'USER_CALCULATED_KD3_REVIEW_ONLY',
    },
    states,
    transitions,
  };
}

function coreSalt(row) {
  const diameter = finiteNumber(byId('diameter')?.value);
  if (!(diameter > 0) || !(row.effectiveWall > 0) || row.cycle.pA === null || row.cycle.pB === null) return null;
  const result = calculateChapterIxPressureCycleStress({
    outsideDiameterMm: diameter,
    effectiveWallMm: row.effectiveWall,
    fromPressureMpa: row.cycle.pA,
    toPressureMpa: row.cycle.pB,
  });
  return result.ok ? result.alternatingStressIntensityMpa : null;
}

function localSaltStatus(row, state, result) {
  if (result?.saltCrossCheck?.status) return result.saltCrossCheck.status;
  const userSalt = finiteNumber(state.userSalt);
  if (userSalt === null) return 'NOT_PROVIDED';
  const core = coreSalt(row);
  if (core === null) return 'PENDING';
  const scale = Math.max(Math.abs(core), Math.abs(userSalt), 1);
  const relativeDifference = Math.abs(core - userSalt) / scale;
  return relativeDifference <= USER_SALT_CROSSCHECK_RELATIVE_TOLERANCE ? 'MATCH' : 'MISMATCH';
}

function provenanceComplete(state) {
  return ['code', 'edition', 'methodRef', 'calculationRef', 'calculatedBy'].every((field) => text(state[field]));
}

function provenanceStatus(state) {
  if (!provenanceComplete(state)) return { label: 'Incomplete', css: 'bad' };
  const checker = text(state.checkedBy);
  const checkedAt = text(state.checkedAt);
  if (Boolean(checker) !== Boolean(checkedAt)) return { label: 'Check custody incomplete', css: 'bad' };
  if (checker && checker.toLocaleLowerCase() === text(state.calculatedBy).toLocaleLowerCase()) {
    return { label: 'Checker not independent', css: 'bad' };
  }
  return checker ? { label: 'Checked', css: 'good' } : { label: 'Not checked', css: 'warn' };
}

function externalResult(row) {
  const state = rowState(row.key);
  const salt = coreSalt(row);
  const seq = finiteNumber(state.seq);
  const N = finiteNumber(state.N);
  const userSalt = finiteNumber(state.userSalt);
  const zeroDamage = salt === 0 && seq === 0;
  const result = {
    cycleId: row.cycle.cycleId,
    locationId: `WALL-${row.wall.toFixed(4)}`,
    fromStateId: `${row.cycle.cycleId}:A`,
    toStateId: `${row.cycle.cycleId}:B`,
    equivalentAlternatingStressMpa: seq,
    calculationBasis: {
      code: text(state.code),
      edition: text(state.edition),
      methodRef: text(state.methodRef),
      calculationRef: text(state.calculationRef),
      calculatedBy: text(state.calculatedBy),
    },
  };
  if (userSalt !== null) result.userAlternatingStressIntensityMpa = userSalt;
  if (!zeroDamage && N !== null) result.permissibleCycles = N;
  if (text(state.checkedBy)) result.calculationBasis.checkedBy = text(state.checkedBy);
  if (text(state.checkedAt)) result.calculationBasis.checkedAt = text(state.checkedAt);
  for (const field of ['associatedMeanStressMpa', 'beta', 'saPrimeMpa']) {
    if (Number.isFinite(state[field])) result[field] = state[field];
  }
  return result;
}

function rowReady(row) {
  const state = rowState(row.key);
  const salt = coreSalt(row);
  const seq = finiteNumber(state.seq);
  const N = finiteNumber(state.N);
  if (!provenanceComplete(state)) return false;
  if (!(seq >= 0)) return false;
  if (salt === 0 && seq === 0) return true;
  return seq > 0 && N > 0;
}

function evaluateWall(wall, rows) {
  const wallRows = rows.filter((row) => row.wall === wall);
  if (!wallRows.length || wallRows.some((row) => !rowReady(row))) return null;
  const diameter = finiteNumber(byId('diameter')?.value);
  if (!(diameter > 0)) return null;
  const cycles = wallRows.map((row) => row.cycle);
  const transient = spectrumForCycles(cycles);
  return evaluateChapterIxUserCalculatedFatigueSpectrum({
    outsideDiameterMm: diameter,
    effectiveWallMm: wallRows[0].effectiveWall,
    ...transient,
    externalResults: wallRows.map(externalResult),
  });
}

function resultByKey(rows) {
  const map = new Map();
  const wallSummary = new Map();
  const walls = [...new Set(rows.map((row) => row.wall))];
  for (const wall of walls) {
    const evaluation = evaluateWall(wall, rows);
    wallSummary.set(wall, evaluation);
    if (!evaluation?.ok) continue;
    const wallRows = rows.filter((row) => row.wall === wall);
    for (const result of evaluation.cycles) {
      const row = wallRows.find((candidate) => candidate.cycle.cycleId === result.cycleId);
      if (row) map.set(row.key, result);
    }
  }
  return { map, wallSummary };
}

function setStateFromExternal(row, external) {
  const state = rowState(row.key);
  state.userSalt = external.userAlternatingStressIntensityMpa ?? '';
  state.seq = external.equivalentAlternatingStressMpa ?? '';
  state.N = external.permissibleCycles ?? '';
  state.code = external.calculationBasis?.code ?? '';
  state.edition = external.calculationBasis?.edition ?? '';
  state.methodRef = external.calculationBasis?.methodRef ?? '';
  state.calculationRef = external.calculationBasis?.calculationRef ?? '';
  state.calculatedBy = external.calculationBasis?.calculatedBy ?? '';
  state.checkedBy = external.calculationBasis?.checkedBy ?? '';
  state.checkedAt = external.calculationBasis?.checkedAt ?? '';
  state.associatedMeanStressMpa = external.associatedMeanStressMpa ?? null;
  state.beta = external.beta ?? null;
  state.saPrimeMpa = external.saPrimeMpa ?? null;
}

function syncLegacyEvidence(rows, evaluated) {
  for (const row of rows) {
    const state = rowState(row.key);
    const result = evaluated.map.get(row.key);
    const seq = byId(`seq-${row.key}`);
    const ni = byId(`ni-${row.key}`);
    const source = byId(`source-${row.key}`);
    const approved = byId(`approved-${row.key}`);
    if (seq) seq.value = finiteNumber(state.seq) ?? '';
    if (ni) ni.value = result?.zeroDamage ? '' : (finiteNumber(state.N) ?? '');
    if (source) source.value = text(state.calculationRef);
    if (approved) approved.checked = Boolean(result?.evidence);
  }
}

function rowHtml(row, evaluated) {
  const state = rowState(row.key);
  const salt = coreSalt(row);
  const result = evaluated.map.get(row.key);
  const provenance = provenanceStatus(state);
  const deltaP = row.cycle.pA !== null && row.cycle.pB !== null ? Math.abs(row.cycle.pB - row.cycle.pA) : null;
  const zeroCandidate = salt === 0 && finiteNumber(state.seq) === 0;
  const saltStatus = localSaltStatus(row, state, result);
  const usage = result?.usage;
  const stateLabel = result
    ? result.zeroDamage ? 'ZERO DAMAGE' : result.evidence.status === 'USER_CALCULATED_INDEPENDENTLY_CHECKED' ? 'CHECKED / NOT AUTHORIZED' : 'NOT CHECKED'
    : saltStatus === 'MISMATCH' ? 'SALT MISMATCH'
      : rowReady(row) ? 'EVALUATION BLOCKED' : 'INPUT REQUIRED';
  return `<tr data-user-kd3-key="${escapeHtml(row.key)}">
    <td>${fmt(row.wall, 2)}</td>
    <td class="text-left">${escapeHtml(row.cycle.name)}<br><small>${escapeHtml(row.cycle.cycleId)}</small></td>
    <td>${fmt(row.cycle.pA, 3)}</td>
    <td>${fmt(row.cycle.pB, 3)}</td>
    <td>${fmt(deltaP, 3)}</td>
    <td>${fmt(salt, 4)}</td>
    <td><input class="table-input user-kd3-salt" type="number" min="0" step="any" value="${escapeHtml(state.userSalt)}" placeholder="optional"></td>
    <td><span class="badge ${saltStatus === 'MATCH' ? 'good' : saltStatus === 'MISMATCH' ? 'bad' : 'blocked'}">${escapeHtml(saltStatus)}</span></td>
    <td><input class="table-input user-kd3-seq" type="number" min="0" step="any" value="${escapeHtml(state.seq)}" placeholder="external Seq"></td>
    <td><input class="table-input user-kd3-N" type="number" min="1" step="any" value="${escapeHtml(state.N)}" placeholder="${zeroCandidate ? 'N/A' : 'external N'}" ${zeroCandidate ? 'disabled' : ''}></td>
    <td>${fmt(row.cycle.n, 0)}</td>
    <td>${Number.isFinite(usage) ? usage.toFixed(6) : zeroCandidate ? '0.000000' : '—'}</td>
    <td><span class="badge ${result ? 'blocked' : saltStatus === 'MISMATCH' ? 'bad' : 'warn'}">${escapeHtml(stateLabel)}</span></td>
    <td class="text-left">
      <span class="badge ${provenance.css}">${escapeHtml(provenance.label)}</span>
      <details class="user-kd3-provenance"><summary>Provenance</summary>
        <label>Code<input class="user-kd3-code" value="${escapeHtml(state.code)}" placeholder="ASME BPVC VIII-3"></label>
        <label>Edition<input class="user-kd3-edition" value="${escapeHtml(state.edition)}"></label>
        <label>Method / clause<input class="user-kd3-method" value="${escapeHtml(state.methodRef)}"></label>
        <label>Calculation ref<input class="user-kd3-calc-ref" value="${escapeHtml(state.calculationRef)}"></label>
        <label>Calculated by<input class="user-kd3-calculated-by" value="${escapeHtml(state.calculatedBy)}"></label>
        <label>Checked by<input class="user-kd3-checked-by" value="${escapeHtml(state.checkedBy)}"></label>
        <label>Checked at<input class="user-kd3-checked-at" value="${escapeHtml(state.checkedAt)}" placeholder="ISO 8601 timestamp"></label>
      </details>
    </td>
  </tr>`;
}

function summaryHtml(rows, evaluated) {
  const walls = [...new Set(rows.map((row) => row.wall))];
  if (!walls.length) return '<span>No calculated wall × cycle rows yet.</span>';
  return walls.map((wall) => {
    const result = evaluated.wallSummary.get(wall);
    if (!result) return `<span><strong>${fmt(wall, 2)} mm</strong> — external Seq/N/provenance incomplete</span>`;
    if (!result.ok) return `<span><strong>${fmt(wall, 2)} mm</strong> — BLOCKED: ${escapeHtml(result.code || result.message)}</span>`;
    return `<span><strong>${fmt(wall, 2)} mm</strong> — U=${result.damage.cumulativeUsage.toFixed(6)} · ${result.damage.usageWithinUnity ? 'within unity' : 'exceeds unity'} · ${result.independentCheckComplete ? 'checked' : 'not fully checked'} · review only</span>`;
  }).join('<br>');
}

function selectedWallRows(rows) {
  const selected = Number(byId('userKd3WallSelect')?.value);
  return rows.filter((row) => row.wall === selected);
}

function populateWallSelector(rows) {
  const select = byId('userKd3WallSelect');
  if (!select) return;
  const current = select.value;
  const walls = [...new Set(rows.map((row) => row.wall))];
  select.innerHTML = walls.map((wall) => `<option value="${wall}">${fmt(wall, 2)} mm</option>`).join('');
  if (walls.some((wall) => String(wall) === current)) select.value = current;
}

function bindRowInputs() {
  document.querySelectorAll('#userKd3Body tr').forEach((tr) => {
    const state = rowState(tr.dataset.userKd3Key);
    const bindings = [
      ['.user-kd3-salt', 'userSalt'],
      ['.user-kd3-seq', 'seq'],
      ['.user-kd3-N', 'N'],
      ['.user-kd3-code', 'code'],
      ['.user-kd3-edition', 'edition'],
      ['.user-kd3-method', 'methodRef'],
      ['.user-kd3-calc-ref', 'calculationRef'],
      ['.user-kd3-calculated-by', 'calculatedBy'],
      ['.user-kd3-checked-by', 'checkedBy'],
      ['.user-kd3-checked-at', 'checkedAt'],
    ];
    for (const [selector, field] of bindings) {
      tr.querySelector(selector)?.addEventListener('input', (event) => {
        state[field] = event.target.value;
        scheduleRender();
      });
    }
  });
}

function render() {
  if (suppressRender || !byId('fatigueBody') || !byId('userKd3Body')) return;
  suppressRender = true;
  try {
    const rows = matrixRows();
    const evaluated = resultByKey(rows);
    populateWallSelector(rows);
    byId('userKd3Body').innerHTML = rows.map((row) => rowHtml(row, evaluated)).join('');
    byId('userKd3Summary').innerHTML = summaryHtml(rows, evaluated);
    syncLegacyEvidence(rows, evaluated);
    bindRowInputs();
  } finally {
    suppressRender = false;
  }
}

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 0);
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function packageForSelectedWall() {
  const rows = matrixRows();
  const selectedRows = selectedWallRows(rows);
  if (!selectedRows.length) throw new Error('Select a wall with calculated cycle rows.');
  if (selectedRows.some((row) => !rowReady(row))) throw new Error('Complete external Seq/N and required per-cycle provenance before export.');
  const diameter = finiteNumber(byId('diameter')?.value);
  const transient = spectrumForCycles(selectedRows.map((row) => row.cycle));
  const evaluation = evaluateWall(selectedRows[0].wall, rows);
  if (!evaluation?.ok) throw new Error(evaluation?.message || evaluation?.code || 'Canonical evaluation is blocked.');
  return createUserCalculatedFatigueExchangePackage({
    outsideDiameterMm: diameter,
    effectiveWallMm: selectedRows[0].effectiveWall,
    ...transient,
    externalResults: selectedRows.map(externalResult),
  });
}

function roundTripJson(pkg) {
  const serialized = serializeUserCalculatedFatigueJson(pkg);
  const parsed = parseUserCalculatedFatigueJson(serialized);
  const stable = JSON.stringify(parsed.externalResults) === JSON.stringify(pkg.externalResults);
  if (!stable) throw new Error('JSON round-trip changed externalResults.');
  return serialized;
}

function roundTripCsv(externalResults) {
  const serialized = serializeUserCalculatedFatigueCsv(externalResults);
  const parsed = parseUserCalculatedFatigueCsv(serialized);
  const stable = JSON.stringify(parsed) === JSON.stringify(externalResults);
  if (!stable) throw new Error('CSV round-trip changed externalResults.');
  return serialized;
}

function setExchangeStatus(message, kind = 'info') {
  const box = byId('userKd3ExchangeStatus');
  if (!box) return;
  box.className = `notice ${kind}`;
  box.textContent = message;
}

function exportJson() {
  try {
    const pkg = packageForSelectedWall();
    const content = roundTripJson(pkg);
    downloadText(`user-calculated-kd3-${byId('userKd3WallSelect').value}.json`, content, 'application/json;charset=utf-8');
    setExchangeStatus('JSON export round-trip verified. Authority remains USER_CALCULATED_KD3 / review only.');
  } catch (error) {
    setExchangeStatus(error.message, 'error');
  }
}

function exportCsv() {
  try {
    const pkg = packageForSelectedWall();
    const content = roundTripCsv(pkg.externalResults);
    downloadText(`user-calculated-kd3-${byId('userKd3WallSelect').value}.csv`, content, 'text/csv;charset=utf-8');
    setExchangeStatus('CSV export round-trip verified. Geometry/spectrum remain governed by the current calculator; CSV transports external cycle results/provenance only.');
  } catch (error) {
    setExchangeStatus(error.message, 'error');
  }
}

function applyExternalResults(externalResults, selectedRows) {
  const byCycle = new Map(externalResults.map((row) => [text(row.cycleId), row]));
  for (const row of selectedRows) {
    const external = byCycle.get(row.cycle.cycleId);
    if (!external) throw new Error(`Import missing cycle ${row.cycle.cycleId}.`);
    if (text(external.fromStateId) !== `${row.cycle.cycleId}:A` || text(external.toStateId) !== `${row.cycle.cycleId}:B`) {
      throw new Error(`Import state binding mismatch for ${row.cycle.cycleId}.`);
    }
    setStateFromExternal(row, external);
  }
}

async function importJsonFile(file) {
  const pkg = parseUserCalculatedFatigueJson(await file.text());
  const rows = matrixRows();
  const selectedRows = selectedWallRows(rows);
  if (!selectedRows.length) throw new Error('Select a current wall before import.');
  const diameter = finiteNumber(byId('diameter')?.value);
  if (Math.abs(pkg.geometry.outsideDiameterMm - diameter) > 1e-9) throw new Error('JSON outside diameter does not match the current calculator.');
  if (Math.abs(pkg.geometry.effectiveWallMm - selectedRows[0].effectiveWall) > 1e-9) throw new Error('JSON effective wall does not match the selected wall row.');
  applyExternalResults(pkg.externalResults, selectedRows);
  scheduleRender();
  setExchangeStatus(`Imported JSON for ${fmt(selectedRows[0].wall, 2)} mm wall; canonical state binding retained.`);
}

async function importCsvFile(file) {
  const externalResults = parseUserCalculatedFatigueCsv(await file.text());
  const rows = matrixRows();
  const selectedRows = selectedWallRows(rows);
  if (!selectedRows.length) throw new Error('Select a current wall before import.');
  applyExternalResults(externalResults, selectedRows);
  scheduleRender();
  setExchangeStatus(`Imported CSV for ${fmt(selectedRows[0].wall, 2)} mm wall. Recalculate/review Salt QA and cumulative usage before relying on the review record.`);
}

async function handleFileInput(event) {
  const file = event.target.files?.[0];
  const mode = event.target.dataset.importMode;
  if (!file) return;
  try {
    if (mode === 'json') await importJsonFile(file);
    else await importCsvFile(file);
  } catch (error) {
    setExchangeStatus(`Import blocked: ${error.message}`, 'error');
  } finally {
    event.target.value = '';
  }
}

function buildSurface() {
  const legacyBody = byId('fatigueBody');
  if (!legacyBody || byId('userKd3Surface')) return;
  const legacyTableWrap = legacyBody.closest('.table-wrap');
  const legacyHeading = legacyTableWrap?.previousElementSibling;
  if (legacyHeading?.classList.contains('subsection-heading')) legacyHeading.hidden = true;
  if (legacyTableWrap) legacyTableWrap.hidden = true;

  const section = document.createElement('section');
  section.id = 'userKd3Surface';
  section.className = 'control-group evidence-input';
  section.innerHTML = `
    <div class="group-heading">
      <div>
        <h3>Canonical USER_CALCULATED_KD3 cycle review</h3>
        <p>CORE owns pressure-cycle Salt and Miner bookkeeping. Seq and N remain external KD-3 authority. Zero-damage is represented explicitly as CORE Salt=0, Seq=0, N=N/A, Ui=0.</p>
      </div>
      <span class="group-type">Review only</span>
    </div>
    <div class="form-grid compact-grid">
      <label>Mode<select disabled><option>User Calculated KD-3</option><option>CORE KD-3 — Not Qualified</option></select></label>
      <label>Wall for JSON/CSV exchange<select id="userKd3WallSelect"></select></label>
    </div>
    <div class="page-actions">
      <button id="userKd3Refresh" type="button" class="primary">Validate / refresh USER KD-3</button>
      <button id="userKd3ImportJson" type="button">Import JSON</button>
      <button id="userKd3ImportCsv" type="button">Import CSV</button>
      <button id="userKd3ExportJson" type="button">Export JSON</button>
      <button id="userKd3ExportCsv" type="button">Export CSV</button>
      <input id="userKd3JsonFile" type="file" accept="application/json,.json" hidden data-import-mode="json">
      <input id="userKd3CsvFile" type="file" accept="text/csv,.csv" hidden data-import-mode="csv">
    </div>
    <div id="userKd3ExchangeStatus" class="notice info">Complete per-cycle external Seq/N and provenance. User Salt is optional and, when entered, is cross-checked against CORE Salt at the repository QA tolerance.</div>
    <div id="userKd3Summary" class="review-note"></div>
    <div class="table-wrap">
      <table class="fatigue-table user-kd3-table">
        <thead><tr>
          <th>Wall<br>mm</th><th>Cycle</th><th>PA<br>MPa</th><th>PB<br>MPa</th><th>ΔP<br>MPa</th>
          <th>CORE Salt<br>MPa</th><th>User Salt<br>MPa</th><th>Salt QA</th><th>User Seq<br>MPa</th><th>User N<br>cycles</th>
          <th>n</th><th>Ui=n/N</th><th>Review state</th><th>Per-cycle provenance</th>
        </tr></thead>
        <tbody id="userKd3Body"></tbody>
      </table>
    </div>`;
  legacyTableWrap?.parentElement?.insertBefore(section, legacyTableWrap);

  byId('userKd3Refresh')?.addEventListener('click', render);
  byId('userKd3ImportJson')?.addEventListener('click', () => byId('userKd3JsonFile')?.click());
  byId('userKd3ImportCsv')?.addEventListener('click', () => byId('userKd3CsvFile')?.click());
  byId('userKd3ExportJson')?.addEventListener('click', exportJson);
  byId('userKd3ExportCsv')?.addEventListener('click', exportCsv);
  byId('userKd3JsonFile')?.addEventListener('change', handleFileInput);
  byId('userKd3CsvFile')?.addEventListener('change', handleFileInput);
  byId('userKd3WallSelect')?.addEventListener('change', () => setExchangeStatus('Exchange wall changed. JSON validates geometry; CSV applies only to the selected wall/cycle identities.'));
}

function observeLegacyMatrix() {
  const target = byId('fatigueBody');
  if (!target) return;
  new MutationObserver(() => {
    if (!suppressRender) scheduleRender();
  }).observe(target, { childList: true, subtree: true });
  document.addEventListener('input', (event) => {
    if (event.target.closest('#userKd3Surface')) return;
    if (event.target.closest('#cycleBody') || ['diameter', 'candidateWalls'].includes(event.target.id)) scheduleRender();
  });
}

function init() {
  buildSurface();
  observeLegacyMatrix();
  scheduleRender();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
