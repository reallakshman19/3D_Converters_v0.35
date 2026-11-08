/**
 * Explicit two-gate UI for threshold-based FINAL CII weight corrections.
 * Preview is read-only. Per-row selection is mandatory, and provisional
 * catalog suggestions additionally require a review-only opt-in + approval.
 */
import { planFinalRigidBatchCorrections } from './xml-cii-final-rigid-batch-corrections.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const pretty = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(3).replace(/\.?0+$/, '') : '—';
const candidateTitle = (entry) => {
  if (!entry) return 'No qualified suggestion';
  return pretty(entry.masterWeightKg) + ' kg · ' +
    (entry.matchPct === null || entry.matchPct === undefined ? 'Unscored' : entry.matchPct + '%') +
    ' · ' + (entry.title || entry.method || 'Master row');
};

export function installFinalRigidBatchControls({
  overlay, inventory, plans, getEditedValues, getCurrentResult,
  stageAndVerify, isReady,
}) {
  const tableScroller = overlay.querySelector('table')?.parentElement;
  if (!tableScroller) return;
  const toolbar = document.createElement('section');
  toolbar.setAttribute('data-final-rigid-batch-toolbar', '');
  toolbar.style.cssText = 'border:1px solid #334155;border-radius:7px;margin:8px 0;padding:9px;background:#111e32;color:#dbeafe;';
  toolbar.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">' +
    '<strong>Batch Weight Correction</strong>' +
    '<label>Absolute error threshold ± <input type="number" data-final-rigid-batch-threshold min="0" max="100000" step="1" value="40" style="width:66px;padding:5px;background:#0b1220;border:1px solid #475569;color:#fff;border-radius:4px;"> %</label>' +
    '<label>Scope <select data-final-rigid-batch-scope style="padding:5px;background:#0b1220;border:1px solid #475569;color:#fff;border-radius:4px;">' +
    '<option value="all">All RIGIDs</option><option value="filtered">Filtered rows</option><option value="selected">Selected rows</option></select></label>' +
    '<label title="Unverified source owner or approximate catalog estimates require manual approval">' +
    '<input type="checkbox" data-final-rigid-batch-review-only> Include approximate / unverified nearest</label>' +
    '<button type="button" data-final-rigid-batch-preview style="cursor:pointer;padding:7px 11px;border:1px solid #3b82f6;background:#1d4ed8;color:#fff;border-radius:5px;">Preview Batch Corrections</button>' +
    '</div><div data-final-rigid-batch-status role="status" style="font-size:11px;color:#94a3b8;margin-top:5px;">' +
    'Preview → choose exact RIGID pointers → verify transaction → re-extract revised CII. No automatic mass approval.</div>';
  tableScroller.insertAdjacentElement('beforebegin', toolbar);

  const thresholdInput = toolbar.querySelector('[data-final-rigid-batch-threshold]');
  const scopeInput = toolbar.querySelector('[data-final-rigid-batch-scope]');
  const includeInput = toolbar.querySelector('[data-final-rigid-batch-review-only]');
  const status = toolbar.querySelector('[data-final-rigid-batch-status]');
  const preview = toolbar.querySelector('[data-final-rigid-batch-preview]');
  let dialogLayer = null;

  const snapshot = () => ({
    thresholdPct: thresholdInput.value,
    scope: scopeInput.value,
    includeReviewOnly: includeInput.checked,
    visiblePointers: [...overlay.querySelectorAll('[data-final-rigid-row]')].filter((r) => !r.hidden).map((r) => Number(r.dataset.pointer)),
    selectedPointers: [...overlay.querySelectorAll('[data-final-rigid-row]')].filter((r) =>
      r.querySelector('[data-final-rigid-select]')?.checked).map((r) => Number(r.dataset.pointer)),
    currentEditedValues: getEditedValues(),
    selectedIndices: new Map([...overlay.querySelectorAll('[data-final-rigid-suggestion]')].filter((select) =>
      select.value !== '').map((select) =>
      [Number(select.getAttribute('data-final-rigid-suggestion')), Number(select.value)])),
  });
  const close = () => { dialogLayer?.remove(); dialogLayer = null; };
  overlay.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && dialogLayer) { ev.stopImmediatePropagation(); ev.preventDefault(); close(); }
  }, true);
  preview.addEventListener('click', () => {
    close();
    if (!isReady() || !getCurrentResult()) {
      status.textContent = 'REFUSED: Weight editor is not ready or conversion run changed.';
      return;
    }
    const base = snapshot();
    let plan;
    try { plan = planFinalRigidBatchCorrections(inventory, plans, base); }
    catch (error) { status.textContent = 'REFUSED: ' + error.message; return; }

    // A fresh review must never inherit stale decisions from a prior preview.
    const selections = new Set();
    const candidateIndices = new Map(base.selectedIndices);
    const recalc = () => planFinalRigidBatchCorrections(inventory, plans, {
      ...base, selectedIndices: candidateIndices,
    });
    dialogLayer = document.createElement('div');
    dialogLayer.setAttribute('data-final-rigid-batch-dialog', '');
    dialogLayer.setAttribute('role', 'dialog');
    dialogLayer.setAttribute('aria-modal', 'true');
    dialogLayer.setAttribute('aria-label', 'Review batch weight corrections');
    dialogLayer.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#030712df;display:flex;align-items:center;justify-content:center;padding:18px;';
    dialogLayer.innerHTML = '<div style="background:#0f172a;color:#e2e8f0;border:1px solid #64748b;border-radius:8px;' +
      'padding:15px;max-width:1200px;width:97%;max-height:88vh;display:flex;flex-direction:column;gap:10px;">' +
      '<h3 style="margin:0;">Preview Batch Weight Corrections</h3>' +
      '<p style="margin:0;font-size:12px;color:#fbbf24;">A nearest catalog suggestion is not a proven physical mass. Confirm each proposed pointer. Unverified or approximate estimates require explicit approval. No CII output changes at this stage.</p>' +
      '<div data-final-rigid-batch-summary role="status" style="font-size:12px;color:#dbeafe;"></div>' +
      '<label style="font-size:12px;"><input type="checkbox" data-final-rigid-batch-show-held> Show held / below-threshold rows</label>' +
      '<div style="overflow:auto;flex:1;border:1px solid #334155;border-radius:5px;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">' +
      '<thead><tr style="position:sticky;top:0;background:#1e293b;">' +
      ['Approve', 'RIGID', 'Element / FROM → TO', 'Original CII units', 'Nearest suggestion (kg / score)',
        'Proposed CII units', 'Error %', 'Decision / evidence'].map((s) =>
        '<th style="padding:8px;white-space:nowrap;">' + s + '</th>').join('') +
      '</tr></thead><tbody data-final-rigid-batch-rows></tbody></table></div>' +
      '<label style="color:#fbbf24;font-size:12px;"><input type="checkbox" data-final-rigid-batch-confirm-review>' +
      ' I reviewed the selected approximate / unverified proposals and accept them as explicit weight corrections.</label>' +
      '<div style="display:flex;justify-content:flex-end;gap:9px;">' +
      '<button type="button" data-final-rigid-batch-cancel style="padding:8px;border:1px solid #475569;border-radius:5px;background:#1e293b;color:#fff;cursor:pointer;">Cancel</button>' +
      '<button type="button" data-final-rigid-batch-stage disabled style="padding:8px 12px;border:none;border-radius:5px;background:#1d4ed8;color:#fff;cursor:pointer;">Stage & Verify Selected Corrections</button>' +
      '</div></div>';
    overlay.append(dialogLayer);
    const summary = dialogLayer.querySelector('[data-final-rigid-batch-summary]');
    const body = dialogLayer.querySelector('[data-final-rigid-batch-rows]');
    const showHeld = dialogLayer.querySelector('[data-final-rigid-batch-show-held]');
    const confirm = dialogLayer.querySelector('[data-final-rigid-batch-confirm-review]');
    const stage = dialogLayer.querySelector('[data-final-rigid-batch-stage]');
    const candidateFor = (row) => plans[row.pointer - 1]?.nearestSuggestions || [];

    function updateStage() {
      const current = recalc();
      const chosen = current.eligible.filter((r) => selections.has(r.pointer));
      const needsApproval = chosen.some((r) => r.reviewRequired);
      stage.disabled = !chosen.length || (needsApproval && !confirm.checked);
      summary.textContent = current.eligible.length + ' eligible · ' + current.held.length +
        ' held/review-only · ' + current.belowThreshold.length + ' below threshold · ' +
        chosen.length + ' selected · ' +
        (needsApproval && !confirm.checked ? 'review approval required' : 'no exported weights changed');
    }

    function render() {
      const current = recalc();
      body.innerHTML = current.proposals
        .filter((row) => showHeld.checked ||
          (row.errorPct !== null && Math.abs(row.errorPct) > current.thresholdPct &&
            row.status !== 'OUT_OF_SCOPE'))
        .map((row) => {
          const item = inventory.rows[row.pointer - 1];
          const element = item?.linkedElements?.[0];
          const available = candidateFor(row);
          const options = available.map((candidate, i) =>
            '<option value="' + i + '"' + (row.candidateIndex === i ? ' selected' : '') + '>' +
            esc(candidateTitle(candidate)) + (candidate.approximate ? ' · approximate' : '') +
            '</option>').join('');
          const approved = row.status === 'ELIGIBLE';
          if (!approved) selections.delete(row.pointer);
          const cell = (s) => '<td style="padding:7px;border-bottom:1px solid #26364b;vertical-align:top;">' + s + '</td>';
          const checked = approved && selections.has(row.pointer);
          const badge = row.reviewRequired ? 'REVIEW · ' : '';
          return '<tr data-final-rigid-batch-row="' + row.pointer + '">' +
            cell('<input type="checkbox" data-final-rigid-batch-approve="' + row.pointer + '"' +
              (checked ? ' checked' : '') + (approved ? '' : ' disabled') +
              ' aria-label="Approve RIGID pointer ' + row.pointer + '">') +
            cell(String(row.pointer)) +
            cell(esc(element ? '#' + element.index + ' · ' + element.fromNode + ' → ' + element.toNode : 'Unreferenced')) +
            cell(esc(pretty(row.originalWeight))) +
            cell(available.length ? '<select data-final-rigid-batch-candidate="' + row.pointer +
              '" style="max-width:260px;background:#0b1220;border:1px solid #475569;color:#fff;border-radius:4px;padding:4px;">' +
              options + '</select>' : '—') +
            cell(esc(pretty(row.proposedWeight))) +
            cell(row.errorPct === null ? '—' : esc((row.errorPct >= 0 ? '+' : '') + row.errorPct.toFixed(1) + '%')) +
            cell('<span style="color:' + (approved ? '#86efac' : '#fbbf24') + ';">' +
              esc(badge + row.status) + '</span><div title="' +
              esc(row.candidate?.basis || row.reason) +
              '" style="max-width:240px;white-space:normal;font-size:10px;">' +
              esc(row.reason) + (row.candidate ? '<div>' +
                esc(row.candidate.method + ' · ' + (row.candidate.source || 'unidentified master row')) +
                '</div>' : '') + '</div>') + '</tr>';
        }).join('') || '<tr><td colspan="8" style="padding:14px;">No qualifying RIGIDs for this scope and threshold.</td></tr>';
      updateStage();
    }
    showHeld.addEventListener('change', render);
    dialogLayer.querySelector('[data-final-rigid-batch-cancel]').addEventListener('click', close);
    confirm.addEventListener('change', updateStage);
    body.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('[data-final-rigid-batch-approve]')) {
        const pointer = Number(target.getAttribute('data-final-rigid-batch-approve'));
        if (target.checked) selections.add(pointer); else selections.delete(pointer);
        updateStage();
      } else if (target.matches('[data-final-rigid-batch-candidate]')) {
        const pointer = Number(target.getAttribute('data-final-rigid-batch-candidate'));
        candidateIndices.set(pointer, Number(target.value));
        selections.delete(pointer);
        confirm.checked = false;
        render();
      }
    });
    stage.addEventListener('click', async () => {
      updateStage();
      if (stage.disabled || !isReady()) return;
      const current = recalc();
      const chosen = current.eligible.filter((r) => selections.has(r.pointer));
      if (!chosen.length || chosen.some((r) => r.reviewRequired) && !confirm.checked) return;
      stage.disabled = true;
      summary.textContent = 'Verifying exact RIGID pointer edits, full CII reparse and untouched-byte parity…';
      try {
        await stageAndVerify(chosen, current.thresholdPct, confirm.checked);
        status.textContent = 'Batch VERIFIED: ' + chosen.length +
          ' selected corrections staged. Click Apply Changes & Re-extract CII, then Download Revised CII.';
        close();
      } catch (error) {
        summary.textContent = 'REFUSED: ' + (error?.message || error) + '. No batch changes were staged.';
        updateStage();
      }
    });
    render();
    dialogLayer.querySelector('[data-final-rigid-batch-cancel]').focus();
  });
  return { toolbar, close };
}
