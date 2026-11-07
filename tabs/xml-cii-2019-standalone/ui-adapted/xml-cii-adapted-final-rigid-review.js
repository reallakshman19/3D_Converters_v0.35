import { buildFinalRigidReferencePlans } from '../xml-cii-final-rigid-master-references.js';
import { classifyFinalRigidWeightError, configuredFinalRigidErrorThreshold, formatFinalRigidErrorPercent } from '../xml-cii-final-rigid-weight-error.js';
import { parseFinalCiiRigidInventory } from '../xml-cii-final-rigid-inventory.js';

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function ciiEvidence(result) {
  return result?.ok === true && typeof result.ciiText === 'string' && result.ciiText.trim()
    ? result.ciiText : '';
}

export function finalRigidReviewAvailable(state) {
  return !state?.running && Boolean(ciiEvidence(state?.result));
}

function rowMarkup(row, plan) {
  const linked = row.linkedElements;
  const elementIds = linked.map((element) => element.index).join(', ') || '—';
  const fromNodes = linked.map((element) => element.fromNode).join(', ') || '—';
  const toNodes = linked.map((element) => element.toNode).join(', ') || '—';
  const lengths = linked.map((element) => Number(element.lengthMm.toFixed(3))).join(', ') || '—';
  const suggestions = plan?.candidates || [];
  const auto = plan?.autoIndex >= 0 ? suggestions[plan.autoIndex] : null;
  const suggestionOptions = [
    '<option value="">Choose a catalog reference…</option>',
    ...suggestions.map((entry, index) => `<option value="${index}" ${index === plan.autoIndex ? 'selected' : ''}>${esc(entry.referenceWeight)} exported · ${esc(entry.title)} · ${esc(entry.method)}</option>`),
  ].join('');
  const basisReason = plan?.reason || 'No run-pinned source-to-CII evidence.';
  const mapping = plan?.mapping;
  const trace = [mapping ? `CII branch ${mapping.branchName} · edge ${mapping.fromNode} → ${mapping.toNode} · ComponentRefNo ${mapping.componentRefNo || '(absent)'} · source span ${Number(mapping.sourceLengthMm).toFixed(3)} mm · CII span ${Number(mapping.ciiLengthMm).toFixed(3)} mm · engine input ${mapping.engineInputDigest || '(digest unavailable)'}` : '', basisReason].filter(Boolean).join('\n');
  const search = [row.rigidPointer, row.weight, row.rawWeight, row.status,
    elementIds, fromNodes, toNodes, lengths].join(' ').toLowerCase();
  const cell = (value) => `<td style="padding:9px;border-bottom:1px solid #26364b;white-space:nowrap;">${esc(value)}</td>`;
  const status = [
    !linked.length ? 'Unreferenced pointer' : (linked.length > 1 ? 'Shared by multiple elements' : 'Linked'),
    row.weight <= 0 ? 'Zero / negative weight' : '',
  ].filter(Boolean).join(' · ');
  return `<tr data-final-rigid-row data-pointer="${row.rigidPointer}" data-search="${esc(search)}" data-status="${esc(row.status)}"
    data-nonpositive="${row.weight <= 0}">
    ${cell(row.rigidPointer)}${cell(elementIds)}${cell(fromNodes)}${cell(toNodes)}
    ${cell(lengths)}${cell(row.rawWeight)}
    <td style="padding:7px;border-bottom:1px solid #26364b;">
      <select data-final-rigid-suggestion="${row.rigidPointer}" aria-label="Catalog suggestions for RIGID pointer ${row.rigidPointer}"
        style="width:230px;background:#0b1220;color:#e2e8f0;border:1px solid #475569;border-radius:4px;padding:5px;margin-bottom:3px;">
        ${suggestionOptions}
      </select>
      <input type="number" min="0.000001" step="any" data-final-rigid-reference="${row.rigidPointer}"
        data-reference-kind="${auto ? 'auto' : ''}" value="${auto ? esc(auto.referenceWeight) : ''}"
        aria-label="Reference weight for RIGID pointer ${row.rigidPointer}"
        placeholder="ref required" style="width:105px;background:#0b1220;color:#e2e8f0;border:1px solid #475569;border-radius:4px;padding:5px;">
    </td>
    <td data-final-rigid-error="${row.rigidPointer}" style="padding:9px;border-bottom:1px solid #26364b;">—</td>
    <td style="padding:8px;border-bottom:1px solid #26364b;min-width:240px;">
      <div data-final-rigid-basis-summary="${row.rigidPointer}" style="color:#93c5fd;">
        ${esc(auto ? 'AUTO · unique exact master reference' : suggestions.length ? suggestions.length + ' master suggestions · choose' : 'Not assessed')}
      </div>
      <details><summary style="cursor:pointer;color:#cbd5e1;">Evidence / calculation basis</summary>
        <pre data-final-rigid-basis-detail="${row.rigidPointer}" style="white-space:pre-wrap;font-size:11px;max-width:310px;">${esc([trace, auto?.basis || ''].filter(Boolean).join('\n'))}</pre>
      </details>
    </td>
    ${cell(status)}</tr>`;
}

