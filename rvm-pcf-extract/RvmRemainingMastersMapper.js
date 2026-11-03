import { applyLineListCaUnitsToRow } from './RvmLineListUnitDetector.js';

const DEFAULT_SKEY = {
  'BEND': 'ELBW',
  'TEE': 'TEBW',
  'OLET': 'OLWL',
  'FLANGE': 'FLWN',
  'VALVE': 'VVBW',
  'REDUCER-CONCENTRIC': 'RCBW',
  'REDUCER-ECCENTRIC': 'REBW',
};

const DROP_TYPES = new Set(['GASK', 'INST', 'WELD', 'UNKNOWN', 'MISC']);

function _dist(a, b) {
  if (!a || !b) return null;
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function _normalizeCAKey(raw) {
  const s = String(raw).toUpperCase().replace(/[_\-]/g, '');
  const m = s.match(/^CA(\d+)$/);
  return m ? m[1] : null;
}

export class RvmRemainingMastersMapper {
  constructor(masters = {}) {
    this.masters = masters;
  }

  mapRow(row) {
    row.skey = row.skey || null;
    row.brlen = row.brlen || null;
    row.supportName = row.supportName || null;
    row.supportGuid = row.supportGuid || null;
    row.ca = row.ca || {};
    row.diagnostics = row.diagnostics || [];

    this._applySkey(row);
    this._applyDropRules(row);
    this._applyBrlen(row);
    this._applyCA(row);
    this._applyLinelist(row);
    this._applySupport(row);
  }

  _applyLinelist(row) {
    const { linelist } = this.masters;
    const linelistBlock = this.masters.linelistBlock || this.masters.linelist;

    let linelistRows = [];
    let fieldMap = {};
    if (linelistBlock && Array.isArray(linelistBlock.rows)) {
        linelistRows = linelistBlock.rows;
        fieldMap = linelistBlock.linelistFieldMap || {};
    } else if (Array.isArray(linelist)) {
        linelistRows = linelist;
        fieldMap = this.options?.fieldMap?.linelistFieldMap || {};
    }

    if (!linelistRows || !Array.isArray(linelistRows)) return;
    
    // Find matching linelist row based on pipelineRef or lineKey
    const match = linelistRows.find(m => m.pipelineRef === row.pipelineRef || m.lineNo === row.pipelineRef || m.ColumnX1 === row.pipelineRef);
    if (!match) return;

    applyLineListCaUnitsToRow({
      row,
      lineListRow: match,
      fieldMap: fieldMap,
      diagnostics: row.diagnostics || []
    });
  }

  _applySkey(row) {
    if (row.type === 'PIPE') {
      row.skey = null;
      return;
    }

    const { skeyMaster } = this.masters;
    if (skeyMaster && Array.isArray(skeyMaster)) {
      const match = skeyMaster.find((m) => {
        const typeMatch = !m.type || m.type === row.type;
        const boreMatch = !m.convertedBore || m.convertedBore === row.convertedBore;
        const classMatch = !m.pipingClass || m.pipingClass === row.pipingClass;
        return typeMatch && boreMatch && classMatch;
      });
      if (match && match.skey) {
        row.skey = match.skey;
        return;
      }
    }
    row.skey = DEFAULT_SKEY[row.type] || null;
  }

  _applyDropRules(row) {
    if (DROP_TYPES.has(row.type)) {
      row.include = false;
    }
  }

  _applyBrlen(row) {
    if (row.type !== 'TEE' && row.type !== 'OLET') return;

    const attrs = row.attributes || {};
    const isCrefFallback = row.diagnostics.includes('BP-CREF-FALLBACK');
    const isOriDerived = row.diagnostics.includes('BP-ORI-DERIVED');

    // 1. Direct attribute
    const rawBrlen = attrs['BRLEN'] ?? attrs['brlen'];
    if (rawBrlen != null) {
      const n = Number(rawBrlen);
      if (Number.isFinite(n) && n > 0) { row.brlen = n; }
    }

    // 2. cp-bp distance (trust for TEEs always; for OLETs only when bp is from direct BPOS)
    if (row.brlen == null && row.cp && row.bp) {
      const d = _dist(row.cp, row.bp);
      if (d != null && d > 0) {
        if (row.type !== 'OLET' || (!isCrefFallback && !isOriDerived)) {
          row.brlen = d;
        }
      }
    }

    // 3. Branch Geometry Master
    if (row.brlen == null) {
      const { branchGeometryMaster } = this.masters;
      if (Array.isArray(branchGeometryMaster)) {
        const match = branchGeometryMaster.find((m) => {
          const tMatch = !m.type || m.type === row.type;
          const bMatch = !m.convertedBore || m.convertedBore === row.convertedBore;
          return tMatch && bMatch && m.brlen != null;
        });
        if (match) { row.brlen = Number(match.brlen); }
      }
    }

    // 3b. SPRE-derived default for OLETs (e.g. "BR6B-350x50" → branchBore=50 → brlen=200)
    if (row.brlen == null && row.type === 'OLET') {
      const spreVal = String(attrs.SPRE ?? attrs.spre ?? '');
      const spreMatch = spreVal.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (spreMatch) {
        const branchBore = Math.min(Number(spreMatch[1]), Number(spreMatch[2]));
        if (Number.isFinite(branchBore) && branchBore > 0) {
          row.brlen = branchBore * 4;
        }
      }
    }

    // 4. Unresolved
    if (row.brlen == null) {
      row.diagnostics.push('BRLEN-UNRESOLVED');
    }

    // 5. If we have a fallback bp (CREF or ORI-derived) AND we resolved a more precise brlen
    //    from the master table, rescale the bp along its direction vector to match.
    if (row.cp && row.bp && (isCrefFallback || isOriDerived) && row.brlen != null) {
      const d = _dist(row.cp, row.bp);
      if (d > 0.1) {
        const ratio = row.brlen / d;
        row.bp = {
          x: row.cp.x + (row.bp.x - row.cp.x) * ratio,
          y: row.cp.y + (row.bp.y - row.cp.y) * ratio,
          z: row.cp.z + (row.bp.z - row.cp.z) * ratio,
        };
      }
    }
  }

  _applyCA(row) {
    const attrs = row.attributes || {};
    const type = row.type;

    if (type === 'SUPPORT') {
      row.ca = {};
      return;
    }

    const isPipeLike = ['PIPE', 'BEND', 'TEE', 'OLET'].includes(type);
    const isFittingLike = ['FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'].includes(type);

    for (const [attrKey, attrVal] of Object.entries(attrs)) {
      const caKey = _normalizeCAKey(attrKey);
      if (!caKey) continue;
      const n = Number(caKey);

      if (isPipeLike) {
        if (n === 8) continue; // skip CA8 for pipe-like
        if ((n >= 1 && n <= 10) || caKey === '97' || caKey === '98') {
          row.ca[caKey] = attrVal;
        }
      } else if (isFittingLike) {
        if (n >= 1 && n <= 10) {
          if (caKey === '8' && row.ca['8'] != null) continue; // preserve Wave 6 value
          row.ca[caKey] = attrVal;
        }
      }
    }
  }

  _applySupport(row) {
    if (row.type !== 'SUPPORT') return;

    const attrs = row.attributes || {};

    // Name
    const directName = attrs['SUPPORT_NAME'] || attrs['SUPPORTNAME'];
    if (directName) {
      row.supportName = String(directName);
    } else {
      const { supportMaster } = this.masters;
      if (Array.isArray(supportMaster)) {
        const match = supportMaster.find((m) => {
          const kindMatch = !m.supportKind || m.supportKind === attrs['SUPPORT_KIND'];
          const frictMatch = m.friction == null || m.friction === Number(attrs['FRICTION']);
          const gapMatch = !m.gap || m.gap === attrs['GAP'];
          return kindMatch && frictMatch && gapMatch;
        });
        if (match && match.name) {
          row.supportName = match.name;
        }
      }
      if (!row.supportName) row.supportName = 'CA150';
    }

    // GUID
    const rawGuid = attrs['SUPPORT_GUID'] || attrs['SUPPORTGUID'];
    if (rawGuid) {
      row.supportGuid = 'UCI:' + String(rawGuid);
    }

    // Ensure CA cleared
    row.ca = {};
  }
}
