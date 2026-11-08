import { installFinalCiiPropertyEditor } from '../xml-cii-final-property-editor-ui.js';
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
  // The same engine as Mode A produces ranked nearest candidates. If source
  // component ownership is not verified, these are comparison-only; never
  // auto-select a reference or edit the exported CII weight.
  const nearest = plan?.nearestSuggestions || suggestions;
  const auto = plan?.autoIndex >= 0 ? suggestions[plan.autoIndex] : null;
  const suggestionOptions = [
    '<option value="">Select a nearest suggestion…</option>',
    ...nearest.map((entry, index) => `<option value="${index}" ${auto === entry ? 'selected' : ''}>${entry.approximate ? '⚠ Approx · ' : ''}${esc(entry.masterWeightKg)} kg · ${entry.matchPct == null ? 'Unscored' : esc(entry.matchPct) + '%'} · ${esc(entry.title)}</option>`),
  ].join('');
  const nearestButtons = nearest.map((entry, index) => {
    const active = auto === entry;
    const detail = [entry.title, entry.method, entry.basis].filter(Boolean).join(' · ');
    return `<button type="button" data-final-rigid-nearest-candidate="${row.rigidPointer}"
      data-final-rigid-nearest-index="${index}" aria-pressed="${active}"
      title="${esc(detail)}" style="cursor:pointer;font-size:11px;padding:5px 7px;margin:2px;
        border-radius:5px;border:1px solid ${active ? '#60a5fa' : '#334155'};
        background:${active ? '#1d4ed8' : '#1e293b'};color:#dbeafe;">
      ${entry.preferred ? '★ ' : ''}${esc(entry.masterWeightKg)} kg ·
      ${entry.matchPct === null ? 'Unscored' : esc(entry.matchPct) + '%'}
      ${entry.approximate ? ' · ⚠' : ''}</button>`;
  }).join('');
  const basisReason = plan?.reason || 'No run-pinned source-to-CII evidence.';
  const mapping = plan?.mapping;
  const context = plan?.sourceContext;
  const valueOrStatus = (property) => property?.value ?? (property?.suppressed ? 'Suppressed' : 'Not resolved');
  const contextTrace = context ? [
    'Source mapping: ' + context.status + ' · ' + context.reason,
    ...['bore', 'rating', 'dtxr'].map((key) => {
      const item = context[key] || {};
      return key.toUpperCase() + ': ' + valueOrStatus(item) +
        ' · source node ' + (item.sourceNode || 'unresolved') +
        ' · basis ' + (item.basis || 'not found') +
        (item.original ? ' · raw ' + item.original : '') +
        (item.matchedKey ? ' · match key ' + item.matchedKey : '') +
        (item.matchedBy ? ' · matched by ' + item.matchedBy : '') +
        (item.sourcePath ? ' · source path ' + item.sourcePath : '') +
        (item.dtxrRating ? ' · DTXR rating ' + item.dtxrRating : '') +
        (item.suppressed ? ' · SUPPRESSED: ' + (item.suppressionReason || 'unspecified') : '') +
        (item.source ? ' · authority ' + item.source : '') +
        (item.originalField ? ' · field ' + item.originalField : '') +
        (item.branchName ? ' · exact CII branch ' + item.branchName : '') +
        (item.engineInputDigest ? ' · run input ' + item.engineInputDigest : '') +
        (item.conflictingRatings ? ' · conflicting ratings ' + item.conflictingRatings.join(', ') : '') +
        (item.elements ? ' · CII element OD evidence ' + item.elements.map((e) =>
          '#' + e.elementIndex + ': OD ' + e.od + ' → DN ' + (e.dn ?? 'unresolved')).join('; ') : '');
    }),
    ...(context.conflicts || []).map((conflict) => 'CONFLICT / REVIEW: ' + conflict),
  ].join('\n') : '';
  const trace = [mapping ? `CII branch ${mapping.branchName} · edge ${mapping.fromNode} → ${mapping.toNode} · ComponentRefNo ${mapping.componentRefNo || '(absent)'} · source span ${Number(mapping.sourceLengthMm).toFixed(3)} mm · CII span ${Number(mapping.ciiLengthMm).toFixed(3)} mm · engine input ${mapping.engineInputDigest || '(digest unavailable)'}` : '', contextTrace, basisReason].filter(Boolean).join('\n');
  const search = [row.rigidPointer, row.weight, row.rawWeight, row.status,
    elementIds, fromNodes, toNodes, lengths, context?.status,
    valueOrStatus(context?.bore), valueOrStatus(context?.rating),
    valueOrStatus(context?.dtxr), mapping?.componentRefNo].join(' ').toLowerCase();
  const cell = (value) => `<td style="padding:9px;border-bottom:1px solid #26364b;white-space:nowrap;">${esc(value)}</td>`;
  const metadataCell = (property, kind) => {
    const derivedBore = kind === 'bore' && property?.source === 'cii-od-dn';
    const branchRating = kind === 'rating' && [
      'enriched-xml-branch-rating', 'enriched-xml-branch-node-rating',
      'configured-branch-rating', 'branch-rating-override',
    ].includes(property?.source);
    const conflicted = property?.conflict === true;
    const display = conflicted
      ? (kind === 'rating' ? 'Rating conflict — Review' : 'Bore conflict — Review')
      : derivedBore ? 'DN ' + property.value : valueOrStatus(property);
    const sourceLabel = derivedBore ? 'CII OD ' + property.original + ' mm' :
      branchRating ? (property.source === 'branch-rating-override'
        ? 'Approved branch override' : property.source === 'configured-branch-rating'
          ? 'Branch rating resolver' : 'Enriched XML branch') : '';
    return `<td data-final-rigid-${kind}-source="${esc(property?.source || '')}"
      title="${esc(property?.basis || '')}" style="padding:9px;border-bottom:1px solid #26364b;white-space:nowrap;">
      ${esc(display)}${sourceLabel ? `<div style="font-size:10px;color:#93c5fd;">${esc(sourceLabel)}</div>` : ''}</td>`;
  };
  const status = [
    !linked.length ? 'Unreferenced pointer' : (linked.length > 1 ? 'Shared by multiple elements' : 'Linked'),
    row.weight <= 0 ? 'Zero / negative weight' : '',
  ].filter(Boolean).join(' · ');
  return `<tr data-final-rigid-row data-pointer="${row.rigidPointer}" data-search="${esc(search)}" data-status="${esc(row.status)}"
    data-nonpositive="${row.weight <= 0}">
    ${cell(row.rigidPointer)}${cell(elementIds)}${cell(fromNodes)}${cell(toNodes)}
    ${cell(lengths)}
    ${metadataCell(context?.bore, 'bore')}
    ${metadataCell(context?.rating, 'rating')}
    ${cell(valueOrStatus(context?.dtxr))}
    ${cell(row.rawWeight)}
    <td style="padding:7px;border-bottom:1px solid #26364b;min-width:325px;max-width:370px;">
      <div data-final-rigid-nearest="${row.rigidPointer}" role="group"
        aria-label="Nearest Suggestions for RIGID pointer ${row.rigidPointer}" style="display:flex;flex-wrap:wrap;gap:2px;">
        ${nearestButtons || '<span style="font-size:11px;color:#94a3b8;">No qualified nearest suggestion</span>'}
      </div>
      <select data-final-rigid-suggestion="${row.rigidPointer}" tabindex="-1"
        aria-hidden="true" style="display:none;">${suggestionOptions}</select>
      <label style="display:block;margin-top:5px;color:#94a3b8;font-size:10px;">
        Reference for Error % (CII output units)
        <input type="number" min="0.000001" step="any" data-final-rigid-reference="${row.rigidPointer}"
          data-reference-kind="${auto ? 'auto' : ''}" value="${auto ? esc(auto.referenceWeight) : ''}"
          aria-label="Reference for Error % in output units for RIGID pointer ${row.rigidPointer}"
          placeholder="Not assessed" style="display:block;width:130px;background:#0b1220;color:#e2e8f0;border:1px solid #475569;border-radius:4px;padding:5px;margin-top:2px;">
      </label>
      <div style="font-size:10px;color:#fbbf24;">Clicking a suggestion compares weights only; it never edits CII.</div>
    </td>
    <td data-final-rigid-error="${row.rigidPointer}" style="padding:9px;border-bottom:1px solid #26364b;">—</td>
    <td style="padding:8px;border-bottom:1px solid #26364b;min-width:240px;">
      <div data-final-rigid-basis-summary="${row.rigidPointer}" style="color:#93c5fd;">
        ${esc(auto ? 'AUTO · unique exact master reference' : nearest.length ? nearest.length + ' nearest suggestion(s) · choose for comparison' : 'Not assessed')}
      </div>
      <details><summary style="cursor:pointer;color:#cbd5e1;">Evidence / calculation basis</summary>
        <pre data-final-rigid-basis-detail="${row.rigidPointer}" style="white-space:pre-wrap;font-size:11px;max-width:310px;">${esc([trace, auto?.basis || ''].filter(Boolean).join('\n'))}</pre>
      </details>
    </td>
    ${cell(context?.status === 'CONFLICT_REVIEW' ? status + ' · Source conflict / Review' :
      context?.status === 'NOT_RESOLVED' ? status + ' · Source unresolved' : status)}</tr>`;
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
    <details data-final-rigid-guidance style="background:#2a210b;border:1px solid #7c5a18;
      border-radius:6px;padding:9px;font-size:12px;color:#ffe7a3;margin-bottom:12px;">
      <summary style="cursor:pointer;display:flex;align-items:center;gap:7px;font-weight:600;list-style:none;">
        <span aria-hidden="true" data-final-rigid-guidance-icon>▶</span>
        Engineering context, nearest-suggestion limits &amp; weight-review guidance
      </summary>
      <div style="padding:8px 2px 2px;line-height:1.5;">
      Bore and Rating are read-only engineering context. When source-component ownership is unresolved, nominal Bore can be derived from the final CII ELEMENTS outside diameter using the qualified OD-to-DN map, and Rating from the exact branch in the run-pinned enriched XML. This does not establish physical-component identity or authorize any reference or weight. Conflicts remain marked for review. DTXR remains source-component-only. RIGID Pointer is the
      1-based index into the final RIGID section, read from each ELEMENTS record's 13th line,
      second field. Weight is the exact exported first-field value in the CII file
      (output mass/force units depend on the conversion setting). Length is computed
      from final CII DX/DY/DZ in mm. Error % uses (exported - reference) / reference × 100,
      following the existing Weight Validator's deviation formula. Enter a trusted
      per-pointer reference in the SAME output units; without one Error % stays —.
      Nearest Suggestions reuse the Consolidated popup's catalog ranking by
      Bore, Rating, length and available component/DTXR evidence. The percentage
      is a catalog match score, NOT physical mass confidence. The source XML
      master values are shown in kg; comparison references use the captured
      CII output-unit scale. An unresolved component may display review-only
      alternatives but must never automatically assign a physical mass.
      Only an independently verified unique semantic match may be preselected.
      A shared physical ComponentRefNo cannot auto-assign one physical mass to
      multiple CII rigids. Open the basis for source/catalog details.
      The weight validation threshold is separate from the 0.65–1.60 length-extrapolation gate.
      Catalog references never overwrite CII weights. Explicit edits can be previewed and applied to a separate, verified revised CII. The original is unchanged.
      </div>
    </details>
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
            'Bore (mm)', 'Rating', 'DTXR', 'Final CII weight (as exported)', 'Nearest Suggestions', 'Error %', 'Basis / evidence', 'Status'].map((item) =>
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
      const editedInput = tr.querySelector('[data-final-rigid-edited]');
      const actual = editedInput ? (editedInput.value.trim() ? Number(editedInput.value) : NaN) : inventory.rows[pointer - 1]?.weight;
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
          ? 'AUTO · exact catalog comparison' : candidate.approximate
            ? 'SELECTED · approximate catalog comparison (review only)'
            : 'SELECTED · catalog comparison (review)')
          : 'MANUAL · reference comparison (not catalog verified)';
      if (basisDetail && isSelection) basisDetail.textContent = [
        plan?.reason || '', plan?.mapping ? `Source ${plan.mapping.branchName} ${plan.mapping.fromNode} → ${plan.mapping.toNode}; ComponentRefNo ${plan.mapping.componentRefNo || 'none'}; CII ${Number(plan.mapping.ciiLengthMm).toFixed(3)} mm` : '',
        plan?.sourceContext ? [
          'Ownership status: ' + plan.sourceContext.status,
          'Bore: ' + (plan.sourceContext.bore.value ?? 'Not resolved') +
            ' from ' + (plan.sourceContext.bore.sourceNode || '?') +
            ' (' + plan.sourceContext.bore.basis + ')',
          'Rating: ' + (plan.sourceContext.rating.value ?? 'Not resolved') +
            ' (' + plan.sourceContext.rating.basis + ')',
          'DTXR: ' + (plan.sourceContext.dtxr.value ?? (plan.sourceContext.dtxr.suppressed ? 'Suppressed' : 'Not resolved')) +
            ' (' + plan.sourceContext.dtxr.basis + ')',
          'DTXR source path: ' + (plan.sourceContext.dtxr.sourcePath || 'not provided'),
          ...plan.sourceContext.conflicts,
        ].join('\\n') : '', candidate.basis,
        'Error % = 100 × (edited CII weight − reference weight) / reference weight',
      ].filter(Boolean).join('\n');
      if (comparison.errorPct !== null) assessed += 1;
      if (comparison.outside === true) overLimit += 1;
      tr.dataset.outsideError = String(comparison.outside === true);
      const matchesStatus = choice === 'all'
        || (choice === 'OVER_LIMIT' ? tr.dataset.outsideError === 'true'
          : choice === 'ZERO_OR_NEGATIVE' ? tr.dataset.nonpositive === 'true'
          : tr.dataset.status === choice);
      const modifiedOnly = overlay.querySelector('[data-final-rigid-modified-only]')?.checked === true;
      const display = (!modifiedOnly || tr.dataset.editedChanged === 'true') && (!q || (tr.dataset.search || '').includes(q)) && matchesStatus;
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
  installFinalCiiPropertyEditor({ overlay, result, inventory, plans, refresh, getCurrentResult: options.getCurrentResult });
  refresh();
  search?.focus();
  return true;
}

export function createFinalRigidWeightReviewButton(state, getCurrentResult = () => state.result) {
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
    getCurrentResult,
  }));
  return button;
}
