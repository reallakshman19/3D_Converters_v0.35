/**
 * Functionality: renders the editable standalone Preview table and binds its
 * existing edit/fill actions.
 * Parameters: branch/node rows plus callbacks supplied by the Preview owner.
 * Output: table HTML and UI event bindings; value provenance is display-only.
 */

import { adaptedRenderColGroup, adaptedAttachColumnResizers, adaptedLoadColumnWidths } from './xml-cii-adapted-resizable-table.js';
import { previewProvenanceBadge } from './xml-cii-adapted-preview-provenance.js';

export const BRANCH_COLUMNS = [
  { id: 'branchName', label: 'Branch Name', hint: 'Edit', width: 220, minWidth: 120 },
  { id: 'lineKey', label: 'Line Key', width: 120, minWidth: 80 },
  { id: 'lineFrom', label: 'From', width: 110, minWidth: 70 },
  { id: 'lineTo', label: 'To', width: 110, minWidth: 70 },
  { id: 'size', label: 'Size', width: 90, minWidth: 60 },
  { id: 'pipingClass', label: 'Piping Class', hint: 'Edit', width: 130, minWidth: 90 },
  { id: 'material', label: 'Material', hint: 'Edit', width: 120, minWidth: 80 },
  { id: 'rating', label: 'Rating', hint: 'Edit', width: 90, minWidth: 60 },
  { id: 'materialCode', label: 'Material Code', hint: 'Edit', width: 130, minWidth: 90 },
  { id: 'p1', label: 'P1 / Design Pressure', hint: 'Edit', width: 130, minWidth: 90 },
  { id: 'hydroPressure', label: 'Hydro/Test Pressure', hint: 'Edit', width: 130, minWidth: 90 },
  { id: 't1', label: 'T1 (C)', hint: 'Edit', width: 90, minWidth: 60 },
  { id: 't2', label: 'T2 (C)', hint: 'Edit', width: 90, minWidth: 60 },
  { id: 't3', label: 'T3 (C)', hint: 'Edit', width: 90, minWidth: 60 },
  { id: 'density', label: 'Density', hint: 'Edit', width: 90, minWidth: 60 },
  { id: 'wallThickness', label: 'Wall Thk', hint: 'Edit', width: 90, minWidth: 60 },
  { id: 'corrosion', label: 'Corrosion', hint: 'Edit', width: 90, minWidth: 60 }
];

export const NODE_WEIGHT_COLUMNS = [
  { id: 'nodeNumber', label: 'Node', width: 80, minWidth: 60 },
  { id: 'type', label: 'Type', width: 90, minWidth: 70 },
  { id: 'bore', label: 'Bore', width: 90, minWidth: 70 },
  { id: 'rating', label: 'Rating', width: 90, minWidth: 70 },
  { id: 'lengthMm', label: 'Length', width: 110, minWidth: 80 },
  { id: 'dtxr', label: 'DTXR', width: 180, minWidth: 100 },
  { id: 'weightKg', label: 'Weight', width: 110, minWidth: 80 },
  { id: 'deltaLengthMm', label: 'ΔLen', width: 90, minWidth: 70 },
  { id: 'candidates', label: 'All Candidates (TypeDesc · Weight · ΔLength)', width: 360, minWidth: 180 }
];

function smartClassKey(row) {
  const pc = String(row?.pipingClass || row?.pipingClassDerived || '').trim().toUpperCase().replace(/\s+/g, '');
  return pc ? `PC:${pc}` : '';
}

function smartClassSizeKey(row) {
  const cls = smartClassKey(row);
  const bore = Number(row?.sizeMm ?? String(row?.size || '').replace(/[^0-9.+-]/g, ''));
  return cls && Number.isFinite(bore) && bore > 0 ? `${cls}|DN:${Math.round(bore)}` : cls;
}

