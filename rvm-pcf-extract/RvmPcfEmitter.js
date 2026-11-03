/**
 * RvmPcfEmitter.js
 *
 * Emits PCF text for the RVM extractor using the repo's existing
 * MESSAGE-SQUARE + component-block dialect.
 *
 * Inputs: final 2D CSV row objects.
 * Outputs: grouped PCF text by pipeline reference, plus structured errors/warnings.
 * Fallback: partial mode skips invalid blocks; no fake origin coordinates are emitted.
 */

const DECIMALS = 4;

function _clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function _safeText(value) {
  return _clean(value).replace(/[\r\n]+/g, ' ');
}

function _toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function _isValidPoint(pt) {
  if (!pt || typeof pt !== 'object') return false;
  const x = Number(pt.x);
  const y = Number(pt.y);
  const z = Number(pt.z);
  if (![x, y, z].every(Number.isFinite)) return false;
  return !(x === 0 && y === 0 && z === 0);
}

function _formatNumber(value) {
  return Number(value).toFixed(DECIMALS);
}

function _formatPoint(pt, bore) {
  if (!_isValidPoint(pt)) return null;
  const coordBore = Number.isFinite(Number(bore)) ? Number(bore) : 0;
  return [
    _formatNumber(pt.x),
    _formatNumber(pt.y),
    _formatNumber(pt.z),
    _formatNumber(coordBore),
  ].join(' ');
}

