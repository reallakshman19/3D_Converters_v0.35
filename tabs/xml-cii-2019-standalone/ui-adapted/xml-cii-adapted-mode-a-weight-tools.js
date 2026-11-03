import { extractXmlCiiRatingFromDtxr } from '../../../converters/xml-cii2019-core/dtxr-rating-resolver.js';
import { rankXmlCiiWeightCandidates } from '../../../converters/xml-cii2019-core/weight-valve-hints.js';
import { applyModeAWeightChanges } from './xml-cii-adapted-mode-a-weight-actions.js';
import { modeAQualifiedExactWeightRow } from './xml-cii-adapted-mode-a-bulk-weight.js';
import {
  createModeABatchSharedRef,
  createModeASourceProcessingRef,
} from './xml-cii-adapted-mode-a-propagation.js';
import { xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function parse(value) { try { const out = JSON.parse(String(value || '{}')); return out && typeof out === 'object' && !Array.isArray(out) ? out : {}; } catch { return {}; } }
function score(candidate) {
  const raw = Number(candidate?.totalScore ?? candidate?.score);
  if (!Number.isFinite(raw)) return '';
  const percent = raw <= 1 ? raw * 100 : raw;
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}
function candidateWeight(candidate) { return candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight ?? ''; }
function candidateDescription(candidate) { return text(candidate?.typeDesc || candidate?.valveType || candidate?.type || candidate?.specialFactorCode); }
function isUnsafeBulk(candidate) {
  return Boolean(candidate?.inferredWeight
    || candidate?.flangeWeightFallback
    || candidate?.specialFactorRule
    || /interpolated|extrapolated|factor|fallback|inferred/i.test(text(candidate?.weightMethod)));
}
function styleButton(button, primary = false) {
  Object.assign(button.style, {
    padding: '4px 8px',
    border: `1px solid ${primary ? '#2563eb' : '#475569'}`,
    borderRadius: '5px',
    background: primary ? '#1d4ed8' : '#172033',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '10px',
    whiteSpace: 'nowrap',
  });
}

function sourceConfig(stateRef, sourceId) {
  const ref = createModeASourceProcessingRef(stateRef, sourceId);
  return xmlCiiEnrichedConfigFromState(ref.current);
}

function rerankRow(row, config, rating) {
  if (!rating) return null;
  const ranking = rankXmlCiiWeightCandidates({
    boreMm: row.boreMm,
    rating,
    lengthMm: row.lengthMm,
    componentType: row.componentType,
    componentRefNo: row.componentRefNo,
    dtxr: row.dtxr,
  }, config, { includeRejected: true });
  const best = ranking?.candidates?.[0] || null;
  return {
    rating,
    best,
    bestWeight: candidateWeight(best),
    bestScore: score(best),
    bestDescription: candidateDescription(best),
  };
}

function updateRowDom(panel, row) {
  const tr = [...panel.querySelectorAll('[data-mode-a-weight-consolidated-row]')]
    .find((item) => item.dataset.sourceId === text(row.sourceId) && (item.dataset.issueKey === text(row.key) || item.dataset.searchText?.includes(text(row.nodeNumberDisplay || row.nodeNumber).toLowerCase())));
  if (!tr) return;
  if (tr.children[6]) tr.children[6].textContent = text(row.rating) || '—';
  if (tr.children[12]) {
    const existingButtons = [...tr.children[12].querySelectorAll('button')];
    if (tr.children[12].firstChild) tr.children[12].firstChild.textContent = text(row.bestWeight) || '—';
    existingButtons.forEach((button) => tr.children[12].appendChild(button));
  }
  if (tr.children[13]) tr.children[13].textContent = text(row.bestScore) || '—';
  if (tr.children[14]) tr.children[14].textContent = text(row.bestDescription) || '—';
}

function setDtxrRatingMode(panel, result, stateRef, enabled) {
  let changed = 0;
  for (const row of result.rows || []) {
    if (!row._modeAWeightOriginal) {
      row._modeAWeightOriginal = {
        rating: row.rating,
        bestWeight: row.bestWeight,
        bestScore: row.bestScore,
        bestDescription: row.bestDescription,
      };
    }
    if (!enabled) {
      Object.assign(row, row._modeAWeightOriginal);
      delete row._modeAWeightDtxrBest;
      updateRowDom(panel, row);
      continue;
    }
    delete row._modeAWeightDtxrBest;
    const rating = extractXmlCiiRatingFromDtxr(row.dtxr);
    if (!rating) continue;
    const config = sourceConfig(stateRef, row.sourceId);
    const reranked = rerankRow(row, config, rating);
    if (!reranked) continue;
    row.rating = reranked.rating;
    row.bestWeight = reranked.bestWeight;
    row.bestScore = reranked.bestScore;
    row.bestDescription = reranked.bestDescription;
    row._modeAWeightDtxrBest = reranked.best;
    updateRowDom(panel, row);
    changed += 1;
  }
  return changed;
}

function applyPreferredExact(panel, result, stateRef) {
  const changes = [];
  for (const row of result.rows || []) {
    if (row.mapped) continue;
    if (row._modeAWeightDtxrBest) {
      const best = row._modeAWeightDtxrBest;
      const weight = Number(candidateWeight(best));
      if (!best.preferred || isUnsafeBulk(best) || !Number.isFinite(weight) || weight <= 0 || score(best) !== '100%') continue;
      changes.push({ sourceId: row.sourceId, key: row.key, weight });
      continue;
    }
    if (!modeAQualifiedExactWeightRow(row)) continue;
    const weight = Number(row.bestWeight);
    if (Number.isFinite(weight) && weight > 0) changes.push({ sourceId: row.sourceId, key: row.key, weight });
  }
  if (!changes.length) return 0;
  if (!applyModeAWeightChanges(stateRef, changes, `Use all preferred exact weights (${changes.length})`)) return 0;
  for (const change of changes) {
    const row = (result.rows || []).find((item) => item.sourceId === change.sourceId && item.key === change.key);
    if (!row) continue;
    row.mapped = true;
    row.weight = change.weight;
    row.weightSource = 'override';
  }
  return changes.length;
}

function toggleLengthConversion(panel, stateRef) {
  const sharedRef = createModeABatchSharedRef(stateRef, 'weight-match');
  const current = sharedRef.current;
  const config = parse(current.supportConfigJson);
  config.weight = config.weight && typeof config.weight === 'object' && !Array.isArray(config.weight) ? config.weight : {};
  config.weight.convertSmallLengthsInToMm = config.weight.convertSmallLengthsInToMm !== true;
  sharedRef.current = { ...current, supportConfigJson: JSON.stringify(config, null, 2) };
  panel.querySelector('[data-mode-a-consolidated-build="weight"]')?.click();
  return config.weight.convertSmallLengthsInToMm === true;
}

export function installModeAConsolidatedWeightTools(panel, result, stateRef) {
  const toolbar = panel?.querySelector?.('[data-mode-a-weight-easy-toolbar]');
  if (!toolbar || toolbar.dataset.modeAWeightNativeTools === 'true') return false;
  toolbar.dataset.modeAWeightNativeTools = 'true';

  const build = panel.querySelector('[data-mode-a-consolidated-build="weight"]');
  if (build) {
    build.textContent = 'Build Weight Data — All XML';
    build.title = 'Compute consolidated Weight Match data for every enabled XML while preserving source-local engineering state.';
  }

  const dtxr = document.createElement('button');
  dtxr.type = 'button';
  dtxr.textContent = 'Use Rating as per DTXR';
  dtxr.title = 'Ephemeral Weight Match rerank only. This does not write DTXR Rating into Preview or source configuration.';
  styleButton(dtxr);

  const preferred = document.createElement('button');
  preferred.type = 'button';
  preferred.textContent = 'Use all ★ preferred (exact)';
  preferred.title = 'Bulk-apply only 100% preferred direct weight-master candidates. Interpolated, extrapolated, inferred, factor and fallback candidates remain Review.';
  styleButton(preferred, true);

  const length = document.createElement('button');
  length.type = 'button';
  const sharedConfig = parse(createModeABatchSharedRef(stateRef, 'weight-match').current.supportConfigJson);
  const syncLength = (on = sharedConfig?.weight?.convertSmallLengthsInToMm === true) => { length.textContent = `⇄ in→mm: ${on ? 'ON' : 'OFF'}`; };
  syncLength();
  length.title = 'Shared Weight Match option: convert small master lengths (<100) from inch to mm, then rebuild consolidated Weight Match.';
  styleButton(length);

  let dtxrMode = false;
  const status = document.createElement('span');
  status.className = 'xml-cii-phase-help';

  dtxr.addEventListener('click', () => {
    dtxrMode = !dtxrMode;
    const count = setDtxrRatingMode(panel, result, stateRef, dtxrMode);
    dtxr.textContent = dtxrMode ? 'Use Rating shown in Preview' : 'Use Rating as per DTXR';
    dtxr.style.borderColor = dtxrMode ? '#10b981' : '#475569';
    status.textContent = dtxrMode ? `${count} row(s) reranked from DTXR Rating. No Preview Rating was changed.` : 'Restored Weight Match to Preview Rating.';
  });

  preferred.addEventListener('click', () => {
    const count = applyPreferredExact(panel, result, stateRef);
    status.textContent = count ? `Applied ${count} preferred exact weight(s). Review rows were not bulk accepted.` : 'No unresolved preferred 100% direct weights available.';
    panel.querySelector('[data-mode-a-consolidated-build="weight"]')?.click();
  });

  length.addEventListener('click', () => {
    const on = toggleLengthConversion(panel, stateRef);
    syncLength(on);
    status.textContent = `Length conversion ${on ? 'enabled' : 'disabled'}; consolidated Weight Match rebuilding.`;
  });

  const anchor = toolbar.querySelector('[data-mode-a-weight-project-preview]') || toolbar.firstChild;
  if (anchor) toolbar.insertBefore(dtxr, anchor);
  else toolbar.appendChild(dtxr);
  dtxr.insertAdjacentElement('afterend', preferred);
  preferred.insertAdjacentElement('afterend', length);
  length.insertAdjacentElement('afterend', status);
  return true;
}
