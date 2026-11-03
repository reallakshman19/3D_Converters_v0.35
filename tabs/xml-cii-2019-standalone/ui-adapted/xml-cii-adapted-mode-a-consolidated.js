import { DEFAULT_WEIGHT_MASTER_ROWS } from '../../../converters/xml-cii2019-core/default-weight-master-rows.js';
import { collectXmlCiiWeightMatchRows } from '../../../converters/xml-cii2019-core/weight-match-model.js';
import { xmlCiiDryRunPreview } from './xml-cii-adapted-preview-dryrun.js';
import { createElement } from './xml-cii-adapted-dom.js';
import { xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';
import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js';
import {
  modeAExecutionRows,
  modeARawRef,
  modeARawState,
} from './xml-cii-adapted-mode-a-propagation.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function display(value, fallback = '—') {
  const cleaned = text(value);
  return cleaned || fallback;
}

function isDefaultSource(value) {
  return /(^|-)default($|-)|config-default|default-zero/i.test(text(value));
}

function yieldUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else if (typeof setTimeout === 'function') setTimeout(resolve, 0);
    else resolve();
  });
}

function cloneConfig(config) {
  try { return JSON.parse(JSON.stringify(config || {})); } catch { return { ...(config || {}) }; }
}

function ensureWeightMasterRows(config, state) {
  const out = cloneConfig(config);
  if (Array.isArray(out?.weight?.masterRows) && out.weight.masterRows.length) return out;
  const rows = Array.isArray(state?.masterContext?.weightMasterRows) && state.masterContext.weightMasterRows.length
    ? state.masterContext.weightMasterRows
    : DEFAULT_WEIGHT_MASTER_ROWS;
  out.weight = out.weight && typeof out.weight === 'object' && !Array.isArray(out.weight)
    ? { ...out.weight }
    : {};
  out.weight.masterRows = rows.map((row) => ({ ...row }));
  return out;
}

function compactPreviewRow(source, row) {
  return {
    sourceId: source.sourceId,
    fileName: source.fileName,
    alias: source.alias,
    branchName: row?.branchName || '',
    lineKey: row?.lineKey || '',
    lineFrom: row?.lineFrom || '',
    lineTo: row?.lineTo || '',
    size: row?.size || '',
    pipingClass: row?.pipingClass || row?.pipingClassDerived || '',
    pipingClassMethod: row?.pipingClassMethod || '',
    pipingClassConfidence: row?.pipingClassConfidence,
    pipingClassNeedsReview: row?.pipingClassNeedsReview === true,
    material: row?.material || '',
    materialSource: row?.materialSource || '',
    rating: row?.rating || '',
    ratingSource: row?.ratingSource || '',
    materialCode: row?.materialCode || '',
    materialCodeMethod: row?.materialCodeMethod || '',
    materialCodeNeedsReview: row?.materialCodeNeedsReview === true,
    p1: row?.p1 || '',
    p1Source: row?.p1Source || '',
    hydroPressure: row?.hydroPressure || '',
    hydroPressureSource: row?.hydroPressureSource || '',
    t1: row?.t1 || '',
    t1Source: row?.t1Source || '',
    t2: row?.t2 || '',
    t2Source: row?.t2Source || '',
    t3: row?.t3 || '',
    t3Source: row?.t3Source || '',
    density: row?.density || '',
    densitySource: row?.densitySource || '',
    wallThickness: row?.wallThickness || '',
    wallThicknessSource: row?.wallThicknessSource || '',
    corrosion: row?.corrosion || '',
    corrosionSource: row?.corrosionSource || '',
    lineMiss: row?.lineMiss === true,
  };
}

function candidateWeight(candidate) {
  return candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight ?? '';
}