function _distance(a, b) {
  if (!_isValidPoint(a) || !_isValidPoint(b)) return null;
  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  const dz = Number(b.z) - Number(a.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function _dominantDirection(from, to) {
  if (!_isValidPoint(from) || !_isValidPoint(to)) return null;

  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  const dz = Number(to.z) - Number(from.z);
  const axes = [
    { axis: 'X', value: Math.abs(dx), label: dx >= 0 ? 'EAST' : 'WEST' },
    { axis: 'Y', value: Math.abs(dy), label: dy >= 0 ? 'NORTH' : 'SOUTH' },
    { axis: 'Z', value: Math.abs(dz), label: dz >= 0 ? 'UP' : 'DOWN' },
  ].sort((a, b) => b.value - a.value);

  if (!axes[0] || axes[0].value === 0) return null;
  return axes[0].label;
}

function _rowRefNo(row) {
  const value = row?.ca?.['97'] ?? row?.refNo ?? row?.refno ?? row?.sourceCanonicalId ?? row?.pipelineRef ?? '';
  const text = _clean(value);
  return text || null;
}

function _rowSeqNo(row) {
  const value = row?.ca?.['98'] ?? row?.seqNo ?? row?.seqno ?? row?.rowNo ?? '';
  const text = _clean(value);
  return text || null;
}

function _rowMaterial(row) {
  return _clean(row?.material || row?.attributes?.MATERIAL || row?.attributes?.['COMPONENT-ATTRIBUTE3'] || '');
}

function _rowLengthMm(row) {
  const brlen = _toNumber(row?.brlen);
  if (brlen != null && brlen > 0) return brlen;
  const d = _distance(row?.ep1, row?.ep2);
  if (d != null && d > 0) return d;
  return null;
}

function _messageSquareText(row) {
  const type = _clean(row?.type || 'ROW').toUpperCase();
  const refNo = _rowRefNo(row);
  const seqNo = _rowSeqNo(row);

  if (type === 'SUPPORT') {
    const supportName = _clean(row?.supportName || 'CA150');
    const supportGuid = _clean(row?.supportGuid || 'UCI:UNKNOWN');
    return `SUPPORT, RefNo:=${refNo || seqNo || '0'}, SeqNo:${seqNo || '0'}, ${supportName}, ${supportGuid}`;
  }

  const tokens = [type];

  const material = _rowMaterial(row);
  if (material) tokens.push(material);

  const len = _rowLengthMm(row);
  if (len != null && len > 0) {
    tokens.push(`LENGTH=${_formatNumber(len)}MM`);
  }

  const direction = _dominantDirection(row?.ep1, row?.ep2);
  if (direction) tokens.push(direction);

  tokens.push(`RefNo:=${refNo || seqNo || '0'}`);
  tokens.push(`SeqNo:${seqNo || '0'}`);

  if ((type === 'TEE' || type === 'OLET') && Number.isFinite(Number(row?.brlen))) {
    tokens.push(`BrLen=${_formatNumber(row.brlen)}MM`);
  }

  return tokens.join(', ');
}

function _headerLines(pipelineRef) {
  return [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
    `PIPELINE-REFERENCE ${_safeText(pipelineRef)}`,
    '    PROJECT-IDENTIFIER P1',
    '    AREA A1',
    '',
  ];
}

function _diag(code, message, row, severity = 'ERROR', extra = {}) {
  return {
    severity,
    code,
    message,
    rowNo: row?.rowNo ?? null,
    type: row?.type ?? null,
    pipelineRef: row?.pipelineRef ?? null,
    sourceCanonicalId: row?.sourceCanonicalId ?? null,
    ...extra,
  };
}

function _validate(row) {
  const type = _clean(row?.type || 'UNKNOWN').toUpperCase();
  const errors = [];

  const need = (coord, name) => {
    if (!_isValidPoint(coord)) {
      errors.push(
        _diag(
          'MISSING-GEOMETRY',
          `${type} row ${row?.rowNo ?? '?'} missing ${name}`,
          row,
          'ERROR',
          { coordinate: name }
        )
      );
    }
  };

  switch (type) {
    case 'PIPE':
    case 'FLANGE':
    case 'VALVE':
    case 'REDUCER-CONCENTRIC':
    case 'REDUCER-ECCENTRIC':
      need(row?.ep1, 'ep1');
      need(row?.ep2, 'ep2');
      break;

    case 'BEND':
      need(row?.ep1, 'ep1');
      need(row?.ep2, 'ep2');
      need(row?.cp, 'cp');
      break;

    case 'TEE':
      need(row?.ep1, 'ep1');
      need(row?.ep2, 'ep2');
      need(row?.cp, 'cp');
      need(row?.bp, 'bp');
      break;

    case 'OLET':
      need(row?.cp, 'cp');
      need(row?.bp, 'bp');
      break;

    case 'SUPPORT':
      if (!_isValidPoint(row?.supportCoor) && !_isValidPoint(row?.cp) && !_isValidPoint(row?.ep1)) {
        errors.push(
          _diag(
            'MISSING-GEOMETRY',
            `SUPPORT row ${row?.rowNo ?? '?'} missing supportCoor/cp/ep1`,
            row,
            'ERROR',
            { coordinate: 'supportCoor|cp|ep1' }
          )
        );
      }
      break;

    default:
      // Structural rows such as BRANCH are not emitted as PCF blocks.
      break;
  }

  return errors;
}

function _emitCaLines(row) {
  const lines = [];
  const ca = row?.ca || {};
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '97', '98']) {
    const value = ca[key];
    if (value == null) continue;
    const text = _clean(value);
    if (!text) continue;
    lines.push(`    COMPONENT-ATTRIBUTE${key} ${_safeText(text)}`);
  }
  return lines;
}