function formatRatingConflictDetail(row) {
  if (row?.ratingSource !== 'dtxr-rating-conflict') return '';
  const parts = [];
  const ratings = Array.isArray(row.ratingDtxrRatings) ? row.ratingDtxrRatings : [];
  const resSource = row.ratingResolvedSource && row.ratingResolvedSource !== 'dtxr-rating-conflict' ? row.ratingResolvedSource : 'unknown authority';
  if (row.rating && ratings.length > 0 && !ratings.includes(String(row.rating))) {
    parts.push(`Rating mismatch: Resolved rating is "${row.rating}" (via ${resSource}), but DTXR evidence shows "${ratings.join(', ')}".`);
  } else if (ratings.length > 1) {
    parts.push(`Model discrepancy: 3D model annotations contain conflicting ratings (${ratings.join(' vs ')}).`);
  } else {
    parts.push(`Rating conflict detected between 3D model DTXR annotations and master data.`);
  }
  const evidence = Array.isArray(row.ratingDtxrEvidence) ? row.ratingDtxrEvidence : [];
  if (evidence.length > 0) {
    parts.push(`Component DTXR Evidence:`);
    for (const e of evidence.slice(0, 5)) {
      const who = [e.componentType, e.componentRefNo].filter(Boolean).join(' #');
      parts.push(` • "${e.rating}" on ${who || 'component'} (${e.source || 'dtxr'}): "${e.dtxr}"`);
    }
  }
  if (row.ratingResolvedSource && row.ratingResolvedSource !== 'dtxr-rating-conflict') {
    parts.push(`Effective conversion rating currently governed by: ${row.ratingResolvedSource}`);
  }
  return parts.join('\n');
}

export class XmlCiiAdaptedEditablePreviewTable {
  constructor({ branchRows, nodesByBranch, onCellEditClick, onFillDownClick, onProcessInputChange, onProcessFillDownClick, onWeightCandidateSelect, processInputHtmlRenderer, matchBadgeHtmlRenderer }) {
    this.branchRows = branchRows;
    this.nodesByBranch = nodesByBranch;
    this.onCellEditClick = onCellEditClick;
    this.onFillDownClick = onFillDownClick;
    this.onProcessInputChange = onProcessInputChange;
    this.onProcessFillDownClick = onProcessFillDownClick;
    this.processInputHtmlRenderer = processInputHtmlRenderer;
    this.matchBadgeHtmlRenderer = matchBadgeHtmlRenderer;
    this.onWeightCandidateSelect = onWeightCandidateSelect;
  }

  renderHTML() {
    const branchWidths = adaptedLoadColumnWidths('xmlCii.preview.branch.columnWidths.v1');
    const colHdr = (col) => `
      <th class="mc-preview-th" data-col-id="${this._escapeAttr(col.id)}" style="position: relative;">
        <span class="xml-cii-th-label">${this._escape(col.label)}</span>${col.hint ? `<span class="mc-preview-edit-hint">${this._escape(col.hint)}</span>` : ''}
        <span class="xml-cii-col-resizer" data-resize-col="${this._escapeAttr(col.id)}"></span>
      </th>`;
    const branchColgroup = adaptedRenderColGroup(BRANCH_COLUMNS, branchWidths);
    const branchThead = BRANCH_COLUMNS.map(colHdr).join('');
    return `<div class="mc-preview-wrap xml-cii-preview-table-wrap"><table class="mc-preview-table xml-cii-preview-table--fixed" data-resizable-table="branch-preview">${branchColgroup}<thead><tr>${branchThead}</tr></thead><tbody>${this.branchRows.map((row, ri) => this._renderBranchRow(row, ri)).join('')}</tbody></table></div>`;
  }