function candidateScore(candidate) {
  const raw = number(candidate?.totalScore ?? candidate?.score);
  if (raw === null) return '';
  const percent = raw <= 1 ? raw * 100 : raw;
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

function candidateDescription(candidate) {
  return text(candidate?.typeDesc || candidate?.valveType || candidate?.type || candidate?.specialFactorCode);
}

function compactWeightRow(source, row) {
  const best = Array.isArray(row?.candidates) ? row.candidates[0] : null;
  return {
    sourceId: source.sourceId,
    fileName: source.fileName,
    alias: source.alias,
    key: row?.key || '',
    branchName: row?.branchName || '',
    lineKey: row?.lineKey || '',
    nodeNumber: row?.nodeNumber || '',
    nodeNumberDisplay: row?.nodeNumberDisplay || row?.nodeNumber || '',
    nodeName: row?.nodeName || '',
    componentType: row?.componentType || '',
    componentRefNo: row?.componentRefNo || '',
    boreMm: row?.boreMm,
    rating: row?.rating || '',
    resolvedPipingClass: row?.resolvedPipingClass || row?.requestedPipingClass || '',
    lengthMm: row?.lengthMm,
    weight: row?.weight,
    originalWeight: row?.originalWeight,
    overrideWeight: row?.overrideWeight,
    weightSource: row?.weightSource || '',
    mapped: row?.mapped === true,
    status: row?.status || (row?.mapped ? 'mapped' : 'unresolved'),
    dtxr: row?.dtxr || '',
    dtxrSource: row?.dtxrSource || '',
    bestWeight: candidateWeight(best),
    bestScore: candidateScore(best),
    bestDescription: candidateDescription(best),
    candidateCount: Array.isArray(row?.candidates) ? row.candidates.length : 0,
  };
}

export async function buildModeAConsolidatedPreview(stateOrRef = {}, runtime = {}) {
  const executionRows = runtime.executionRows
    ? runtime.executionRows(stateOrRef)
    : modeAExecutionRows(stateOrRef);
  const previewBuilder = runtime.previewBuilder || xmlCiiDryRunPreview;
  const configBuilder = runtime.configBuilder || xmlCiiEnrichedConfigFromState;
  const rows = [];
  const sources = [];
  const errors = [];

  for (let index = 0; index < executionRows.length; index += 1) {
    const entry = executionRows[index];
    runtime.onProgress?.({ index, total: executionRows.length, source: entry.source });
    try {
      const config = configBuilder(entry.state);
      const result = previewBuilder(
        entry.state.sourceText || '',
        config,
        entry.state.stagedJsonText || '',
      ) || {};
      const branchRows = Array.isArray(result.branchRows) ? result.branchRows : [];
      rows.push(...branchRows.map((row) => compactPreviewRow(entry.source, row)));
      sources.push({
        sourceId: entry.source.sourceId,
        fileName: entry.source.fileName,
        branchCount: branchRows.length,
        nodeCount: Array.isArray(result.nodeRows) ? result.nodeRows.length : 0,
      });
    } catch (error) {
      errors.push({
        sourceId: entry.source.sourceId,
        fileName: entry.source.fileName,
        message: error?.message || String(error),
      });
    }
    await (runtime.yieldUi || yieldUi)();
  }

  return {
    schema: 'xml-cii-mode-a-consolidated-preview/v1',
    builtAt: new Date().toISOString(),
    sourceCount: executionRows.length,
    branchCount: rows.length,
    mappedCount: rows.filter((row) => !row.lineMiss).length,
    unmappedCount: rows.filter((row) => row.lineMiss).length,
    defaultValueCount: rows.reduce((sum, row) => sum + [
      row.p1Source,
      row.hydroPressureSource,
      row.t1Source,
      row.t2Source,
      row.t3Source,
      row.densitySource,
      row.wallThicknessSource,
      row.corrosionSource,
    ].filter(isDefaultSource).length, 0),
    rows,
    sources,
    errors,
  };
}

export async function buildModeAConsolidatedWeightMatch(stateOrRef = {}, runtime = {}) {
  const executionRows = runtime.executionRows
    ? runtime.executionRows(stateOrRef)
    : modeAExecutionRows(stateOrRef);
  const collector = runtime.collector || collectXmlCiiWeightMatchRows;
  const configBuilder = runtime.configBuilder || xmlCiiEnrichedConfigFromState;
  const rows = [];
  const sources = [];
  const errors = [];

  for (let index = 0; index < executionRows.length; index += 1) {
    const entry = executionRows[index];
    runtime.onProgress?.({ index, total: executionRows.length, source: entry.source });
    try {
      const config = ensureWeightMasterRows(configBuilder(entry.state), entry.state);
      const sourceRows = collector(
        entry.state.sourceText || '',
        entry.state.stagedJsonText || '',
        config,
      ) || [];
      rows.push(...sourceRows.map((row) => compactWeightRow(entry.source, row)));
      sources.push({
        sourceId: entry.source.sourceId,
        fileName: entry.source.fileName,
        rowCount: sourceRows.length,
        unresolvedCount: sourceRows.filter((row) => row?.mapped !== true).length,
      });
    } catch (error) {
      errors.push({
        sourceId: entry.source.sourceId,
        fileName: entry.source.fileName,
        message: error?.message || String(error),
      });
    }
    await (runtime.yieldUi || yieldUi)();
  }

  return {
    schema: 'xml-cii-mode-a-consolidated-weight-match/v1',
    builtAt: new Date().toISOString(),
    sourceCount: executionRows.length,
    rowCount: rows.length,
    mappedCount: rows.filter((row) => row.mapped).length,
    unresolvedCount: rows.filter((row) => !row.mapped).length,
    suggestedCount: rows.filter((row) => text(row.bestWeight)).length,
    rows,
    sources,
    errors,
  };
}

function panelShell(title, noteText) {
  const panel = createElement('section', '', 'model-converters-workflow-master-card xml-cii-mode-a-consolidated');
  Object.assign(panel.style, {
    margin: '12px 0 16px',
    padding: '12px',
    border: '1px solid #2563eb',
    borderRadius: '8px',
    background: '#0b1730',
  });
  panel.append(
    createElement('h3', title),
    createElement('div', noteText, 'model-converters-workflow-detail-note'),
  );
  return panel;
}

function actionButton(label) {
  const button = createElement('button', label);
  button.type = 'button';
  button.className = 'model-converters-run-btn';
  Object.assign(button.style, { padding: '7px 12px', minWidth: '170px' });
  return button;
}

function summaryBadges(parent, items) {
  const row = createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0' });
  for (const [label, value] of items) {
    const badge = createElement('span', `${label}: ${value}`);
    Object.assign(badge.style, {
      padding: '3px 8px',
      borderRadius: '999px',
      border: '1px solid #475569',
      color: '#dbeafe',
      background: '#111827',
      fontSize: '11px',
    });
    row.appendChild(badge);
  }
  parent.appendChild(row);
}

function tableShell(headers) {
  const wrap = createElement('div');
  Object.assign(wrap.style, { overflow: 'auto', maxHeight: '62vh', border: '1px solid #273449', borderRadius: '6px' });
  const table = createElement('table', '', 'xml-cii-audit-table');
  Object.assign(table.style, { minWidth: '1900px', width: '100%', borderCollapse: 'collapse', fontSize: '11px' });
  const thead = createElement('thead');
  const headRow = createElement('tr');
  for (const header of headers) {
    const th = createElement('th', header);
    Object.assign(th.style, { position: 'sticky', top: '0', zIndex: '2', background: '#0f172a', whiteSpace: 'nowrap' });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  const tbody = createElement('tbody');
  table.append(thead, tbody);
  wrap.appendChild(table);
  return { wrap, tbody };
}

function td(value, { defaultValue = false, title = '' } = {}) {
  const cell = createElement('td', display(value));
  if (defaultValue) Object.assign(cell.style, { color: '#fca5a5', fontWeight: '700' });
  if (title) cell.title = title;
  return cell;
}

function sourceButton(sourceId, label = 'Open individual') {
  const button = createElement('button', label);
  button.type = 'button';
  button.dataset.modeAOpenIndividual = sourceId;
  Object.assign(button.style, {
    padding: '4px 7px', border: '1px solid #475569', borderRadius: '5px',
    background: '#172033', color: '#dbeafe', cursor: 'pointer', fontSize: '10px',
  });
  return button;
}

function bindOpenIndividual(panel) {
  panel.querySelectorAll?.('[data-mode-a-open-individual]').forEach((button) => {
    button.addEventListener('click', () => {
      const sourceId = button.dataset.modeAOpenIndividual;
      const card = button.closest?.('[data-active-phase]') || panel.parentElement;
      const details = card?.querySelector?.(`[data-mode-a-source-phase="${sourceId}"]`);
      if (!details) return;
      details.open = true;
      details.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderErrors(panel, errors) {
  if (!Array.isArray(errors) || !errors.length) return;
  const box = createElement('details');
  box.appendChild(createElement('summary', `${errors.length} source build error(s)`));
  const list = createElement('div', errors.map((row) => `${row.fileName}: ${row.message}`).join(' | '), 'model-converters-workflow-detail-note');
  Object.assign(list.style, { color: '#fecaca', borderColor: '#b91c1c', background: '#450a0a' });
  box.appendChild(list);
  panel.appendChild(box);
}

function renderPreviewTable(panel, result) {
  const headers = [
    'Source XML', 'Branch Name', 'Line Key', 'From', 'To', 'Size', 'Piping Class', 'Material', 'Rating',
    'Material Code', 'P1 / Design Pressure', 'Hydro/Test Pressure', 'T1 (C)', 'T2 (C)', 'T3 (C)', 'Density',
    'Wall Thk', 'Corrosion', 'Line Status', 'Individual',
  ];
  const { wrap, tbody } = tableShell(headers);
  for (const row of result.rows || []) {
    const tr = createElement('tr');
    const pcTitle = [row.pipingClassMethod, row.pipingClassConfidence == null ? '' : `${Math.round(Number(row.pipingClassConfidence) * 100)}%`].filter(Boolean).join(' · ');
    const mcTitle = row.materialCodeMethod || '';
    tr.append(
      td(row.fileName),
      td(row.branchName),
      td(row.lineKey),
      td(row.lineFrom),
      td(row.lineTo),
      td(row.size),
      td(row.pipingClass, { title: pcTitle }),
      td(row.material, { defaultValue: isDefaultSource(row.materialSource), title: row.materialSource }),
      td(row.rating, { defaultValue: isDefaultSource(row.ratingSource), title: row.ratingSource }),
      td(row.materialCode, { title: mcTitle }),
      td(row.p1, { defaultValue: isDefaultSource(row.p1Source), title: row.p1Source }),
      td(row.hydroPressure, { defaultValue: isDefaultSource(row.hydroPressureSource), title: row.hydroPressureSource }),
      td(row.t1, { defaultValue: isDefaultSource(row.t1Source), title: row.t1Source }),
      td(row.t2, { defaultValue: isDefaultSource(row.t2Source), title: row.t2Source }),
      td(row.t3, { defaultValue: isDefaultSource(row.t3Source), title: row.t3Source }),
      td(row.density, { defaultValue: isDefaultSource(row.densitySource), title: row.densitySource }),
      td(row.wallThickness, { defaultValue: isDefaultSource(row.wallThicknessSource), title: row.wallThicknessSource }),
      td(row.corrosion, { defaultValue: isDefaultSource(row.corrosionSource), title: row.corrosionSource }),
      td(row.lineMiss ? 'UNMAPPED' : 'MAPPED'),
    );
    const action = createElement('td');
    action.appendChild(sourceButton(row.sourceId));
    tr.appendChild(action);
    tbody.appendChild(tr);
  }
  panel.appendChild(wrap);
}

function renderWeightTable(panel, result) {
  const headers = [
    'Source XML', 'Branch', 'Node', 'Component', 'Component Ref', 'Bore', 'Rating', 'Piping Class', 'Length',
    'Current Weight', 'Weight Source', 'Status', 'Best Suggestion', 'Score', 'Candidate Type', 'DTXR', 'Individual',
  ];
  const { wrap, tbody } = tableShell(headers);
  for (const row of result.rows || []) {
    const tr = createElement('tr');
    tr.append(
      td(row.fileName),
      td(row.branchName),
      td(row.nodeNumberDisplay),
      td(row.componentType),
      td(row.componentRefNo),
      td(row.boreMm == null ? '' : `${row.boreMm} mm`),
      td(row.rating),
      td(row.resolvedPipingClass),
      td(row.lengthMm == null ? '' : `${Number(row.lengthMm).toFixed(1)} mm`),
      td(row.weight == null ? '' : `${row.weight} kg`),
      td(row.weightSource),
      td(row.mapped ? 'MAPPED' : 'REVIEW'),
      td(text(row.bestWeight) ? `${row.bestWeight} kg` : ''),
      td(row.bestScore),
      td(row.bestDescription),
      td(row.dtxr, { title: row.dtxrSource }),
    );
    const action = createElement('td');
    action.appendChild(sourceButton(row.sourceId));
    tr.appendChild(action);
    tbody.appendChild(tr);
  }
  panel.appendChild(wrap);
}

async function runBuild({ button, progress, stateRef, render, kind }) {
  button.disabled = true;
  const rawRef = modeARawRef(stateRef);
  const builder = kind === 'preview' ? buildModeAConsolidatedPreview : buildModeAConsolidatedWeightMatch;
  try {
    const result = await builder(rawRef, {
      onProgress: ({ index, total, source }) => {
        progress.textContent = `Processing ${index + 1}/${total}: ${source.fileName}`;
      },
    });
    const current = modeARawState(rawRef);
    const key = kind === 'preview' ? 'modeAConsolidatedPreviewResult' : 'modeAConsolidatedWeightResult';
    replaceModeAState(rawRef, { ...current, [key]: result });
    render?.();
  } catch (error) {
    progress.textContent = `Consolidated ${kind} failed: ${error?.message || error}`;
    button.disabled = false;
  }
}

export function renderModeAConsolidatedPreviewPanel(parent, stateRef, render) {
  const executions = modeAExecutionRows(stateRef);
  if (executions.length <= 1) return false;
  const state = modeARawState(stateRef);
  const result = state.modeAConsolidatedPreviewResult;
  const panel = panelShell(
    'Overall / Consolidated Preview — Mode A',
    'One batch review table across all enabled XML files. Source XML remains explicit; edits stay source-local in the individual Preview sections below.',
  );
  const actionRow = createElement('div');
  Object.assign(actionRow.style, { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' });
  const build = actionButton(result ? 'Rebuild Consolidated Preview' : 'Build Consolidated Preview');
  const progress = createElement('span', result ? `Built ${result.branchCount} branch rows across ${result.sourceCount} XML files.` : 'Not built yet.', 'xml-cii-phase-help');
  actionRow.append(build, progress);
  panel.appendChild(actionRow);
  build.addEventListener('click', () => runBuild({ button: build, progress, stateRef, render, kind: 'preview' }));
  if (result) {
    summaryBadges(panel, [
      ['XML files', result.sourceCount],
      ['Branch rows', result.branchCount],
      ['Mapped', result.mappedCount],
      ['Unmapped', result.unmappedCount],
      ['Default-value cells', result.defaultValueCount],
    ]);
    renderPreviewTable(panel, result);
    renderErrors(panel, result.errors);
    bindOpenIndividual(panel);
  }
  parent.appendChild(panel);
  return true;
}

export function renderModeAConsolidatedWeightPanel(parent, stateRef, render) {
  const executions = modeAExecutionRows(stateRef);
  if (executions.length <= 1) return false;
  const state = modeARawState(stateRef);
  const result = state.modeAConsolidatedWeightResult;
  const panel = panelShell(
    'Overall / Consolidated Weight Match — Mode A',
    'One batch weight-review table across all enabled XML files. Branch/node identity is never merged; apply or finalize weights in the source-specific Weight Match sections below.',
  );
  const actionRow = createElement('div');
  Object.assign(actionRow.style, { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' });
  const build = actionButton(result ? 'Rebuild Consolidated Weight Match' : 'Build Consolidated Weight Match');
  const progress = createElement('span', result ? `Built ${result.rowCount} review rows across ${result.sourceCount} XML files.` : 'Not built yet.', 'xml-cii-phase-help');
  actionRow.append(build, progress);
  panel.appendChild(actionRow);
  build.addEventListener('click', () => runBuild({ button: build, progress, stateRef, render, kind: 'weight' }));
  if (result) {
    summaryBadges(panel, [
      ['XML files', result.sourceCount],
      ['Review rows', result.rowCount],
      ['Mapped', result.mappedCount],
      ['Needs review', result.unresolvedCount],
      ['With suggestion', result.suggestedCount],
    ]);
    renderWeightTable(panel, result);
    renderErrors(panel, result.errors);
    bindOpenIndividual(panel);
  }
  parent.appendChild(panel);
  return true;
}