function _emitBlock(row) {
  const type = _clean(row?.type || 'UNKNOWN').toUpperCase();
  const lines = [];
  const emitPoint = (keyword, pt, bore) => {
    const formatted = _formatPoint(pt, bore);
    if (formatted) {
      lines.push(`    ${keyword} ${formatted}`);
    }
  };

  lines.push(type);

  switch (type) {
    case 'PIPE':
      emitPoint('END-POINT', row.ep1, row.convertedBore);
      emitPoint('END-POINT', row.ep2, row.convertedBore);
      if (_clean(row.pipelineRef)) {
        lines.push(`    PIPELINE-REFERENCE ${_safeText(row.pipelineRef)}`);
      }
      break;

    case 'BEND':
      emitPoint('END-POINT', row.ep1, row.convertedBore);
      emitPoint('END-POINT', row.ep2, row.convertedBore);
      emitPoint('CENTRE-POINT', row.cp, row.convertedBore);
      break;

    case 'TEE':
      emitPoint('END-POINT', row.ep1, row.convertedBore);
      emitPoint('END-POINT', row.ep2, row.convertedBore);
      emitPoint('CENTRE-POINT', row.cp, row.convertedBore);
      emitPoint('BRANCH1-POINT', row.bp, row.branchConvertedBore ?? row.branchBore ?? row.convertedBore);
      break;

    case 'OLET':
      emitPoint('CENTRE-POINT', row.cp, row.convertedBore);
      emitPoint('BRANCH1-POINT', row.bp, row.branchConvertedBore ?? row.branchBore ?? row.convertedBore);
      break;

    case 'SUPPORT':
      emitPoint('CO-ORDS', row.supportCoor || row.cp || row.ep1, 0);
      if (_clean(row.supportName)) {
        lines.push(`    <SUPPORT_NAME> ${_safeText(row.supportName)}`);
      }
      if (_clean(row.supportGuid)) {
        lines.push(`    <SUPPORT_GUID> ${_safeText(row.supportGuid)}`);
      }
      break;

    case 'FLANGE':
    case 'VALVE':
    case 'REDUCER-CONCENTRIC':
    case 'REDUCER-ECCENTRIC':
      emitPoint('END-POINT', row.ep1, row.convertedBore);
      emitPoint('END-POINT', row.ep2, row.convertedBore);
      break;

    default:
      emitPoint('END-POINT', row.ep1, row.convertedBore);
      emitPoint('END-POINT', row.ep2, row.convertedBore);
      emitPoint('CENTRE-POINT', row.cp, row.convertedBore);
      break;
  }

  if (type !== 'PIPE' && type !== 'SUPPORT' && _clean(row.skey)) {
    lines.push(`    <SKEY> ${_safeText(row.skey)}`);
  }

  lines.push(..._emitCaLines(row));
  return lines;
}

export class RvmPcfEmitter {
  constructor(options = {}) {
    this.allowPartialPcf = options.allowPartialPcf === true;
  }

  emit(rows) {
    const errors = [];
    const warnings = [];
    const includedRows = (rows || []).filter(row => row.include !== false);

    for (const row of includedRows) {
      errors.push(..._validate(row));
    }

    if (errors.length > 0 && !this.allowPartialPcf) {
      return {
        pcfTextByPipelineRef: {},
        errors,
        warnings,
      };
    }

    const groups = new Map();
    for (const row of includedRows) {
      const ref = _clean(row.pipelineRef) || 'RVM-EXTRACT';
      if (!groups.has(ref)) {
        groups.set(ref, []);
      }
      groups.get(ref).push(row);
    }

    const pcfTextByPipelineRef = {};

    for (const [ref, refRows] of groups) {
      const lines = _headerLines(ref);

      for (const row of refRows) {
        const rowErrors = _validate(row);
        if (rowErrors.length > 0) {
          if (this.allowPartialPcf) {
            warnings.push(
              _diag(
                'PCF-BLOCK-SKIPPED-PARTIAL',
                `${row.type} row ${row.rowNo} skipped because required geometry is missing.`,
                row,
                'WARNING',
                { rowErrors }
              )
            );
            continue;
          }
          continue;
        }

        lines.push('MESSAGE-SQUARE');
        lines.push(`    ${_messageSquareText(row)}`);
        lines.push(..._emitBlock(row));
        lines.push('');
      }

      pcfTextByPipelineRef[ref] = `${lines.join('\r\n').replace(/\r\n$/, '')}\r\n`;
    }

    return {
      pcfTextByPipelineRef,
      errors,
      warnings,
    };
  }
}

