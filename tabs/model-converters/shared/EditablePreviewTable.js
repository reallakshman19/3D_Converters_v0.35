import { renderColGroup, attachColumnResizers, loadColumnWidths } from './resizable-table.js';

export const BRANCH_COLUMNS = [
  { id: 'branchName', label: 'Branch Name', width: 220, minWidth: 120 },
  { id: 'lineKey', label: 'Line Key', width: 120, minWidth: 80 },
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

export class EditablePreviewTable {
  constructor({ branchRows, nodesByBranch, onCellEditClick, onFillDownClick, onProcessInputChange, onProcessFillDownClick, onWeightCandidateSelect, processInputHtmlRenderer, matchBadgeHtmlRenderer }) {
    this.branchRows = branchRows;
    this.nodesByBranch = nodesByBranch;
    this.onCellEditClick = onCellEditClick;
    this.onFillDownClick = onFillDownClick;
    this.onProcessInputChange = onProcessInputChange;
    this.onProcessFillDownClick = onProcessFillDownClick;
    this.processInputHtmlRenderer = processInputHtmlRenderer;
    this.matchBadgeHtmlRenderer = matchBadgeHtmlRenderer;
  }

  renderHTML() {
    const branchWidths = loadColumnWidths('xmlCii.preview.branch.columnWidths.v1');
    const colHdr = (col) => `
      <th class="mc-preview-th" data-col-id="${this._escapeAttr(col.id)}" style="position: relative;">
        <span class="xml-cii-th-label">${this._escape(col.label)}</span>${col.hint ? `<span class="mc-preview-edit-hint">${this._escape(col.hint)}</span>` : ''}
        <span class="xml-cii-col-resizer" data-resize-col="${this._escapeAttr(col.id)}"></span>
      </th>`;
    const branchColgroup = renderColGroup(BRANCH_COLUMNS, branchWidths);
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
    const editAttrs = (type, key, extra = '') => `data-mc-edit-type="${this._escapeAttr(type)}" data-mc-edit-key="${this._escapeAttr(key || row.lineKey || row.branchName || '')}" data-mc-edit-row="${ri}" data-mc-pc-key="${this._escapeAttr(type === 'wallThickness' ? classSizeKey : classKey)}" ${extra}`;
    const editablePlain = (type, value, key, source = '') => {
      const isDefault = source === 'default' || source === 'config-default' || source === 'default-zero';
      const cls = `mc-preview-editable-val${isDefault ? ' mc-preview-default-val' : ''}`;
      const style = isDefault ? ' style="color:#7f1d1d;font-weight:600;font-style:italic;" title="Config default value"' : '';
      const badge = source === 'override' ? ' <span class="mc-preview-badge exact">✓ override</span>' : (source === 'dtxr-sch-applied' ? ' <span class="mc-preview-badge exact" title="Wall thickness applied from DTXR schedule. Click cell to override manually.">✓ DTXR Sch</span>' : (source === 'dtxr-sch' ? ' <span class="mc-preview-badge exact" title="Wall thickness auto-derived from DTXR schedule text + bore. Click cell to override manually.">DTXR Sch (auto)</span>' : (isDefault ? ' <span class="mc-preview-badge bad">default</span>' : '')));
      return `<span class="${cls}"${style}>${this._escape(value || '—')}</span>${badge}`;
    };
    const classKey = smartClassKey(row);
    const classSizeKey = smartClassSizeKey(row);
    const materialCodeKey = row.materialCodeKey || classKey || row.material || row.lineKey;
    const wallKey = row.wallThicknessKey || classSizeKey || row.lineKey;
    const corrosionKey = row.corrosionKey || classKey || row.lineKey;

    return `
      <tr class="mc-preview-row${row.lineMiss ? ' mc-preview-line-miss' : ''}">
        <td class="mc-preview-td mc-preview-branch" title="${this._escapeAttr(row.branchName)}">${this._escape(row.branchName.length > 36 ? '…' + row.branchName.slice(-32) : row.branchName)}</td>
        <td class="mc-preview-td${row.lineMiss ? ' mc-preview-warn' : ''}">${this._escape(row.lineKey || '—')}</td>
        <td class="mc-preview-td">${this._escape(row.size || '—')}</td>
        <td ${tdApprox(row.pipingClassNeedsReview, editAttrs('pipingClass', row.pipingClassDerived, `data-mc-edit-derived="${this._escapeAttr(row.pipingClassDerived || '')}" title="${this._escapeAttr(pipingClassTitle)}"`))}>${pcBadge}${row.pipingClassNeedsReview ? fillDownBtn('pipingClass', ri) : ''}</td>
        <td ${tdApprox(false, editAttrs('material', row.lineKey))}>${editablePlain('material', row.material, row.lineKey, row.materialSource)}</td>
        <td ${tdApprox(false, editAttrs('rating', row.lineKey))}>${editablePlain('rating', row.rating, row.lineKey, row.ratingSource)}${fillDownBtn('rating', ri)}</td>
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

  _renderNodeTable(nw, ri, nodeWidths) {
    return `<table class="mc-preview-node-table xml-cii-preview-table--fixed" data-resizable-table="node-weight-${ri}">${renderColGroup(NODE_WEIGHT_COLUMNS, nodeWidths)}<thead><tr>${NODE_WEIGHT_COLUMNS.map(col => `<th data-col-id="${this._escapeAttr(col.id)}" style="position: relative;"><span class="xml-cii-th-label">${this._escape(col.label)}</span><span class="xml-cii-col-resizer" data-resize-col="${this._escapeAttr(col.id)}"></span></th>`).join('')}</tr></thead><tbody>${nw.map((nr, ni) => {
      const rowKey = nr.key || `${nr.branchName}::${nr.nodeNumber}`;
      const selectedWeight = nr.weightMatch ? (nr.weightMatch.selectedWeight ?? nr.weightMatch.suggestedWeight ?? nr.weightMatch.weight ?? '') : '';
      const selectedWeightMethod = nr.weightMatch?.weightMethod || '';
      return `<tr><td>${this._escape(nr.nodeNumber)}</td><td>${this._escape(nr.componentType)}</td><td>${nr.boreMm != null ? nr.boreMm.toFixed(0) + 'mm' : '—'}</td><td title="${this._escapeAttr(nr.resolvedPipingClass ? `Piping Class ${nr.resolvedPipingClass}` : '')}">${this._escape(nr.rating)}</td><td>${nr.lengthMm != null ? nr.lengthMm.toFixed(1) + 'mm' : '—'}</td><td class="xml-cii-dtxr-cell" title="${this._escapeAttr(nr.dtxrSource || nr.dtxrMatchedKey || '')}">${this._escape(nr.dtxr || 'Not found')}</td><td class="mc-preview-weight-value"><input type="number" min="0" step="0.001" class="mc-preview-weight-input${selectedWeight !== '' ? ' mc-preview-weight-selected' : ''}" data-mc-weight-cell="${this._escapeAttr(rowKey)}" data-mc-weight-key="${this._escapeAttr(rowKey)}" value="${this._escapeAttr(selectedWeight)}" placeholder="kg" title="${this._escapeAttr(selectedWeightMethod ? `Weight method: ${selectedWeightMethod}` : 'Weight override')}"></td><td>${nr.weightMatch ? nr.weightMatch.lengthDelta.toFixed(1) + 'mm' : '—'}</td><td class="mc-preview-candidates">${nr.weightCandidates.map((c, ci) => {
        const weight = c.selectedWeight ?? c.suggestedWeight ?? c.weight;
        const typeDesc = c.typeDesc || c.valveType || c.type || 'Unknown';
        const type = c.type || c.valveType || '';
        const delta = Number(c.lengthDelta);
        const method = c.weightMethod || '';
        const title = [`Type: ${type || '-'}`, `TypeDesc: ${typeDesc}`, `Weight: ${weight} kg`, method ? `Weight method: ${method}` : '', Number.isFinite(delta) ? `ΔLength: ${delta.toFixed(1)} mm` : '', c.semanticReason ? `Semantic: ${c.semanticReason}` : '', 'Click to use this candidate weight'].filter(Boolean).join('\n');
        return `<button type="button" class="mc-preview-candidate${ci === 0 ? ' best' : ''}${method === 'length-extrapolated' ? ' is-extrapolated' : ''}" data-mc-weight-candidate="1" data-mc-weight-key="${this._escapeAttr(rowKey)}" data-mc-weight-value="${this._escapeAttr(weight)}" data-mc-weight-valvetype="${this._escapeAttr(typeDesc)}" data-mc-weight-method="${this._escapeAttr(method)}" data-mc-weight-node-index="${ni}" data-mc-weight-candidate-index="${ci}" title="${this._escapeAttr(title)}">${this._escape(typeDesc)} · ${this._escape(weight)}kg · Δ${Number.isFinite(delta) ? delta.toFixed(1) : '—'}mm</button>`;
      }).join('')}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  bind(hostEl) {
    const branchTable = hostEl.querySelector('[data-resizable-table="branch-preview"]');
    if (branchTable) attachColumnResizers(branchTable, BRANCH_COLUMNS, { storageKey: 'xmlCii.preview.branch.columnWidths.v1' });
    hostEl.querySelectorAll('[data-mc-edit-type]').forEach(td => { td.style.cursor = 'pointer'; td.addEventListener('click', (e) => { if (e.target.closest('.mc-preview-filldown-btn')) return; const editType = td.getAttribute('data-mc-edit-type'); const derivedKey = td.getAttribute('data-mc-edit-derived') || td.getAttribute('data-mc-edit-key') || td.getAttribute('data-mc-edit-mat') || ''; let currentVal = td.querySelector('.mc-preview-editable-val')?.textContent?.trim() || ''; if (currentVal === '—') currentVal = ''; const rowIndex = Number(td.getAttribute('data-mc-edit-row') || 0); if (typeof this.onCellEditClick === 'function') this.onCellEditClick({ editType, derivedKey, currentVal, rowIndex, td }); }); });
    hostEl.querySelectorAll('.mc-preview-filldown-btn[data-mc-fill-field]:not(.mc-pd-filldown)').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const field = btn.getAttribute('data-mc-fill-field') || ''; const fromRow = Number(btn.getAttribute('data-mc-fill-from') || 0); const sourceTd = btn.closest('[data-mc-edit-type]'); const currentVal = sourceTd?.querySelector('.mc-preview-editable-val')?.textContent?.trim() || ''; if (typeof this.onFillDownClick === 'function') this.onFillDownClick({ field, fromRow, currentVal, sourceTd, btn }); }));
    hostEl.querySelectorAll('[data-mc-pd-field]').forEach(input => input.addEventListener('change', () => { const fieldKey = input.dataset.mcPdField; const lineKey = input.dataset.mcPdLinekey; const rowIndex = Number(input.dataset.mcPdRow || 0); const value = input.value; if (typeof this.onProcessInputChange === 'function') this.onProcessInputChange({ fieldKey, lineKey, value, rowIndex, input }); }));
    hostEl.querySelectorAll('.mc-pd-filldown[data-mc-fill-field]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const fieldKey = btn.getAttribute('data-mc-fill-field') || ''; const fromRow = Number(btn.getAttribute('data-mc-fill-from') || 0); const cell = btn.closest('.mc-preview-pd-cell'); const input = cell?.querySelector('.mc-preview-pd-input'); const value = input ? input.value : ''; const pipingClassKey = input?.dataset?.mcPdPckey || ''; if (typeof this.onProcessFillDownClick === 'function') this.onProcessFillDownClick({ fieldKey, fromRow, value, btn, pipingClassKey }); }));
  }

  _escape(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  _scorePercentFromConfidenceOrScore(confidence, rawScore, rawMax = 1000) { const confidenceValue = Number(confidence); if (Number.isFinite(confidenceValue)) return `${Math.round(confidenceValue * 100)}%`; const scoreValue = Number(rawScore); const maxValue = Number(rawMax); if (Number.isFinite(scoreValue) && Number.isFinite(maxValue) && maxValue > 0) return `${Math.max(0, Math.min(100, Math.round((scoreValue / maxValue) * 100)))}%`; return ''; }
  _rawScoreSuffix(rawScore) { return rawScore === null || rawScore === undefined || rawScore === '' ? '' : ` (raw ${rawScore})`; }
  _pipingClassTitle(row) { const classPercent = this._scorePercentFromConfidenceOrScore(row.pipingClassConfidence, row.pipingClassScore, 1000); const rowPercent = this._scorePercentFromConfidenceOrScore(row.pipingClassRowConfidence, row.pipingClassRowScore, 1620); const candidates = Array.isArray(row.pipingClassCandidates) ? row.pipingClassCandidates.slice(0, 8).map((candidate) => { const reasons = Array.isArray(candidate.reasons) ? candidate.reasons.join(', ') : ''; const percent = this._scorePercentFromConfidenceOrScore(candidate.confidence, candidate.score, 1000); return `${candidate.candidate || ''} | ${percent || '—'}${this._rawScoreSuffix(candidate.score)} | ${candidate.method || ''}${reasons ? ` | ${reasons}` : ''}`; }).join('\n') : ''; const rowReasons = Array.isArray(row.pipingClassRowReasons) ? row.pipingClassRowReasons.join(', ') : ''; return [`Requested class: ${row.pipingClassDerived || ''}`, `Resolved class: ${row.pipingClass || ''}`, `Method: ${row.pipingClassMethod || ''}`, `Class score: ${classPercent || '—'}${this._rawScoreSuffix(row.pipingClassScore)}`, `Row score: ${rowPercent || '—'}${this._rawScoreSuffix(row.pipingClassRowScore)}`, rowReasons ? `Row reasons: ${rowReasons}` : '', candidates ? `Candidates:\n${candidates}` : ''].filter(Boolean).join('\n'); }
  _escapeAttr(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
}