  _renderBranchRow(row, ri) {
    const pipingClassTitle = this._pipingClassTitle(row);
    const pcBadge = this.matchBadgeHtmlRenderer ? this.matchBadgeHtmlRenderer(row.pipingClassMethod, row.pipingClassConfidence, row.pipingClassNeedsReview, row.pipingClass, row.pipingClassDerived) : `<span class="mc-preview-editable-val">${this._escape(row.pipingClass || '')}</span>`;
    const mcBadge = this.matchBadgeHtmlRenderer ? this.matchBadgeHtmlRenderer(row.materialCodeMethod, null, row.materialCodeNeedsReview, row.materialCode, row.material) : `<span class="mc-preview-editable-val">${this._escape(row.materialCode || '')}</span>`;
    const tdApprox = (needs, attrs = '') => needs ? `class="mc-preview-td mc-preview-approx" ${attrs}` : `class="mc-preview-td" ${attrs}`;
    const fillDownBtn = (field, fromRow) => `<button type="button" class="mc-preview-filldown-btn" data-mc-fill-field="${this._escape(field)}" data-mc-fill-from="${fromRow}" title="Smart fill by field key: wall thickness by piping class + size; corrosion/material code by piping class; process data by line key.">↓</button>`;
    const renderProcessField = (fieldKey, val, src, pcKey = '') => this.processInputHtmlRenderer ? this.processInputHtmlRenderer(fieldKey, row.lineKey, val, src, ri, pcKey) : `<input type="text" value="${this._escape(val)}" data-mc-pd-field="${this._escape(fieldKey)}" data-mc-pd-linekey="${this._escape(row.lineKey)}" data-mc-pd-row="${ri}">`;
    const editAttrs = (type, key, extra = '') => `data-mc-edit-type="${this._escapeAttr(type)}" data-mc-edit-key="${this._escapeAttr(key || row.lineKey || row.branchName || '')}" data-mc-edit-row="${ri}" data-mc-pc-key="${this._escapeAttr(type === 'wallThickness' || type === 'materialCode' ? classSizeKey : classKey)}" ${extra}`;
    const editablePlain = (type, value, key, source = '', detail = '') => {
      const isDefault = source === 'default' || source === 'config-default' || source === 'default-zero';
      const cls = `mc-preview-editable-val${isDefault ? ' mc-preview-default-val' : ''}`;
      const style = isDefault ? ' style="color:#7f1d1d;font-weight:600;font-style:italic;" title="Config default value"' : '';
      const provenance = previewProvenanceBadge(type, source, detail);
      const badge = provenance ? ` <span class="mc-preview-badge ${this._escapeAttr(provenance.className)}" title="${this._escapeAttr(provenance.title)}">${this._escape(provenance.label)}</span>` : '';
      return `<span class="${cls}"${style}>${this._escape(value || '—')}</span>${badge}`;
    };
    const classKey = smartClassKey(row);
    const classSizeKey = smartClassSizeKey(row);
    const materialCodeKey = row.materialCodeKey || classKey || row.material || row.lineKey;
    const wallKey = row.wallThicknessKey || classSizeKey || row.lineKey;
    const corrosionKey = row.corrosionKey || classKey || row.lineKey;
    const ratingKey = classKey || row.pipingClassDerived || row.pipingClass || row.lineKey;
    const branchText = row.branchName?.length > 36 ? `…${row.branchName.slice(-32)}` : row.branchName;
    const branchTitle = `Branch: ${row.branchName || ''}\nClick to override the Branch → Line List key mapping.`;
    const ratingDerivedBadge = row.ratingDerived && String(row.ratingDerived).trim() !== String(row.rating || '').trim()
      ? ` <span class="mc-preview-badge" style="background:rgba(148,163,184,0.12);color:#94a3b8;border:1px solid rgba(148,163,184,0.15);" title="Derived from Piping Class: ${this._escapeAttr(row.ratingDerived)}">derived: ${this._escape(row.ratingDerived)}</span>`
      : '';
    const ratingConflictDetail = formatRatingConflictDetail(row);

    return `
      <tr class="mc-preview-row${row.lineMiss ? ' mc-preview-line-miss' : ''}">
        <td ${tdApprox(false, editAttrs('branchLineKey', row.branchName, `data-mc-current-val="${this._escapeAttr(row.lineKey || '')}" title="${this._escapeAttr(branchTitle)}"`))}><span class="mc-preview-branch-name">${this._escape(branchText || '—')}</span><span class="mc-preview-editable-val" style="display:none;">${this._escape(row.lineKey || '')}</span></td>
        <td class="mc-preview-td${row.lineMiss ? ' mc-preview-warn' : ''}">${this._renderLineKeyCell(row)}</td>
        <td class="mc-preview-td" title="Process master From (line list)">${this._escape(row.lineFrom || '—')}</td>
        <td class="mc-preview-td" title="Process master To (line list)">${this._escape(row.lineTo || '—')}</td>
        <td class="mc-preview-td">${this._escape(row.size || '—')}</td>
        <td ${tdApprox(row.pipingClassNeedsReview, editAttrs('pipingClass', row.pipingClassDerived, `data-mc-edit-derived="${this._escapeAttr(row.pipingClassDerived || '')}" title="${this._escapeAttr(pipingClassTitle)}"`))}>${pcBadge}${row.pipingClassNeedsReview ? fillDownBtn('pipingClass', ri) : ''}</td>
        <td ${tdApprox(false, editAttrs('material', row.lineKey))}>${editablePlain('material', row.material, row.lineKey, row.materialSource)}</td>
        <td ${tdApprox(false, editAttrs('rating', ratingKey, `title="Rating override key (Piping Class): ${this._escapeAttr(ratingKey)}"`))}>${editablePlain('rating', row.rating, ratingKey, row.ratingSource, ratingConflictDetail)}${ratingDerivedBadge}${fillDownBtn('rating', ri)}</td>
        <td ${tdApprox(row.materialCodeNeedsReview, editAttrs('materialCode', materialCodeKey, `data-mc-edit-mat="${this._escapeAttr(materialCodeKey || row.material || '')}" data-mc-edit-linekey="${this._escapeAttr(row.lineKey || '')}"`))}>${mcBadge}${row.materialCodeNeedsReview ? fillDownBtn('materialCode', ri) : ''}</td>
        <td class="mc-preview-td mc-preview-pd-td">${renderProcessField('p1', row.p1, row.p1Source)}</td>
        <td class="mc-preview-td mc-preview-pd-td">${renderProcessField('hydroPressure', row.hydroPressure, row.hydroPressureSource, classKey)}</td>
        <td class="mc-preview-td mc-preview-pd-td">${renderProcessField('t1', row.t1, row.t1Source)}</td>
        <td class="mc-preview-td mc-preview-pd-td">${renderProcessField('t2', row.t2, row.t2Source)}</td>
        <td class="mc-preview-td mc-preview-pd-td">${renderProcessField('t3', row.t3, row.t3Source)}</td>
        <td class="mc-preview-td mc-preview-pd-td">${renderProcessField('density', row.density, row.densitySource)}</td>
        <td ${tdApprox(false, editAttrs('wallThickness', wallKey, `title="Wall thickness override key: ${this._escapeAttr(wallKey)}"`))}>${editablePlain('wallThickness', row.wallThickness, wallKey, row.wallThicknessSource)}${fillDownBtn('wallThickness', ri)}</td>
        <td ${tdApprox(false, editAttrs('corrosion', corrosionKey, `title="Corrosion override key: ${this._escapeAttr(corrosionKey)}"`))}>${editablePlain('corrosion', row.corrosion, corrosionKey, row.corrosionSource)}${fillDownBtn('corrosion', ri)}</td>
      </tr>`;
  }

