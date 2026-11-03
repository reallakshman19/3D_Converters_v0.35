function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function value(value, suffix = '') {
  return value === null || value === undefined || value === '' ? '—' : `${esc(value)}${suffix}`;
}

function metric(label, metricValue, suffix = '') {
  return `<span><small>${esc(label)}</small><strong>${value(metricValue, suffix)}</strong></span>`;
}

function authorityHtml(authority) {
  if (!authority) return '';
  return `<div class="aiv-canvas-result-authority">
    ${metric('Screening authority', authority.screeningAuthority)}
    ${metric('Engineering authority', authority.engineeringAuthority)}
    ${metric('Design authority', authority.designAuthority)}
  </div>`;
}

function traceIds(trace) {
  const ids = trace?.traceIds ?? [];
  return ids.length ? `<small>Trace: ${esc(ids.join(', '))}</small>` : '';
}

export function renderAivCanvasSourceResultHtml(node) {
  const result = node?.resultSummary;
  if (!result) return '<small>No screening Source result for the selected case.</small>';
  return `<div class="aiv-canvas-result-detail">
    <strong>Source screening result · ${esc(node.caseId)}</strong>
    <div class="aiv-canvas-result-grid">
      ${metric('Raw source PWL', result.rawSourcePwlDb, ' dB')}
      ${metric('SFF', result.sonicFlowFactorDb, ' dB')}
      ${metric('Trim reduction', result.trimReductionDb, ' dB')}
      ${metric('Effective source PWL', result.effectiveSourcePwlDb, ' dB')}
      ${metric('Status', result.status)}
      ${metric('Scope', result.resultScope)}
    </div>${authorityHtml(result.authority)}${traceIds(result.trace)}
  </div>`;
}

export function renderAivCanvasRelationshipResultHtml(relationship) {
  const contribution = relationship?.screeningContribution;
  const explicitDistance = relationship?.physicalDistance && relationship?.physicalDistanceUnit
    ? `${relationship.physicalDistance} ${relationship.physicalDistanceUnit}` : '—';
  const provenance = [relationship?.distanceSource, relationship?.distanceSourceRevision].filter(Boolean).join(' · ');
  if (!contribution) {
    return `<div class="aiv-canvas-result-detail"><strong>Relationship contribution · ${esc(relationship.caseId)}</strong>
      <div class="aiv-canvas-result-grid">${metric('Explicit physical distance', explicitDistance)}${metric('Applicability', relationship.applicabilityDisposition)}${metric('Simultaneous group', relationship.simultaneousSourceGroup)}</div>
      <small>No kernel contribution exists for this relationship in the current result. No attenuation or point PWL is inferred from the rendered connector.</small>${provenance ? `<small>Distance provenance: ${esc(provenance)}</small>` : ''}</div>`;
  }
  return `<div class="aiv-canvas-result-detail">
    <strong>Relationship contribution · ${esc(relationship.caseId)}</strong>
    <div class="aiv-canvas-result-grid">
      ${metric('Effective source PWL', contribution.effectiveSourcePwlDb, ' dB')}
      ${metric('Explicit physical distance', explicitDistance)}
      ${metric('Attenuation', contribution.attenuationDb, ' dB')}
      ${metric('Point contribution PWL', contribution.pointPwlDb, ' dB')}
      ${metric('Simultaneous group', contribution.simultaneousSourceGroup ?? relationship.simultaneousSourceGroup)}
      ${metric('Applicability', relationship.applicabilityDisposition)}
    </div>
    ${provenance ? `<small>Distance provenance: ${esc(provenance)}</small>` : ''}${traceIds(contribution.trace)}
  </div>`;
}

function t26Html(t26) {
  if (!t26) return '';
  return `<div class="aiv-canvas-result-grid aiv-canvas-t26">
    ${metric('FLM1', t26.FLM1)}${metric('FLM2', t26.FLM2)}${metric('Lf', t26.Lf)}
  </div>`;
}

function contributionRows(rows = []) {
  if (!rows.length) return '<tr><td colspan="5">No returned source contributions.</td></tr>';
  return rows.map((item) => `<tr><td><code>${esc(item.sourceCanonicalId)}</code></td><td>${value(item.effectiveSourcePwlDb, ' dB')}</td><td>${value(item.attenuationDb, ' dB')}</td><td>${value(item.pointPwlDb, ' dB')}</td><td>${value(item.simultaneousSourceGroup)}</td></tr>`).join('');
}

function contributionTable(result) {
  return `<div class="aiv-canvas-contribution-table"><strong>Returned source contributions</strong><table><thead><tr><th>Source</th><th>Effective PWL</th><th>Attenuation</th><th>Point contribution</th><th>Simultaneous group</th></tr></thead><tbody>${contributionRows(result.sourceContributionsAtPoint)}</tbody></table><small>Combined point PWL above is the returned Assessment result; it is not recomputed from this table in UI code.</small></div>`;
}

function assessmentCaseHtml(result, line) {
  const sources = result.contributingSourceCanonicalIds?.join(', ') || '—';
  return `<div class="aiv-canvas-result-case" data-aiv-filterable="true" data-aiv-canvas-cases="${esc(result.caseId)}" data-aiv-canvas-line="${esc(line ?? '')}">
    <strong>Assessment screening result · ${esc(result.caseId)}</strong>
    <div class="aiv-canvas-result-grid">
      ${metric('Combined point PWL', result.combinedPointPwlDb, ' dB')}
      ${metric('Contributing Source IDs', sources)}
      ${metric('Assessment LOF', result.lof)}
      ${metric('Status', result.status)}
      ${metric('Scope', result.resultScope)}
    </div>${contributionTable(result)}${t26Html(result.t26Intermediates)}${authorityHtml(result.authority)}
  </div>`;
}

export function renderAivCanvasAssessmentResultHtml(node) {
  const summary = node?.resultSummary;
  if (!summary) return '<small>No Assessment screening result is available.</small>';
  const cases = summary.caseCount ? summary.cases : [summary];
  return `<div class="aiv-canvas-result-detail">${cases.map((item) => assessmentCaseHtml(item, node.line)).join('')}</div>`;
}
