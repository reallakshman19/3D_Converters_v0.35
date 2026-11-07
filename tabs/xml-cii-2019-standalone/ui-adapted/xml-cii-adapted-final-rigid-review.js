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

function rowMarkup(row) {
  const linked = row.linkedElements;
  const elementIds = linked.map((element) => element.index).join(', ') || '—';
  const fromNodes = linked.map((element) => element.fromNode).join(', ') || '—';
  const toNodes = linked.map((element) => element.toNode).join(', ') || '—';
  const search = [row.rigidPointer, row.weight, row.rawWeight, row.status,
    elementIds, fromNodes, toNodes].join(' ').toLowerCase();
  const cell = (value) => `<td style="padding:9px;border-bottom:1px solid #26364b;white-space:nowrap;">${esc(value)}</td>`;
  const status = [
    !linked.length ? 'Unreferenced pointer' : (linked.length > 1 ? 'Shared by multiple elements' : 'Linked'),
    row.weight <= 0 ? 'Zero / negative weight' : '',
  ].filter(Boolean).join(' · ');
  return `<tr data-final-rigid-row data-search="${esc(search)}" data-status="${esc(row.status)}"
    data-nonpositive="${row.weight <= 0}">
    ${cell(row.rigidPointer)}${cell(elementIds)}${cell(fromNodes)}${cell(toNodes)}
    ${cell(row.rawWeight)}${cell(status)}</tr>`;
}

function modalMarkup(inventory, filename) {
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
      (output mass/force units depend on the conversion setting). No values are applied here.
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
      </select>
      <span data-final-rigid-visible style="color:#94a3b8;font-size:12px;"></span>
    </div>
    <div style="max-height:52vh;overflow:auto;border:1px solid #334155;border-radius:6px;">
      <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12px;">
        <thead><tr style="position:sticky;top:0;background:#1e293b;">
          ${['Rigid pointer', 'Element #', 'FROM node', 'TO node',
            'Final CII weight (as exported)', 'Status'].map((item) =>
              `<th style="padding:9px;white-space:nowrap;">${item}</th>`).join('')}
        </tr></thead>
        <tbody>${rows.map(rowMarkup).join('')}</tbody>
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

export function openFinalRigidWeightReview(result) {
  if (!ciiEvidence(result)) return false;
  let inventory;
  try { inventory = parseFinalCiiRigidInventory(result.ciiText); }
  catch (error) { errorMarkup(error); return false; }
  const overlay = document.createElement('div');
  overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
  overlay.innerHTML = modalMarkup(inventory, result.ciiName || 'Generated CII');
  document.body.appendChild(overlay);
  const search = overlay.querySelector('[data-final-rigid-search]');
  const filter = overlay.querySelector('[data-final-rigid-filter]');
  const visible = overlay.querySelector('[data-final-rigid-visible]');
  const refresh = () => {
    const q = String(search?.value || '').trim().toLowerCase();
    const choice = filter?.value || 'all';
    let count = 0;
    overlay.querySelectorAll('[data-final-rigid-row]').forEach((tr) => {
      const matchesStatus = choice === 'all'
        || (choice === 'ZERO_OR_NEGATIVE' ? tr.dataset.nonpositive === 'true'
          : tr.dataset.status === choice);
      const display = (!q || (tr.dataset.search || '').includes(q)) && matchesStatus;
      tr.hidden = !display;
      if (display) count += 1;
    });
    if (visible) visible.textContent = `${count} of ${inventory.rows.length} final rigids`;
  };
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-final-rigid-close]').forEach((button) =>
    button.addEventListener('click', close));
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
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
  button.addEventListener('click', () => openFinalRigidWeightReview(state.result));
  return button;
}
