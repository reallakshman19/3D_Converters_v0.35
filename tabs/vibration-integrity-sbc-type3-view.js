function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function option(value, selected, label = value) {
  return `<option value="${esc(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
}

function metric(label, value, note = '') {
  const shown = value === null || value === undefined || value === '' ? '—' : value;
  return `<div class="vi-metric"><small>${esc(label)}</small><strong>${esc(shown)}</strong>${note ? `<span>${esc(note)}</span>` : ''}</div>`;
}

function field(label, key, value, unit = '', type = 'text') {
  return `<label>${esc(label)}${unit ? ` (${esc(unit)})` : ''}<input class="vi-cell-input" type="${type}" data-vi-sbc-master-physical="${esc(key)}" value="${esc(value ?? '')}"></label>`;
}

function selectField(label, key, value, values) {
  return `<label>${esc(label)}<select data-vi-sbc-master-physical="${esc(key)}"><option value="">Select…</option>${values.map(([item, text]) => option(item, value, text)).join('')}</select></label>`;
}

function scopeRecord(state, scopeId) {
  return state.sbcType3CurrentnessStore?.scopes?.[scopeId] ?? null;
}

function physicalInputs(state, scopeId) {
  const physical = state.sbcType3PhysicalByScope?.[scopeId] ?? {};
  return `<div class="vi-filterbar">
    ${selectField('First span unsupported mass', 'firstSpanHasUnsupportedMass', physical.firstSpanHasUnsupportedMass, [['TRUE','Yes'],['FALSE','No']])}
    ${selectField('SBC fitting', 'fittingKey', physical.fittingKey, [['WELDOLET','Weldolet'],['SOCKOLET','Sockolet'],['FORGED_REDUCING_TEE','Forged reducing tee'],['WELDED_TEE','Welded tee'],['SET_ON','Set-on'],['SET_IN','Set-in'],['SET_THRU','Set-through']])}
    ${field('Branch length', 'branchLengthMm', physical.branchLengthMm, 'mm', 'number')}
    ${field('Valve pressure class', 'valvePressureClass', physical.valvePressureClass, 'ANSI class', 'number')}
    ${selectField('Valve / flange configuration', 'valveConfiguration', physical.valveConfiguration, [['FLANGE_ONLY','Flange only'],['ONE_VALVE_OR_INTEGRAL_DBB','One valve / integral DBB'],['TWO_OR_MORE_VALVES','Two or more valves']])}
    ${field('Parent pipe schedule', 'parentSchedule', physical.parentSchedule)}
    ${field('Minimum SBC diameter', 'sbcMinDiameterIn', physical.sbcMinDiameterIn, 'in', 'number')}
    ${field('First span length', 'firstSpanLengthM', physical.firstSpanLengthM, 'm', 'number')}
    ${field('Subsequent span with mass', 'subsequentMassSpanM', physical.subsequentMassSpanM, 'm', 'number')}
    ${field('Subsequent span without mass', 'subsequentNoMassSpanM', physical.subsequentNoMassSpanM, 'm', 'number')}
    ${selectField('First-span location', 'locationKey', physical.locationKey, [['VALVE','Valve'],['REDUCER','Reducer'],['BEND','Bend'],['TEE','Tee'],['MID_SPAN','Mid-span'],['PARTIALLY_FIXED_SUPPORT','Partially fixed support'],['FIXED_SUPPORT','Fixed support']])}
    <label>Main-line LOF for assessment (optional)<input class="vi-cell-input" type="number" data-vi-sbc-master-mainline value="${esc(state.sbcType3MainlineByScope?.[scopeId] ?? '')}" placeholder="blank uses controlled unknown-mainline rule"></label>
  </div>`;
}

function derivedPanel(state, scopeId) {
  const derivation = state.sbcType3DerivationByScope?.[scopeId]
    ?? scopeRecord(state, scopeId)?.candidate?.result?.derivation
    ?? null;
  if (!derivation?.ok) {
    return `<div class="vi-banner warn"><strong>AUTO-DERIVED · INPUT REQUIRED</strong><span>Complete the physical inputs, then prepare the exact D/F/G evidence rows. Candidate non-curve rules are not Screening authority.</span></div>`;
  }
  const d = derivation.derived;
  return `<section class="vi-card"><div class="vi-section-head"><div><h4>AUTO-DERIVED · candidate non-curve EI rules</h4><p>Read-only candidate values. Source/master publication authority is not elevated by this derivation.</p></div></div>
    <div class="vi-summary">
      ${metric('C · first-span geometry', d.c, 'candidate-derived')}
      ${metric('E · minimum span', d.e, 'candidate-derived')}
      ${metric('First location LOF', d.firstLocationLof, 'candidate-derived')}
      ${metric('Main-line assessment LOF', d.mainlineLofForAssessment, 'candidate-derived')}
      ${metric('Main-line multiplier', d.mainlineMultiplier, 'candidate-derived')}
      ${metric('Modified first span', d.modifiedMinimumSpanM, 'm')}
    </div>
  </section>`;
}

function evidenceRow(state, scopeId, request, term) {
  const row = (state.userEngineeringData?.rows ?? []).find((item) => (
    item.scopeId === scopeId && item.recordKey === request.recordKey && item.blockerId === request.blockerId
  ));
  const value = row?.value ? esc(row.value) : '<span class="vi-empty">INPUT REQUIRED</span>';
  const source = row?.sourceReference ? esc(row.sourceReference) : '<span class="vi-empty">SOURCE REQUIRED</span>';
  return `<tr><td><strong>${esc(term)}</strong></td><td>${esc(request.figureId)}</td><td>${esc(request.xValue)} ${esc(request.xUnit)}</td><td>${esc(request.yValue)} ${esc(request.yUnit)}</td><td>${value}</td><td>${source}</td><td><span class="vi-mono">${esc(request.status)}</span></td></tr>`;
}

function curveEvidencePanel(state, scopeId) {
  const derivation = state.sbcType3DerivationByScope?.[scopeId]
    ?? scopeRecord(state, scopeId)?.candidate?.result?.derivation
    ?? null;
  const requests = derivation?.curveRequests ?? [];
  if (!requests.length) return '';
  return `<section class="vi-card"><div class="vi-section-head"><div><h4>MANUAL EXACT CURVE EVIDENCE REQUIRED</h4><p>D/F/G are project evidence at the exact coordinates below. The T3 curve masters remain blocked and inactive.</p></div></div>
    <div class="vi-banner warn"><strong>BLOCKED SOURCE DATA</strong><span>T3-1..T3-4 are not runtime master authority. Do not interpolate, extrapolate, reconstruct or tune these curves from D7.</span></div>
    <div class="vi-table-wrap"><table class="vi-table"><thead><tr><th>Term</th><th>Figure</th><th>X coordinate</th><th>Y coordinate</th><th>Entered LOF</th><th>Project/source reference</th><th>Curve status</th></tr></thead><tbody>
      ${requests.map((request, index) => evidenceRow(state, scopeId, request, ['D','F','G'][index])).join('')}
    </tbody></table></div>
  </section>`;
}

function problems(result) {
  if (!result?.problems?.length) return '';
  return `<ul>${result.problems.map((item) => `<li><strong>${esc(item.term)}</strong> · ${esc(item.status ?? 'NOT READY')} · ${esc(item.reason ?? '')}</li>`).join('')}</ul>`;
}

function resultPanel(state, scopeId) {
  const scope = scopeRecord(state, scopeId);
  const record = scope?.candidate ?? null;
  const pending = scope?.pendingEvaluation ?? null;
  const result = record?.result ?? state.sbcType3LastEvaluationByScope?.[scopeId] ?? state.sbcType3Result;
  if (pending) return `<div class="vi-banner warn"><strong>EVALUATING · SBC CANDIDATE</strong><span>Scope ${esc(scopeId)} · revision ${esc(pending.engineeringRevision)}. Older async completions cannot replace this operation.</span></div>`;
  if (record?.status === 'STALE') {
    return `<div class="vi-banner warn"><strong>STALE · RERUN REQUIRED</strong><span>Engineering input changed after the previous candidate. The retained ${esc(record.result?.lof ?? '—')} value is inspection-only and is excluded from current candidate governing.</span></div>`;
  }
  if (!result) return `<div class="vi-banner warn"><strong>INPUT REQUIRED</strong><span>Prepare exact curve evidence and evaluate this facility scope.</span></div>`;
  if (!result.ok) return `<div class="vi-banner warn"><strong>INPUT REQUIRED / INVALID</strong><span>The candidate is not current.</span></div><div class="vi-detail-body">${problems(result)}</div>`;
  return `<div class="vi-banner"><strong>SBC CANDIDATE · NOT SCREENING AUTHORITY</strong><span>Scope ${esc(scopeId)} · current revision ${esc(scope?.engineeringRevision ?? 0)}. FIT remains the authorized Screening governing mechanism.</span></div>
    <div class="vi-summary">
      ${metric('C', result.firstSpan?.c)}${metric('D', result.firstSpan?.d)}${metric('E', result.firstSpan?.e)}
      ${metric('F', result.subsequentSpans?.f)}${metric('G', result.subsequentSpans?.g)}${metric('LOFLOC', result.firstSpan?.locationLof)}
      ${metric('Overall modifier', result.overallModifier)}${metric('Main-line adjusted', result.mainline?.adjustedLof)}${metric('SBC LOF', result.lof)}
    </div>`;
}

function legacyPanel() {
  return `<details class="vi-card"><summary><strong>Legacy explicit intermediate-input mode</strong></summary>
    <p>This compatibility path remains available; it does not derive C/E/location/multiplier and does not activate curve masters.</p>
    <div class="vi-actions">
      <button type="button" class="vi-btn" data-vi-sbc-type3-template="mass">Add legacy inputs · first span WITH mass</button>
      <button type="button" class="vi-btn" data-vi-sbc-type3-template="no-mass">Add legacy inputs · first span WITHOUT mass</button>
      <button type="button" class="vi-btn" data-vi-sbc-type3-evaluate>Evaluate legacy explicit inputs</button>
    </div>
  </details>`;
}

export function renderSbcType3UserInputPanel(state) {
  const scopeId = String(state.sbcType3ScopeId ?? '').trim();
  const busy = Boolean(state.sbcType3BusyTokenByScope?.[scopeId]);
  return `<section class="vi-card vi-sbc-type3-user-panel">
    <div class="vi-section-head"><div><h3>SBC Type-3 · facility candidate assessment</h3><p>Enter physical project inputs, derive candidate non-curve terms, then provide exact D/F/G curve reads as project evidence.</p></div></div>
    <div class="vi-import-facts"><span>Facility scope: <strong class="vi-mono">${esc(scopeId || 'NOT SELECTED')}</strong></span><span>Authority: <strong>CANDIDATE ONLY</strong></span><span>Screening authority: <strong>NOT AUTHORIZED</strong></span></div>
    <div class="vi-filterbar"><label>SBC scope / assessment ID<input class="vi-cell-input" data-vi-sbc-type3-scope value="${esc(scopeId)}" placeholder="open from facility register or enter exact scope"></label></div>
    ${physicalInputs(state, scopeId)}
    <div class="vi-actions">
      <button type="button" class="vi-btn" data-vi-sbc-master-template>Prepare exact D/F/G evidence rows</button>
      <button type="button" class="vi-btn primary" data-vi-sbc-master-evaluate${busy ? ' disabled' : ''}>${busy ? 'Evaluating…' : 'Evaluate SBC candidate'}</button>
    </div>
    ${derivedPanel(state, scopeId)}
    ${curveEvidencePanel(state, scopeId)}
    ${resultPanel(state, scopeId)}
    ${legacyPanel()}
  </section>`;
}
