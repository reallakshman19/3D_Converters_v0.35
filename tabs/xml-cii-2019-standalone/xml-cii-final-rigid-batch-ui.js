/**
 * Explicit two-gate UI for threshold-based FINAL CII weight corrections.
 * Preview is read-only. Apply Nearest only prepares candidates; an explicit
 * Approve All Eligible click may authorize both ELIGIBLE and reviewable WARNING
 * rows as FINAL-CII edits. Structural HOLD/ALREADY_EDITED rows stay excluded.
 * Source XML ownership authority is a separate transaction.
 */
import {
  planFinalRigidBatchCorrections, prepareNearestFinalRigidBatchPreview,
} from './xml-cii-final-rigid-batch-corrections.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const pretty = (v) => v === null || v === undefined || String(v).trim() === '' ? '—' :
  Number.isFinite(Number(v)) ? Number(v).toFixed(3).replace(/\.?0+$/, '') : '—';
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
    '<button type="button" data-final-rigid-batch-preview style="cursor:pointer;padding:7px 11px;border:1px solid #3b82f6;background:#1d4ed8;color:#fff;border-radius:5px;">Preview Batch Corrections</button>' +
    '</div><div data-final-rigid-batch-status role="status" style="font-size:11px;color:#94a3b8;margin-top:5px;">' +
    'Preview → Apply Nearest suggestion → Approve All Eligible (including reviewable WARNINGS) → Stage & Verify → Apply Changes & Re-extract CII → Download Revised CII. Source XML edits are separate.</div>';
  tableScroller.insertAdjacentElement('beforebegin', toolbar);

  const thresholdInput = toolbar.querySelector('[data-final-rigid-batch-threshold]');
  const scopeInput = toolbar.querySelector('[data-final-rigid-batch-scope]');
  const status = toolbar.querySelector('[data-final-rigid-batch-status]');
  const preview = toolbar.querySelector('[data-final-rigid-batch-preview]');
  let dialogLayer = null;

  const snapshot = () => ({
    thresholdPct: thresholdInput.value,
    scope: scopeInput.value,
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
    const bulkApprovedPointers = new Set();
    let nearestPrepared = false;
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
      '<p style="margin:0;font-size:12px;color:#fbbf24;">Apply Nearest prepares candidates without editing CII. Approve All Eligible explicitly accepts the proposed FINAL-CII weights, including WARNING/approximate suggestions; hard HOLD and pre-edited rows remain excluded. Source XML is not changed.</p>' +
      '<div data-final-rigid-batch-summary role="status" style="font-size:12px;color:#dbeafe;"></div>' +
       '<div data-final-rigid-batch-error role="alert" aria-live="assertive" style="display:none;white-space:pre-wrap;font-size:12px;color:#fecaca;background:#451a1a;border:1px solid #ef4444;padding:9px;border-radius:5px;"></div>' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:12px;">' +
      '<button type="button" data-final-rigid-batch-apply-nearest title="Use the top-ranked suggestion in preview only; no weights approved or staged" ' +
      'style="cursor:pointer;background:#1e293b;color:#dbeafe;padding:6px 10px;border-radius:5px;' +
      'border:1px solid #60a5fa;">Apply Nearest suggestion</button>' +
      '<button type="button" data-final-rigid-batch-approve-all disabled style="cursor:pointer;background:#1d4ed8;color:#fff;' +
      'padding:6px 10px;border-radius:5px;border:1px solid #60a5fa;">✓ Approve All Eligible (0)</button>' +
      '<button type="button" data-final-rigid-batch-clear-all disabled style="cursor:pointer;background:#1e293b;color:#e2e8f0;' +
      'padding:6px 10px;border-radius:5px;border:1px solid #475569;">Clear Selection</button>' +
      '</div><label style="font-size:12px;"><input type="checkbox" data-final-rigid-batch-show-held> Show held / review-only rows</label>' +
      '<div style="overflow:auto;flex:1;border:1px solid #334155;border-radius:5px;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">' +
      '<thead><tr style="position:sticky;top:0;background:#1e293b;">' +
      ['<label title="Select/deselect all eligible or, after Apply Nearest, reviewable WARNING RIGIDs in the selected scope">' +
        '<input type="checkbox" data-final-rigid-batch-approve-all-checkbox disabled ' +
        'aria-label="Approve all eligible RIGID pointers"> All eligible</label>',
        'RIGID', 'Element / FROM → TO', 'Element Length (mm)', 'Original CII units', 'Nearest suggestion (kg / score)',
        'Proposed CII units', 'Error %', 'Decision / evidence'].map((s) =>
        '<th style="padding:8px;white-space:nowrap;">' + s + '</th>').join('') +
      '</tr></thead><tbody data-final-rigid-batch-rows></tbody></table></div>' +
      '<label style="color:#fbbf24;font-size:12px;"><input type="checkbox" data-final-rigid-batch-confirm-review>' +
      ' I reviewed selected warning / approximate / unverified suggestions and explicitly approve their proposed CII weight corrections.</label>' +
      '<div style="display:flex;justify-content:flex-end;gap:9px;">' +
      '<button type="button" data-final-rigid-batch-cancel style="padding:8px;border:1px solid #475569;border-radius:5px;background:#1e293b;color:#fff;cursor:pointer;">Cancel</button>' +
      '<button type="button" data-final-rigid-batch-stage disabled style="padding:8px 12px;border:none;border-radius:5px;background:#1d4ed8;color:#fff;cursor:pointer;">Stage & Verify Selected Corrections</button>' +
      '</div></div>';
    overlay.append(dialogLayer);
    const summary = dialogLayer.querySelector('[data-final-rigid-batch-summary]');
    const errorMessage = dialogLayer.querySelector('[data-final-rigid-batch-error]');
    const clearError = () => {
      errorMessage.style.display = 'none';
      errorMessage.textContent = '';
    };
    const showError = (error) => {
      const detail = String(error?.message || error || 'Unknown verification error');
      errorMessage.textContent = 'Batch verification refused: ' + detail +
        '\nNo weights were changed. Keep or adjust your selected rows, then retry.' +
        '\nFor diagnosis, choose a smaller batch scope or export the change report.';
      errorMessage.style.display = 'block';
      status.textContent = 'Batch NOT STAGED: ' + detail;
    };
    const body = dialogLayer.querySelector('[data-final-rigid-batch-rows]');
    const showHeld = dialogLayer.querySelector('[data-final-rigid-batch-show-held]');
    const applyNearest = dialogLayer.querySelector('[data-final-rigid-batch-apply-nearest]');
    const approveAll = dialogLayer.querySelector('[data-final-rigid-batch-approve-all]');
    const clearAll = dialogLayer.querySelector('[data-final-rigid-batch-clear-all]');
    const approveAllCheckbox = dialogLayer.querySelector('[data-final-rigid-batch-approve-all-checkbox]');
    const confirm = dialogLayer.querySelector('[data-final-rigid-batch-confirm-review]');
    const stage = dialogLayer.querySelector('[data-final-rigid-batch-stage]');
    const candidateFor = (row) => plans[row.pointer - 1]?.nearestSuggestions || [];

    function updateStage() {
      const current = recalc();
      const selectable = [...current.eligible, ...current.warnings];
      const bulkSelectable = nearestPrepared ? selectable : current.eligible;
      const bulkIds = new Set(bulkSelectable.map((r) => r.pointer));
      const eligibleIds = new Set(selectable.map((r) => r.pointer));
      // Never retain a prior bulk selection if its candidate/eligibility changed.
      for (const pointer of selections) if (!eligibleIds.has(pointer)) {
        selections.delete(pointer);
        bulkApprovedPointers.delete(pointer);
      }
      const chosen = selectable.filter((r) => selections.has(r.pointer));
      for (const pointer of bulkApprovedPointers) if (!selections.has(pointer)) bulkApprovedPointers.delete(pointer);
      const needsApproval = chosen.some((r) => r.reviewRequired);
      stage.disabled = !chosen.length || (needsApproval && !confirm.checked);
      approveAll.disabled = bulkSelectable.length === 0;
      approveAll.textContent = '✓ Approve All Eligible (' + bulkSelectable.length + ')';
      approveAllCheckbox.disabled = bulkSelectable.length === 0;
      const bulkSelected = bulkSelectable.filter((r) => selections.has(r.pointer)).length;
      approveAllCheckbox.checked = bulkSelectable.length > 0 &&
        bulkSelected === bulkSelectable.length;
      approveAllCheckbox.indeterminate = bulkSelected > 0 &&
        bulkSelected < bulkSelectable.length;
      clearAll.disabled = chosen.length === 0;
      const hardHoldCount = current.proposals.filter((r) =>
        r.status === 'HOLD' || r.status === 'ALREADY_EDITED').length;
      summary.textContent = current.eligible.length + ' eligible · ' +
        current.warnings.length + ' warnings (bulk after Apply Nearest) · ' +
        hardHoldCount + ' hard-held · ' + current.belowThreshold.length +
        ' within threshold · ' + chosen.length + ' selected · ' +
        (needsApproval && !confirm.checked ? 'review acknowledgement required' :
          'no exported weights changed');
    }

    function render() {
      const current = recalc();
      body.innerHTML = current.proposals
        .filter((row) => showHeld.checked || row.status === 'WARNING' ||
          (row.errorPct !== null && Math.abs(row.errorPct) > current.thresholdPct &&
            row.status !== 'OUT_OF_SCOPE'))
        .map((row) => {
          const item = inventory.rows[row.pointer - 1];
          const element = item?.linkedElements?.[0];
          const lengthMm = item?.linkedElements?.length === 1 &&
            element?.lengthMm !== null && element?.lengthMm !== undefined &&
            Number.isFinite(Number(element.lengthMm)) && Number(element.lengthMm) >= 0
            ? pretty(element.lengthMm) : '—';
          const available = candidateFor(row);
          const options = available.map((candidate, i) =>
            '<option value="' + i + '"' + (row.candidateIndex === i ? ' selected' : '') + '>' +
            esc(candidateTitle(candidate)) + (candidate.approximate ? ' · approximate' : '') +
            '</option>').join('');
          const approved = row.status === 'ELIGIBLE' || row.status === 'WARNING';
          if (!approved) selections.delete(row.pointer);
          const cell = (s) => '<td style="padding:7px;border-bottom:1px solid #26364b;vertical-align:top;">' + s + '</td>';
          const checked = approved && selections.has(row.pointer);
          const badge = row.status === 'WARNING' ? '⚠ REVIEW · ' :
            row.reviewRequired ? 'REVIEW · ' : '';
          return '<tr data-final-rigid-batch-row="' + row.pointer + '">' +
            cell('<input type="checkbox" data-final-rigid-batch-approve="' + row.pointer + '"' +
              (checked ? ' checked' : '') + (approved ? '' : ' disabled') +
              ' aria-label="Approve RIGID pointer ' + row.pointer + '">') +
            cell(String(row.pointer)) +
            cell(esc(element ? '#' + element.index + ' · ' + element.fromNode + ' → ' + element.toNode : 'Unreferenced')) +
            cell(esc(lengthMm)) +
            cell(esc(pretty(row.originalWeight))) +
            cell(available.length ? '<select data-final-rigid-batch-candidate="' + row.pointer +
              '" style="max-width:260px;background:#0b1220;border:1px solid #475569;color:#fff;border-radius:4px;padding:4px;">' +
              options + '</select>' : '—') +
            cell(esc(pretty(row.proposedWeight))) +
            cell(row.errorPct === null ? '—' : esc((row.errorPct >= 0 ? '+' : '') + row.errorPct.toFixed(1) + '%')) +
            cell('<span style="color:' + (row.status === 'WARNING' ? '#fbbf24' :
              approved ? '#86efac' : '#fbbf24') + ';">' +
              esc(badge + row.status) + '</span><div title="' +
              esc(row.candidate?.basis || row.reason) +
              '" style="max-width:240px;white-space:normal;font-size:10px;">' +
              esc(row.reason) + (row.candidate ? '<div>' +
                esc(row.candidate.method + ' · ' + (row.candidate.source || 'unidentified master row')) +
                '</div>' : '') + '</div>') + '</tr>';
        }).join('') || '<tr><td colspan="9" style="padding:14px;">No qualifying RIGIDs for this scope and threshold.</td></tr>';
      updateStage();
    }
    const selectAllEligible = (checked) => {
      clearError();
      const current = recalc();
      const bulkSelectable = nearestPrepared
        ? [...current.eligible, ...current.warnings] : current.eligible;
      selections.clear();
      bulkApprovedPointers.clear();
      if (checked) for (const proposal of bulkSelectable) {
        selections.add(proposal.pointer);
        bulkApprovedPointers.add(proposal.pointer);
      }
      // Clicking Approve All is the explicit approval action. Requiring a
      // second acknowledgement checkbox would defeat this requested workflow.
      confirm.checked = checked && bulkSelectable.length > 0;
      render();
    };
    applyNearest.addEventListener('click', () => {
      clearError();
      const prepared = prepareNearestFinalRigidBatchPreview(inventory, plans, {
        ...base, selectedIndices: candidateIndices,
      });
      candidateIndices.clear();
      for (const [pointer, index] of prepared.selectedIndices) candidateIndices.set(pointer, index);
      selections.clear();
      bulkApprovedPointers.clear();
      nearestPrepared = true;
      confirm.checked = false;
      render();
      summary.textContent = prepared.preparedCount +
        ' nearest suggestions loaded in preview · no weights selected or approved';
    });
    approveAll.addEventListener('click', () => selectAllEligible(true));
    clearAll.addEventListener('click', () => selectAllEligible(false));
    approveAllCheckbox.addEventListener('change', () =>
      selectAllEligible(approveAllCheckbox.checked));
    showHeld.addEventListener('change', render);
    dialogLayer.querySelector('[data-final-rigid-batch-cancel]').addEventListener('click', close);
    confirm.addEventListener('change', () => { clearError(); updateStage(); });
    body.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('[data-final-rigid-batch-approve]')) {
        clearError();
        const pointer = Number(target.getAttribute('data-final-rigid-batch-approve'));
        if (target.checked) selections.add(pointer); else selections.delete(pointer);
        bulkApprovedPointers.delete(pointer);
        updateStage();
      } else if (target.matches('[data-final-rigid-batch-candidate]')) {
        clearError();
        const pointer = Number(target.getAttribute('data-final-rigid-batch-candidate'));
        candidateIndices.set(pointer, Number(target.value));
        selections.delete(pointer);
        bulkApprovedPointers.delete(pointer);
        confirm.checked = false;
        render();
      }
    });
    stage.addEventListener('click', async () => {
      clearError();
      updateStage();
      if (stage.disabled || !isReady()) {
        showError(new Error(!isReady()
          ? 'Original converter/editor session is not ready or has changed.'
          : 'No valid selection or review approval remains.')); return;
      }
      const current = recalc();
      const chosen = [...current.eligible, ...current.warnings]
        .filter((r) => selections.has(r.pointer));
      if (!chosen.length || (chosen.some((r) => r.reviewRequired) && !confirm.checked)) {
        showError(new Error('No approved rows are available in the current scope.')); return;
      }
      stage.disabled = true;
      stage.textContent = 'Verifying ' + chosen.length + ' selected RIGIDs…';
      summary.textContent = 'Verifying ' + chosen.length +
        ' selected RIGIDs: exact pointers, complete CII reparse and untouched-byte parity…';
      try {
        const result = await stageAndVerify(chosen, current.thresholdPct, confirm.checked,
          new Set(bulkApprovedPointers));
        const count = result?.stagedCount ?? chosen.length;
        status.textContent = count ? 'Batch VERIFIED: ' + count +
          ' corrections staged; ' + (result?.skippedNoopPointers?.length || 0) +
          ' already-matching warning(s) unchanged. Click Apply Changes & Re-extract CII, then Download Revised CII.' :
          'No CII changes needed: selected warnings already match the original weight.';
        close();
      } catch (error) {
        updateStage();
        showError(error);
      } finally {
        stage.textContent = 'Stage & Verify Selected Corrections';
        updateStage();
      }
    });
    render();
    dialogLayer.querySelector('[data-final-rigid-batch-cancel]').focus();
  });
  return { toolbar, close };
}