function modalMarkup(inventory, filename, thresholdPct = 20, plans = []) {
  const { rows, declared, unreferencedCount, sharedCount, nonpositiveCount } = inventory;
  return `<div class="mc-rigid-review-dialog" role="dialog" aria-modal="true"
      aria-label="Review final CII rigid weights" tabindex="-1"
      style="background:#0f172a;color:#e2e8f0;border:1px solid #253a55;border-radius:8px;
        padding:18px;max-width:1350px;width:96%;max-height:90vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;
      padding-bottom:12px;border-bottom:1px solid #253a55;margin-bottom:12px;">
      <div>
        <div style="font-size:18px;font-weight:700;color:#9cc5ff;">Review Final weight — Emitted CII RIGID</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${esc(filename)}
          · ${rows.length} RIGID pointers · ${declared.elements} final elements
          · ${unreferencedCount} unreferenced · ${sharedCount} shared
          · ${nonpositiveCount} zero/negative weights</div>
      </div>
      <button type="button" data-final-rigid-close style="padding:7px 12px;background:#1e293b;
        border:1px solid #475569;color:#e2e8f0;border-radius:6px;cursor:pointer;">Close</button>
    </div>
    <div style="background:#2a210b;border:1px solid #7c5a18;border-radius:6px;padding:9px;
      font-size:12px;color:#ffe7a3;margin-bottom:12px;">
      Read-only final CII output, not source XML or proposed weights. RIGID Pointer is the
      1-based index into the final RIGID section, read from each ELEMENTS record's 13th line,
      second field. Weight is the exact exported first-field value in the CII file
      (output mass/force units depend on the conversion setting). Length is computed
      from final CII DX/DY/DZ in mm. Error % uses (exported - reference) / reference × 100,
      following the existing Weight Validator's deviation formula. Enter a trusted
      per-pointer reference in the SAME output units; without one Error % stays —.
      Master suggestions below require exact branch, edge, geometry, component and
      catalog-basis evidence. Only a unique semantic and exact match is preselected.
      A shared physical ComponentRefNo cannot auto-assign one physical mass to
      multiple CII rigids. Open the basis for source/catalog details.
      The weight validation threshold is separate from the 0.65–1.60 length-extrapolation gate.
      No values or comparison references are saved or applied here.
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
      <input type="search" data-final-rigid-search placeholder="Search pointer / element / FROM / TO / weight"
        style="background:#0b1220;color:#e2e8f0;border:1px solid #475569;border-radius:5px;
          padding:7px;min-width:300px;">
      <select data-final-rigid-filter style="background:#0b1220;color:#e2e8f0;border:1px solid #475569;
        border-radius:5px;padding:7px;">
        <option value="all">All final rigids</option>
        <option value="LINKED">Linked</option>
        <option value="ZERO_OR_NEGATIVE">Zero / negative weight</option>
        <option value="SHARED_POINTER">Shared pointer</option>
        <option value="UNREFERENCED">Unreferenced</option>
        <option value="OVER_LIMIT">Beyond error limit (references only)</option>
      </select>
      <label style="display:flex;align-items:center;gap:5px;color:#cbd5e1;font-size:12px;">
        Error limit ±<input type="number" data-final-rigid-limit min="0" step="1" value="${esc(thresholdPct)}"
          aria-label="Weight error limit percent" style="width:65px;padding:6px;background:#0b1220;color:#e2e8f0;border:1px solid #475569;border-radius:5px;">%
      </label>
      <span data-final-rigid-visible style="color:#94a3b8;font-size:12px;"></span>
    </div>
    <div data-final-rigid-assessment role="status"
      style="margin:0 0 10px;color:#cbd5e1;font-size:12px;">
      Reference-based weight error not assessed until independent weights are supplied.
    </div>
    <div style="max-height:52vh;overflow:auto;border:1px solid #334155;border-radius:6px;">
      <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12px;">
        <thead><tr style="position:sticky;top:0;background:#1e293b;">
          ${['Rigid pointer', 'Element #', 'FROM node', 'TO node', 'Element length (mm)',
            'Final CII weight (as exported)', 'Reference suggestions (same units)', 'Error %', 'Basis / evidence', 'Status'].map((item) =>
              `<th style="padding:9px;white-space:nowrap;">${item}</th>`).join('')}
        </tr></thead>
        <tbody>${rows.map((row, index) => rowMarkup(row, plans[index])).join('')}</tbody>
      </table>
      ${rows.length ? '' : '<div style="padding:14px;">Final CII contains zero RIGID records.</div>'}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <button type="button" data-final-rigid-close style="background:#1d4ed8;color:#fff;
        border:0;border-radius:6px;padding:9px 16px;cursor:pointer;">Close Review</button>
    </div>
  </div>`;
}

