import { decodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';

function _toText(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

const STAGED_CSV_ALL_COLUMNS = Object.freeze([
  { key: 'site',        label: 'Site' },
  { key: 'pipe',        label: 'Pipe' },
  { key: 'branchSeg',   label: 'Branch' },
  { key: 'branchBore',  label: 'Branch Bore' },
  { key: 'compName',    label: 'Component Name' },
  { key: 'compType',    label: 'Component Type' },
  { key: 'ref',         label: 'Ref No' },
  { key: 'name',        label: 'NAME' },
  { key: 'cmpsuprefn',  label: 'CMPSUPREFN' },
  { key: 'desc',        label: 'DESC' },
  { key: 'type',        label: 'TYPE' },
  { key: 'dtxr',        label: 'DTXR' },
  { key: 'mtxx',        label: 'Material (MTXX)' },
  { key: 'abore',       label: 'Bore A' },
  { key: 'lbore',       label: 'Bore L' },
  { key: 'spre',        label: 'Spec (SPRE)' },
  { key: 'stex',        label: 'STEX' },
  { key: 'mdssupptype', label: 'MDSSUPPTYPE' },
  { key: 'cmpsupgap',   label: 'CMPSUPGAP' },
  { key: 'lstu',        label: 'Catalogue (LSTU)' },
  { key: 'posX',        label: 'Pos X (mm)' },
  { key: 'posY',        label: 'Pos Y (mm)' },
  { key: 'posZ',        label: 'Pos Z (mm)' },
  { key: 'supportType', label: 'Support Type' },
]);

const STAGED_CSV_DEFAULT_SUPPORT_TYPE_RULES = Object.freeze([
  { col: 'dtxr',        contains: 'GUI',      notContains: '',    result: 'G'    },
  { col: 'dtxr',        contains: 'STOP',     notContains: '',    result: 'LS'   },
  { col: 'dtxr',        contains: 'NON GRIP', notContains: '',    result: 'G'    },
  { col: 'dtxr',        contains: 'GRIP',     notContains: 'NON', result: 'G+LS' },
  { col: 'dtxr',        contains: 'REST',     notContains: '',    result: 'R'    },
  { col: 'dtxr',        contains: 'SHOE',     notContains: '',    result: 'R'    },
  { col: 'dtxr',        contains: 'HAN',      notContains: '',    result: 'H'    },
  { col: 'mdssupptype', contains: 'AT',       notContains: '',    result: 'R'    },
  { col: 'mdssupptype', contains: 'G',        notContains: '',    result: 'G'    },
  { col: 'mdssupptype', contains: 'ST5',      notContains: '',    result: 'LS'   },
]);

function _stagedJsonExtractSiteAndPipe(branchName) {
  const pathParts = _toText(branchName).replace(/^\//, '').split('/');
  const pipeFull = pathParts[0] || '';
  const branchSeg = pathParts[1] || '';
  const m = pipeFull.match(/^(.*?)(\d+".*)/);
  const site = m ? (m[1].replace(/-$/, '') || '(no site)') : '(no site)';
  const pipe = m ? m[2] : pipeFull;
  return { site, pipe, branch: branchSeg, pipeFull };
}

function _stagedJsonCsvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _parseCsvColumnConfig(raw) {
  const master = STAGED_CSV_ALL_COLUMNS.map((c) => ({ ...c, visible: true }));
  if (!raw) return master;
  let stored;
  try { stored = JSON.parse(raw); } catch { return master; }
  if (!Array.isArray(stored)) return master;
  const storedKeys = stored.map((s) => s.key);
  const result = stored
    .map((s) => {
      const def = master.find((m) => m.key === s.key);
      return def ? { ...def, visible: s.visible !== false } : null;
    })
    .filter(Boolean);
  for (const col of master) {
    if (!storedKeys.includes(col.key)) result.push({ ...col, visible: true });
  }
  return result;
}

function _parseSupportTypeRules(raw) {
  if (!raw) return STAGED_CSV_DEFAULT_SUPPORT_TYPE_RULES.map((r) => ({ ...r }));
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  return STAGED_CSV_DEFAULT_SUPPORT_TYPE_RULES.map((r) => ({ ...r }));
}

function _computeSupportType(mergedRow, rules) {
  const resultSet = new Set();
  for (const rule of rules) {
    const colKey = rule.col || 'dtxr';
    const cellVal = String(mergedRow[colKey] || '').toUpperCase();
    const parts = cellVal.split('|').map((s) => s.trim()).filter(Boolean);
    const contains    = String(rule.contains    || '').toUpperCase().trim();
    const notContains = String(rule.notContains || '').toUpperCase().trim();
    const result      = String(rule.result      || '').trim();
    if (!contains || !result) continue;
    if (!contains || !result) continue;
    for (const part of parts) {
      if (!part.includes(contains)) continue;
      if (notContains && part.includes(notContains)) continue;
      for (const token of result.split('+').map((t) => t.trim()).filter(Boolean)) {
        resultSet.add(token);
      }
    }
  }
  return [...resultSet].join('+');
}

export function _buildCsvFromStagedJson(stagedJsonText, _inputName, columnConfigRaw, supportTypeRulesRaw) {
  let branches;
  try {
    branches = JSON.parse(_toText(stagedJsonText));
  } catch (e) {
    throw new Error(`Staged JSON parse failed: ${_toText(e?.message || e)}`);
  }
  if (!Array.isArray(branches)) {
    throw new Error('Staged JSON root must be an array of branch objects.');
  }

  const colConfig = _parseCsvColumnConfig(columnConfigRaw || '');
  const activeCols = colConfig.filter((c) => c.visible !== false);

  const _branchSortKey = (b) => {
    const attrs = b.attributes || {};
    const site = _toText(attrs.OWNER_SITE || '').replace(/^\//, '');
    const pipe = _toText(attrs.OWNER || '').replace(/^\//, '');
    const seg  = _toText(b.name || '').replace(/^\//, '').split('/').pop() || '';
    return [site || _stagedJsonExtractSiteAndPipe(b.name || '').site,
            pipe || _stagedJsonExtractSiteAndPipe(b.name || '').pipe,
            seg];
  };
  const sortedBranches = [...branches].sort((a, b) => {
    const [as_, ap, ab] = _branchSortKey(a);
    const [bs, bp, bb]  = _branchSortKey(b);
    return as_.localeCompare(bs) || ap.localeCompare(bp) || ab.localeCompare(bb);
  });

  const allRecords = [];
  for (const branch of sortedBranches) {
    const bAttrs = branch.attributes || {};
    const ownerPipe = _toText(bAttrs.OWNER || '').replace(/^\//, '');
    const ownerSite = _toText(bAttrs.OWNER_SITE || '').replace(/^\//, '');
    const fallback = _stagedJsonExtractSiteAndPipe(branch.name || '');
    const site      = ownerSite || fallback.site;
    const pipe      = ownerPipe || fallback.pipe;
    const branchSeg = _toText(branch.name || '').replace(/^\//, '').split('/').pop() || fallback.branch;
    const branchBore = _toText(branch.bore || '');

    for (const comp of (branch.children || [])) {
      const attrs = comp.attributes || {};
      const pos = attrs.POS || attrs.APOS || attrs.CPOS || null;
      const posX = pos && typeof pos === 'object' ? _toText(pos.x ?? '') : '';
      const posY = pos && typeof pos === 'object' ? _toText(pos.y ?? '') : '';
      const posZ = pos && typeof pos === 'object' ? _toText(pos.z ?? '') : '';
      allRecords.push({
        site, pipe, branchSeg, branchBore,
        compName:    _toText(comp.name || ''),
        compType:    _toText(comp.type || ''),
        ref:         _toText(attrs.REF || ''),
        name:        _toText(attrs.NAME || ''),
        cmpsuprefn:  _toText(attrs.CMPSUPREFN || ''),
        desc:        _toText(attrs.DESC || ''),
        type:        _toText(attrs.TYPE || comp.type || ''),
        dtxr:        _toText(attrs.DTXR || ''),
        mtxx:        _toText(attrs.MTXX || ''),
        abore:       _toText(attrs.ABORE || ''),
        lbore:       _toText(attrs.LBORE || ''),
        spre:        _toText(attrs.SPRE || ''),
        stex:        _toText(attrs.STEX || ''),
        mdssupptype: _toText(attrs.MDSSUPPTYPE || ''),
        cmpsupgap:   _toText(attrs.CMPSUPGAP || ''),
        lstu:        _toText(attrs.LSTU || ''),
        posX, posY, posZ,
      });
    }
  }

  const _COMPUTED_COL_KEYS = new Set(['supportType']);
  const supportTypeRules = _parseSupportTypeRules(supportTypeRulesRaw || '');
  const MERGE_FIELDS = activeCols.map((c) => c.key).filter(
    (k) => k !== 'ref' && k !== 'posX' && k !== 'posY' && k !== 'posZ' && !_COMPUTED_COL_KEYS.has(k),
  );
  const groups = new Map();
  let noRefIdx = 0;
  for (const rec of allRecords) {
    const posKey = (rec.posX !== '' || rec.posY !== '' || rec.posZ !== '')
      ? `${rec.posX}\x02${rec.posY}\x02${rec.posZ}`
      : 'nopos';
    const key = rec.ref
      ? `${rec.ref}\x01${posKey}`
      : (posKey !== 'nopos' ? `\x00pos_${posKey}` : `\x00noref_${noRefIdx++}`);
    if (!groups.has(key)) groups.set(key, { firstRec: rec, recs: [] });
    groups.get(key).recs.push(rec);
  }

  const outputRows = [];
  for (const { firstRec, recs } of groups.values()) {
    const merged = {
      ref:  firstRec.ref,
      posX: firstRec.posX,
      posY: firstRec.posY,
      posZ: firstRec.posZ,
    };
    for (const f of MERGE_FIELDS) {
      const unique = [...new Set(recs.map((r) => r[f] ?? '').filter((v) => v !== ''))];
      merged[f] = unique.join('|');
    }
    merged.supportType = _computeSupportType(merged, supportTypeRules);
    outputRows.push({ _sort: firstRec, merged });
  }

  outputRows.sort((a, b) =>
    a._sort.site.localeCompare(b._sort.site)
    || a._sort.pipe.localeCompare(b._sort.pipe)
    || a._sort.branchSeg.localeCompare(b._sort.branchSeg)
  );

  const headerRow = activeCols.map((c) => c.label);
  const csvRows = [headerRow];
  for (const { merged: m } of outputRows) {
    csvRows.push(activeCols.map((c) => m[c.key] ?? ''));
  }

  const csvText = csvRows.map((r) => r.map(_stagedJsonCsvCell).join(',')).join('\n');
  return { csvText, rowCount: outputRows.length, branchCount: sortedBranches.length };
}

export async function run(context) {
  const primary = context.inputFiles.find(f => f.role === 'primary');
  if (!primary || !primary.bytes) {
    throw new Error('Primary staged JSON input is required for StagedJSON -> CSV export.');
  }
  const stagedJsonText = decodeTextUtf8(primary.bytes);
  const csvResult = _buildCsvFromStagedJson(
    stagedJsonText,
    primary.name,
    context.options.csvColumns,
    context.options.supportTypeRules
  );

  const outputName = `${baseNameWithoutExtension(primary.name)}_staged_export.csv`;

  context.setStatus(
    `Staged JSON parsed: ${csvResult.branchCount} branch(es). Exported ${csvResult.rowCount} component row(s) to CSV (grouped by Site > Pipe > Branch).`,
    'ok'
  );

  return {
    ok: true,
    outputs: [
      {
        name: outputName,
        text: csvResult.csvText,
        mime: 'text/plain;charset=utf-8'
      }
    ],
    logs: {
      stdout: [
        `Staged JSON parsed: ${csvResult.branchCount} branch(es).`,
        `Exported ${csvResult.rowCount} component row(s) to CSV (grouped by Site > Pipe > Branch).`
      ],
      stderr: []
    }
  };
}