  bind(hostEl) {
    const branchTable = hostEl.querySelector('[data-resizable-table="branch-preview"]');
    if (branchTable) adaptedAttachColumnResizers(branchTable, BRANCH_COLUMNS, { storageKey: 'xmlCii.preview.branch.columnWidths.v1' });
    hostEl.querySelectorAll('[data-mc-edit-type]').forEach(td => { td.style.cursor = 'pointer'; td.addEventListener('click', (e) => { if (e.target.closest('.mc-preview-filldown-btn')) return; const editType = td.getAttribute('data-mc-edit-type'); const derivedKey = td.getAttribute('data-mc-edit-derived') || td.getAttribute('data-mc-edit-key') || td.getAttribute('data-mc-edit-mat') || ''; let currentVal = td.getAttribute('data-mc-current-val') || td.querySelector('.mc-preview-editable-val')?.textContent?.trim() || ''; if (currentVal === '—') currentVal = ''; const rowIndex = Number(td.getAttribute('data-mc-edit-row') || 0); if (typeof this.onCellEditClick === 'function') this.onCellEditClick({ editType, derivedKey, currentVal, rowIndex, td }); }); });
    hostEl.querySelectorAll('.mc-preview-filldown-btn[data-mc-fill-field]:not(.mc-pd-filldown)').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const field = btn.getAttribute('data-mc-fill-field') || ''; const fromRow = Number(btn.getAttribute('data-mc-fill-from') || 0); const sourceTd = btn.closest('[data-mc-edit-type]'); const currentVal = sourceTd?.querySelector('.mc-preview-editable-val')?.textContent?.trim() || ''; if (typeof this.onFillDownClick === 'function') this.onFillDownClick({ field, fromRow, currentVal, sourceTd, btn }); }));
    hostEl.querySelectorAll('[data-mc-pd-field]').forEach(input => input.addEventListener('change', () => { const fieldKey = input.dataset.mcPdField; const lineKey = input.dataset.mcPdLinekey; const rowIndex = Number(input.dataset.mcPdRow || input.dataset.mcRow || 0); const value = input.value; if (typeof this.onProcessInputChange === 'function') this.onProcessInputChange({ fieldKey, lineKey, value, rowIndex, input }); }));
    hostEl.querySelectorAll('.mc-pd-filldown[data-mc-fill-field]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const fieldKey = btn.getAttribute('data-mc-fill-field') || ''; const fromRow = Number(btn.getAttribute('data-mc-fill-from') || 0); const cell = btn.closest('.mc-preview-pd-cell'); const input = cell?.querySelector('.mc-preview-pd-input'); const value = input ? input.value : ''; const pipingClassKey = input?.dataset?.mcPdPckey || ''; if (typeof this.onProcessFillDownClick === 'function') this.onProcessFillDownClick({ fieldKey, fromRow, value, btn, pipingClassKey }); }));
  }

  _renderLineKeyCell(row) {
    const key = this._escape(row.lineKey || row.lineKeyProposed || '—');
    const method = String(row.lineKeyMethod || '');
    if (method.startsWith('similar')) {
      const pct = Number.isFinite(Number(row.lineKeyConfidence)) ? `${Math.round(Number(row.lineKeyConfidence) * 100)}%` : '';
      const title = `Similar line key proposed from the line list master (${method}). Proposed: ${row.lineKeyProposed || ''} ${pct}`;
      return `${key} <span class="mc-preview-badge" style="background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);" title="${this._escapeAttr(title)}">≈ ${this._escape(row.lineKeyProposed || 'similar')} ${pct}</span>`;
    }
    return key;
  }

  _escape(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  _scorePercentFromConfidenceOrScore(confidence, rawScore, rawMax = 1000) { const confidenceValue = Number(confidence); if (Number.isFinite(confidenceValue)) return `${Math.round(confidenceValue * 100)}%`; const scoreValue = Number(rawScore); const maxValue = Number(rawMax); if (Number.isFinite(scoreValue) && Number.isFinite(maxValue) && maxValue > 0) return `${Math.max(0, Math.min(100, Math.round((scoreValue / rawMax) * 100)))}%`; return ''; }
  _rawScoreSuffix(rawScore) { return rawScore === null || rawScore === undefined || rawScore === '' ? '' : ` (raw ${rawScore})`; }
  _pipingClassTitle(row) { const classPercent = this._scorePercentFromConfidenceOrScore(row.pipingClassConfidence, row.pipingClassScore, 1000); const rowPercent = this._scorePercentFromConfidenceOrScore(row.pipingClassRowConfidence, row.pipingClassRowScore, 1620); const candidates = Array.isArray(row.pipingClassCandidates) ? row.pipingClassCandidates.slice(0, 8).map((candidate) => { const reasons = Array.isArray(candidate.reasons) ? candidate.reasons.join(', ') : ''; const percent = this._scorePercentFromConfidenceOrScore(candidate.confidence, candidate.score, 1000); return `${candidate.candidate || ''} | ${percent || '—'}${this._rawScoreSuffix(candidate.score)} | ${candidate.method || ''}${reasons ? ` | ${reasons}` : ''}`; }).join('\n') : ''; const rowReasons = Array.isArray(row.pipingClassRowReasons) ? row.pipingClassRowReasons.join(', ') : ''; return [`Requested class: ${row.pipingClassDerived || ''}`, `Resolved class: ${row.pipingClass || ''}`, `Method: ${row.pipingClassMethod || ''}`, `Class score: ${classPercent || '—'}${this._rawScoreSuffix(row.pipingClassScore)}`, `Row score: ${rowPercent || '—'}${this._rawScoreSuffix(row.pipingClassRowScore)}`, rowReasons ? `Row reasons: ${rowReasons}` : '', candidates ? `Candidates:\n${candidates}` : ''].filter(Boolean).join('\n'); }
  _escapeAttr(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
}
