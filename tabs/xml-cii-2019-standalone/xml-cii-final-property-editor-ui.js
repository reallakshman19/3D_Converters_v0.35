/**
 * UI adapter for final-CII property transactions. Catalog references remain
 * comparisons; only explicit edits to RIGID.weight are staged. The original
 * run result and its CII text are never mutated.
 */
import { createCiiPropertySession, stageCiiPropertyEdit, resetCiiPropertyEdit,
  resetAllCiiPropertyEdits, verifyCiiPropertyTransaction } from './xml-cii-final-property-transactions.js';
import { classifyFinalRigidWeightError, formatFinalRigidErrorPercent } from './xml-cii-final-rigid-weight-error.js';

function element(tag, content, attributes = {}) {
  const item = document.createElement(tag);
  if (content !== null) item.textContent = content;
  for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
  return item;
}

function fileDownload(filename, data, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = element('a', null);
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function installFinalCiiPropertyEditor({ overlay, result, inventory, plans = [], refresh, getCurrentResult }) {
  const rows = [...overlay.querySelectorAll('[data-final-rigid-row]')];
  const heading = overlay.querySelector('thead tr');
  const titles = [...heading.querySelectorAll('th')];
  // Existing columns remain intact; extensions use semantic DOM elements.
  titles[8].textContent = 'Original weight';
  titles[10].textContent = 'Edited Error %';
  const addHeadingAfter = (after, title) => {
    const next = element('th', title);
    next.style.cssText = 'padding:9px;white-space:nowrap;';
    after.insertAdjacentElement('afterend', next);
    return next;
  };
  addHeadingAfter(titles[8], 'Edited weight');
  addHeadingAfter(titles[10], 'Original Error %');
  const changeHeader = addHeadingAfter(titles[11], 'Change');
  addHeadingAfter(changeHeader, 'Edit status / select');

  const byPointer = new Map();
  for (const tr of rows) {
    const pointer = Number(tr.dataset.pointer);
    const original = inventory.rows[pointer - 1];
    const cells = [...tr.children];
    const editedCell = element('td', null);
    editedCell.style.cssText = 'padding:7px;border-bottom:1px solid #26364b;min-width:160px;';
    const editInput = element('input', null, { 'data-final-rigid-edited': String(pointer),
      'aria-label': 'Edited weight for RIGID pointer ' + pointer,
      type: 'text', inputmode: 'decimal' });
    editInput.value = original.rawWeight;
    editInput.style.cssText = 'width:130px;padding:5px;border-radius:4px;background:#0b1220;color:#e2e8f0;border:1px solid #475569;';
    const zeroLabel = element('label', ' Confirm zero', { style: 'display:block;font-size:10px;' });
    const zeroInput = element('input', null, { type: 'checkbox', 'data-final-rigid-zero': String(pointer) });
    zeroLabel.prepend(zeroInput);
    const feedback = element('div', '', { 'data-final-rigid-edit-feedback': String(pointer) });
    feedback.style.cssText = 'font-size:10px;color:#fca5a5;max-width:190px;white-space:normal;';
    editedCell.append(editInput, zeroLabel, feedback);
    cells[8].insertAdjacentElement('afterend', editedCell);
    const origError = element('td', '—', { 'data-final-rigid-original-error': String(pointer) });
    origError.style.cssText = 'padding:9px;border-bottom:1px solid #26364b;';
    cells[10].insertAdjacentElement('afterend', origError);
    const diff = element('td', '—', { 'data-final-rigid-diff': String(pointer) });
    const status = element('td', 'Unchanged', { 'data-final-rigid-edit-status': String(pointer) });
    diff.style.cssText = status.style.cssText = 'padding:9px;border-bottom:1px solid #26364b;white-space:nowrap;';
    const selected = element('input', null, { type: 'checkbox', 'data-final-rigid-select': String(pointer),
      'aria-label': 'Select RIGID pointer ' + pointer });
    status.append(element('span', ' '), selected);
    cells[11].insertAdjacentElement('afterend', diff);
    diff.insertAdjacentElement('afterend', status);
    byPointer.set(pointer, { tr, original, editInput, zeroInput, feedback, origError, diff, status, selected });
  }

  const tools = element('div', null);
  tools.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0;';
  const buttons = {};
  const addButton = (key, title) => {
    const btn = element('button', title, { type: 'button', ['data-final-rigid-' + key]: '' });
    btn.style.cssText = 'padding:7px 11px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:5px;cursor:pointer;';
    buttons[key] = btn;
    tools.appendChild(btn);
    return btn;
  };
  const modifiedLabel = element('label', ' Show Modified Only', { style: 'font-size:12px;' });
  const modifiedCheckbox = element('input', null, { type: 'checkbox', 'data-final-rigid-modified-only': '' });
  modifiedLabel.prepend(modifiedCheckbox);
  tools.append(modifiedLabel);
  addButton('reset-selected', 'Reset Selected');
  addButton('reset-all', 'Reset All');
  addButton('preview', 'Preview Changes');
  addButton('apply', 'Apply Changes & Re-extract CII').disabled = true;
  addButton('download', 'Download Revised CII').disabled = true;
  addButton('audit', 'Download Change Audit JSON').disabled = true;
  const report = element('pre', 'Preparing immutable final CII baseline…', { 'data-final-rigid-preview-report': '' });
  report.style.cssText = 'white-space:pre-wrap;max-height:180px;overflow:auto;font-size:11px;color:#cbd5e1;';
  const scrollTable = overlay.querySelector('table')?.parentElement;
  scrollTable?.insertAdjacentElement('afterend', tools);
  tools.insertAdjacentElement('afterend', report);

  const runIdentity = String(result.finalRigidReviewEvidence?.engineInputDigest ||
    result.diagnostics?.converterInputDigest || 'digest-unavailable') + ':' +
    (result.ciiName || 'generated.cii') + ':' + (globalThis.crypto?.randomUUID?.() || Date.now());
  let session = null, version = 0, previewVersion = -1, committed = null;
  const invalid = new Set();
  const current = () => typeof getCurrentResult === 'function' ? getCurrentResult() : result;

  const dirty = () => {
    version += 1; previewVersion = -1; committed = null;
    buttons.apply.disabled = true;
    buttons.download.disabled = true;
    buttons.audit.disabled = true;
  };

  const referenceEvidence = (pointer) => {
    const row = byPointer.get(pointer).tr;
    const selection = row.querySelector('[data-final-rigid-suggestion]');
    const reference = row.querySelector('[data-final-rigid-reference]');
    const sourceContext = plans[pointer - 1]?.sourceContext || null;
    if (!reference?.value) return { kind: 'not-assessed', value: '', sourceContext };
    const kind = reference.dataset.referenceKind || 'manual';
    return { kind, value: reference.value, basis: row.querySelector('[data-final-rigid-basis-detail]')?.textContent || '', sourceContext };
  };

  const syncOne = (pointer) => {
    const row = byPointer.get(pointer);
    if (!session || !row) return;
    if (row.editInput.value.trim() === row.original.rawWeight) {
      resetCiiPropertyEdit(session, 'RIGID.weight', pointer);
      invalid.delete(pointer);
      row.feedback.textContent = '';
      return;
    }
    try {
      stageCiiPropertyEdit(session, {
        propertyId: 'RIGID.weight', recordPointer: pointer,
        originalToken: row.original.rawWeight,
        newValue: row.editInput.value, unit: 'CII_OUTPUT_WEIGHT',
        confirmed: true, zeroConfirmed: row.zeroInput.checked,
        reference: referenceEvidence(pointer),
      }, { replace: true });
      invalid.delete(pointer);
      row.feedback.textContent = '';
    } catch (error) {
      invalid.add(pointer);
      row.feedback.textContent = error.message;
    }
  };

  const repaint = () => {
    let visible = 0;
    for (const [pointer, row] of byPointer) {
      const staged = session?.edits.has('RIGID.weight:' + pointer) || false;
      const bad = invalid.has(pointer);
      const reference = row.tr.querySelector('[data-final-rigid-reference]')?.value || '';
      const value = row.editInput.value.trim() ? Number(row.editInput.value) : NaN;
      const comparison = classifyFinalRigidWeightError(value, reference,
        overlay.querySelector('[data-final-rigid-limit]')?.value);
      const initial = classifyFinalRigidWeightError(row.original.weight, reference,
        overlay.querySelector('[data-final-rigid-limit]')?.value);
      row.origError.textContent = formatFinalRigidErrorPercent(initial.errorPct);
      row.diff.textContent = staged ? String(row.original.weight) + ' → ' + row.editInput.value +
        ' (Δ ' + String(value - row.original.weight) + ')' : '—';
      row.status.firstChild.textContent = bad ? 'Invalid' : staged && comparison.outside ? 'Review' :
        staged ? 'Modified' : 'Unchanged';
      row.tr.dataset.editedChanged = String(staged || bad);
      const hideModified = modifiedCheckbox.checked && !(staged || bad);
      row.tr.dataset.editorModifiedHidden = String(hideModified);
      if (hideModified) row.tr.hidden = true;
      else visible += 1;
    }
    refresh();
    // Refresh applies the pre-existing search/status filters. Reapply the
    // additional modified-only predicate without disturbing staged values.
    for (const row of byPointer.values()) {
      if (row.tr.dataset.editorModifiedHidden === 'true') row.tr.hidden = true;
    }
    const indicator = overlay.querySelector('[data-final-rigid-visible]');
    if (indicator && modifiedCheckbox.checked) {
      indicator.textContent = [...byPointer.values()].filter((row) => !row.tr.hidden).length +
        ' of ' + inventory.rows.length + ' final rigids';
    }
  };

  const changed = (pointer) => { if (!session) return; syncOne(pointer); dirty(); repaint(); };
  for (const [pointer, row] of byPointer) {
    row.editInput.addEventListener('input', () => changed(pointer));
    row.zeroInput.addEventListener('change', () => changed(pointer));
    row.tr.querySelector('[data-final-rigid-reference]')?.addEventListener('input', () => changed(pointer));
    row.tr.querySelector('[data-final-rigid-suggestion]')?.addEventListener('change', () => changed(pointer));
  }
  modifiedCheckbox.addEventListener('change', repaint);
  overlay.querySelector('[data-final-rigid-limit]')?.addEventListener('input', repaint);
  overlay.querySelector('[data-final-rigid-search]')?.addEventListener('input', repaint);
  overlay.querySelector('[data-final-rigid-filter]')?.addEventListener('change', repaint);

  const restore = (pointer) => {
    const row = byPointer.get(pointer);
    row.editInput.value = row.original.rawWeight;
    row.zeroInput.checked = false;
    row.selected.checked = false;
    row.feedback.textContent = '';
    invalid.delete(pointer);
    if (session) resetCiiPropertyEdit(session, 'RIGID.weight', pointer);
  };
  buttons['reset-selected'].addEventListener('click', () => {
    for (const [pointer, row] of byPointer) if (row.selected.checked) restore(pointer);
    dirty(); repaint();
  });
  buttons['reset-all'].addEventListener('click', () => {
    for (const pointer of byPointer.keys()) restore(pointer);
    if (session) resetAllCiiPropertyEdits(session);
    dirty(); repaint();
  });

  buttons.preview.addEventListener('click', async () => {
    if (!session || invalid.size || !session.edits.size) {
      report.textContent = invalid.size ? 'REFUSED: Invalid edited values or missing zero confirmation.' : 'No modified fields.';
      return;
    }
    const ticket = version;
    try {
      if (current() !== result) throw new Error('Stale run: result has changed.');
      const preview = await verifyCiiPropertyTransaction(session, {
        currentCiiText: current().ciiText, runIdentity,
      });
      if (ticket !== version) throw new Error('Edits changed during preview.');
      previewVersion = ticket; buttons.apply.disabled = false;
      report.textContent = 'VERIFIED PREVIEW — not yet applied\n' +
        preview.audit.changes.map((row) => row.propertyId + ' pointer ' + row.recordPointer +
          ': ' + row.originalValue + ' → ' + row.newValue).join('\n') +
        '\nOriginal SHA-256: ' + preview.audit.originalSha256 +
        '\nRevised SHA-256: ' + preview.audit.revisedSha256;
    } catch (error) { buttons.apply.disabled = true; report.textContent = 'REFUSED: ' + error.message; }
  });
  buttons.apply.addEventListener('click', async () => {
    if (!session || invalid.size || !session.edits.size || previewVersion !== version) {
      report.textContent = 'REFUSED: Preview all valid changes first.'; return;
    }
    const ticket = version;
    try {
      if (current() !== result) throw new Error('Stale run: result has changed.');
      const revised = await verifyCiiPropertyTransaction(session, {
        currentCiiText: current().ciiText, runIdentity,
      });
      if (ticket !== version) throw new Error('Edits changed during apply.');
      committed = revised;
      buttons.download.disabled = buttons.audit.disabled = false;
      report.textContent = 'VERIFIED REVISED CII READY — original CII unchanged\n' +
        revised.audit.changes.length + ' authorized edits; zero unauthorized bytes changed.\nSHA-256: ' +
        revised.audit.revisedSha256;
    } catch (error) {
      committed = null; buttons.download.disabled = buttons.audit.disabled = true;
      report.textContent = 'REFUSED: ' + error.message;
    }
  });
  buttons.download.addEventListener('click', () => {
    if (committed && current() === result) fileDownload(committed.revisedName, committed.revisedCiiText, 'text/plain;charset=utf-8');
  });
  buttons.audit.addEventListener('click', () => {
    if (committed && current() === result) fileDownload(committed.auditName, JSON.stringify(committed.audit, null, 2) + '\n', 'application/json');
  });

  createCiiPropertySession(result.ciiText, { filename: result.ciiName || 'generated.cii', runIdentity })
    .then((ready) => {
      if (!overlay.isConnected) return;
      session = ready;
      for (const pointer of byPointer.keys()) syncOne(pointer);
      dirty(); repaint();
      report.textContent = 'Ready: ' + inventory.rows.length + ' original RIGID records. Original CII preserved.';
    })
    .catch((error) => {
      report.textContent = 'REFUSED: ' + error.message;
      buttons.preview.disabled = true;
    });
}