function errorMarkup(error) {
  const container = document.createElement('div');
  container.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'mc-rigid-review-dialog';
  dialog.style.cssText = 'background:#0f172a;color:#fecaca;border:1px solid #b91c1c;border-radius:8px;padding:20px;max-width:760px;width:90%;';
  const title = document.createElement('strong');
  title.textContent = 'Review Final weight — could not parse final CII';
  const explanation = document.createElement('p');
  explanation.textContent = error?.message || String(error);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => container.remove());
  dialog.append(title, explanation, close);
  container.appendChild(dialog);
  document.body.appendChild(container);
}

export function openFinalRigidWeightReview(result, options = {}) {
  if (!ciiEvidence(result)) return false;
  let inventory;
  try { inventory = parseFinalCiiRigidInventory(result.ciiText); }
  catch (error) { errorMarkup(error); return false; }
  const overlay = document.createElement('div');
  overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
  let plans;
  try { plans = buildFinalRigidReferencePlans(inventory, result.finalRigidReviewEvidence); }
  catch (error) {
    plans = inventory.rows.map((row) => ({
      rigidPointer: row.rigidPointer, candidates: [], autoIndex: -1,
      reason: 'Catalog reference lookup failed: ' + (error?.message || String(error)),
    }));
  }
  overlay.innerHTML = modalMarkup(inventory, result.ciiName || 'Generated CII', options.errorThresholdPct ?? 20, plans);
  document.body.appendChild(overlay);
  const search = overlay.querySelector('[data-final-rigid-search]');
  const filter = overlay.querySelector('[data-final-rigid-filter]');
  const visible = overlay.querySelector('[data-final-rigid-visible]');
  const assessment = overlay.querySelector('[data-final-rigid-assessment]');
  const limitInput = overlay.querySelector('[data-final-rigid-limit]');
  const refresh = () => {
    const q = String(search?.value || '').trim().toLowerCase();
    const choice = filter?.value || 'all';
    let count = 0;
    let assessed = 0;
    let overLimit = 0;
    overlay.querySelectorAll('[data-final-rigid-row]').forEach((tr) => {
      const pointer = Number(tr.dataset.pointer);
      const refInput = tr.querySelector('[data-final-rigid-reference]');
      const reference = refInput?.value || '';
      const actual = inventory.rows[pointer - 1]?.weight;
      const comparison = classifyFinalRigidWeightError(actual, reference, limitInput?.value);
      const errorCell = tr.querySelector('[data-final-rigid-error]');
      if (errorCell) {
        errorCell.textContent = formatFinalRigidErrorPercent(comparison.errorPct);
        errorCell.style.color = comparison.outside ? '#fca5a5' : '#cbd5e1';
        errorCell.title = comparison.errorPct === null ? 'Reference required, in final CII output units'
          : (comparison.outside ? 'Outside selected error limit' : 'Within selected error limit');
      }
      const plan = plans[pointer - 1];
      const candidate = plan?.candidates?.[Number(tr.querySelector('[data-final-rigid-suggestion]')?.value)];
      const basisSummary = tr.querySelector('[data-final-rigid-basis-summary]');
      const basisDetail = tr.querySelector('[data-final-rigid-basis-detail]');
      const isSelection = Boolean(tr.querySelector('[data-final-rigid-suggestion]')?.value !== ''
        && refInput?.dataset.referenceKind !== 'manual' && candidate);
      if (basisSummary) basisSummary.textContent =
        comparison.errorPct === null ? (plan?.reason || 'No independent catalog reference')
        : isSelection ? (refInput?.dataset.referenceKind === 'auto'
          ? 'AUTO · exact catalog comparison' : 'SELECTED · catalog comparison (review)')
          : 'MANUAL · reference comparison (not catalog verified)';
      if (basisDetail && isSelection) basisDetail.textContent = [
        plan?.reason || '', plan?.mapping ? `Source ${plan.mapping.branchName} ${plan.mapping.fromNode} → ${plan.mapping.toNode}; ComponentRefNo ${plan.mapping.componentRefNo || 'none'}; CII ${Number(plan.mapping.ciiLengthMm).toFixed(3)} mm` : '',
        candidate.basis, 'Error % = 100 × (final CII weight − reference weight) / reference weight',
      ].filter(Boolean).join('\n');
      if (comparison.errorPct !== null) assessed += 1;
      if (comparison.outside === true) overLimit += 1;
      tr.dataset.outsideError = String(comparison.outside === true);
      const matchesStatus = choice === 'all'
        || (choice === 'OVER_LIMIT' ? tr.dataset.outsideError === 'true'
          : choice === 'ZERO_OR_NEGATIVE' ? tr.dataset.nonpositive === 'true'
          : tr.dataset.status === choice);
      const display = (!q || (tr.dataset.search || '').includes(q)) && matchesStatus;
      tr.hidden = !display;
      if (display) count += 1;
    });
    if (visible) visible.textContent = `${count} of ${inventory.rows.length} final rigids`;
    if (assessment) {
      const missing = inventory.rows.length - assessed;
      assessment.textContent = `${assessed} reference-based comparisons · ${missing} not assessed · ${overLimit} outside selected ±${limitInput?.value || '20'}% limit. No output weights changed.`;
    }
  };
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-final-rigid-close]').forEach((button) =>
    button.addEventListener('click', close));
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  overlay.querySelectorAll('[data-final-rigid-suggestion]').forEach((select) =>
    select.addEventListener('change', () => {
      const pointer = Number(select.getAttribute('data-final-rigid-suggestion'));
      const plan = plans[pointer - 1];
      const candidate = select.value === '' ? null : plan?.candidates?.[Number(select.value)];
      const tr = select.closest('[data-final-rigid-row]');
      const input = tr?.querySelector('[data-final-rigid-reference]');
      if (!input) return;
      input.value = candidate ? String(candidate.referenceWeight) : '';
      input.dataset.referenceKind = candidate ? 'selected' : '';
      const detail = tr?.querySelector('[data-final-rigid-basis-detail]');
      if (detail && !candidate) detail.textContent = plan?.reason || 'No qualified reference.';
      refresh();
    }));
  overlay.querySelectorAll('[data-final-rigid-reference]').forEach((input) =>
    input.addEventListener('input', () => {
      input.dataset.referenceKind = 'manual';
      const tr = input.closest('[data-final-rigid-row]');
      const select = tr?.querySelector('[data-final-rigid-suggestion]');
      if (select) select.value = '';
      const detail = tr?.querySelector('[data-final-rigid-basis-detail]');
      if (detail) detail.textContent = 'User-entered comparison reference. Verify independent source and exported units.';
      refresh();
    }));
  limitInput?.addEventListener('input', refresh);
  search?.addEventListener('input', refresh);
  filter?.addEventListener('change', refresh);
  refresh();
  search?.focus();
  return true;
}

export function createFinalRigidWeightReviewButton(state) {
  const available = finalRigidReviewAvailable(state);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Review Final weight';
  button.dataset.action = 'review-final-weight';
  button.className = 'model-converters-download-btn';
  button.disabled = !available;
  button.title = available ? 'Review every RIGID pointer and its exported CII weight'
    : 'Run a successful CII conversion first to enable final rigid review.';
  button.style.cssText = 'width:100%;padding:12px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;font-weight:700;cursor:pointer;';
  button.addEventListener('click', () => openFinalRigidWeightReview(state.result, {
    errorThresholdPct: configuredFinalRigidErrorThreshold(state.supportConfigJson),
  }));
  return button;
}
