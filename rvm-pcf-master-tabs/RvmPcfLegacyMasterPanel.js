import { state, updateRvmPcfExtractState } from '../core/state.js';
import {
  CONVERTED_BORE_COL,
  ensureConvertedBoreRows,
  guessBoreSourceColumn
} from '../pcf-legacy/services/bore-converter.js';
import {
  autoMapLineListFields,
  loadLegacyLineListStorage
} from '../rvm-pcf-extract/RvmLineListMasterLogic.js';

const MASTER_DEFS = {
  linelist: {
    title: 'Line List',
    description: 'Import line list and map Pipeline Ref / Line No / Class / Rating / Material fields.',
    stateKey: 'linelist',
    fieldMapKey: 'linelistFieldMap',
    defaultMap: {
      lineNo: ['LINE_NO', 'LINE NO', 'Line Number', 'Line No', 'Pipeline Ref', 'PIPELINE_REF'],
      service: ['Service', 'System', 'Fluid Service'],
      sequence: ['Sequence', 'Seq', 'Line Number', 'Line No', 'ISO', 'Pipeline Ref'],
      pipingClass: ['PIPING_CLASS', 'Piping Class', 'Class', 'Spec', 'SPEC'],
      rating: ['RATING', 'Rating', 'Pressure Class'],
      material: ['MATERIAL', 'Material', 'Material_Name'],
      schedule: ['SCHEDULE', 'Schedule', 'SCH'],
      wallThickness: ['WALL_THICKNESS', 'Wall Thickness', 'WT'],
      corrosionAllowance: ['CORROSION_ALLOWANCE', 'Corrosion Allowance', 'CA'],
      convertedBore: [CONVERTED_BORE_COL, 'DN', 'NB', 'Bore', 'Size', 'NPS'],
      p1: ['P1', 'Design Pr', 'Op. Pr', 'Oper. Pr', 'Max. Pr', 'Design Pressure', 'Operating Pressure'],
      t1: ['T1', 'Design Temp', 'Max Temp', 'Op. Temp', 'Oper. Temp', 'Operating Temp', 'Temperature'],
      insThk: ['InsThk', 'Insulation', 'Ins Thk', 'Ins. Thk', 'Insul', 'Insulation thickness'],
      insType: ['InsType', 'Insulation Type', 'Ins Type', 'Insul Type', 'Insulation Class'],
      densityDirect: ['Fluid Density', 'Density'],
      densityGas: ['Density (Gas)', 'Gas Density', 'Rho Gas', 'Vapor Density'],
      densityLiquid: ['Density (Liquid)', 'Liq Density', 'Density (Liq)', 'Rho Liq', 'Liquid Density'],
      densityMixed: ['Density (Mixed)', 'Mixed Density', 'Two Phase Density'],
      phase: ['Phase', 'Fluid State', 'State', 'Flow Phase'],
      hp: ['HP', 'Hydro', 'Test Pr', 'Hydrostatic', 'Hydro Pr']
    },
    required: ['lineNo'],
    convertBoreType: 'linelist'
  },

  weights: {
    title: 'Weights / Valve CA8',
    description: 'Import valve weight master. Legacy CA8 lookup key is Bore + Rating + Length.',
    stateKey: 'weight',
    fieldMapKey: 'weightFieldMap',
    defaultMap: {
      bore: [CONVERTED_BORE_COL, 'Size (NPS)', 'Size', 'NPS', 'DN', 'NB', 'Bore'],
      rating: ['Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class'],
      length: ['Length (RF-F/F)', 'RF-F/F', 'Length', 'LEN', 'Face To Face', 'faceToFace'],
      valveType: ['Type Description', 'Valve Type', 'Type', 'Description'],
      weight: ['RF/RTJ KG', 'Valve Weight', 'Weight', 'weight', 'valveWeight']
    },
    required: ['bore', 'rating', 'length', 'weight'],
    convertBoreType: 'weights'
  },

  pipingClass: {
    title: 'Piping Class',
    description: 'Import piping class master and map class / bore / component / rating / schedule fields.',
    stateKey: 'pipingClass',
    fieldMapKey: 'pipingClassFieldMap',
    defaultMap: {
      pipingClass: ['Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec'],
      convertedBore: [CONVERTED_BORE_COL, 'Size', 'DN', 'NB', 'Bore', 'NPS'],
      componentType: ['Component Type', 'COMPONENT_TYPE', 'Type', 'Item Type'],
      rating: ['Rating', 'RATING', 'Pressure Class'],
      material: ['Material_Name', 'Material', 'MATERIAL'],
      schedule: ['Schedule', 'SCHEDULE', 'SCH'],
      wallThickness: ['Wall Thickness', 'WALL_THICKNESS', 'WT'],
      corrosionAllowance: ['Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA'],
      endCondition: ['End Condition', 'END_CONDITION', 'End Type'],
      facing: ['Facing', 'FACING', 'Face']
    },
    required: ['pipingClass', 'convertedBore'],
    convertBoreType: 'pipingclass'
  },

  materialMap: {
    title: 'PCF Material Map',
    description: 'Import material mapping table used by downstream PCF / material name enrichment.',
    stateKey: 'materialMap',
    fieldMapKey: 'materialMapFieldMap',
    defaultMap: {
      code: ['Code', 'Material Code', 'MATERIAL_CODE'],
      material: ['Material', 'Material_Name', 'Description'],
      spec: ['Spec', 'Specification']
    },
    required: [],
    convertBoreType: null
  },

  supportMapping: {
    title: 'Support Mapping',
    description: 'Map friction/gap/support kind to SUPPORT_NAME and SUPPORT_GUID behavior.',
    stateKey: 'supportMapping',
    fieldMapKey: 'supportFieldMap',
    defaultMap: {
      supportKind: ['supportKind', 'Kind', 'Support Kind'],
      friction: ['friction', 'Friction'],
      gap: ['gap', 'Gap'],
      name: ['name', 'Support Name', 'SUPPORT_NAME'],
      desc: ['desc', 'description', 'Description']
    },
    required: ['name'],
    convertBoreType: null,
    rowsPath: 'blocks'
  },

  branchGeometry: {
    title: 'TEE/OLET BRLEN',
    description: 'Import branch geometry table for TEE/OLET BRLEN lookup.',
    stateKey: 'branchGeometry',
    fieldMapKey: 'branchGeometryFieldMap',
    defaultMap: {
      type: ['Type', 'Component Type'],
      headerBore: ['Header Bore', 'Header DN', 'headerBore'],
      branchBore: ['Branch Bore', 'Branch DN', 'branchBore'],
      brlen: ['BRLEN', 'brlen', 'M', 'A', 'Value']
    },
    required: ['headerBore', 'branchBore', 'brlen'],
    convertBoreType: null
  }
};

// Default master sources auto-loaded on startup when the user hasn't set their
// own link. Configurable: a user-saved link (rvm_pcf_link_<key>) always wins,
// and these can be edited in each master's "LINK EXTERNAL JSON URL" field.
// Only JSON array sources are auto-loaded here (xlsx masters load via import).
const DEFAULT_MASTER_LINKS = {
  weights: 'docs/Masters/wtValveweights.json',
  pipingClass: 'docs/Masters/Piping_class_master.json',
};

function effectiveMasterLink(masterKey) {
  const saved = (localStorage.getItem(`rvm_pcf_link_${masterKey}`) || '').trim();
  return saved || DEFAULT_MASTER_LINKS[masterKey] || '';
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function detectDelimiter(line) {
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = String(line || '').split(d).length;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

function parseDelimited(text) {
  const lines = String(text || '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(line => line.trim() !== '');

  if (!lines.length) return [];

  const delimiter = detectDelimiter(lines[0]);

  const parseLine = (line) => {
    const out = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"' && inQuotes && next === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === delimiter && !inQuotes) { out.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    out.push(current.trim());
    return out;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const cells = parseLine(line);
    const row = { _rowIndex: index + 1 };
    headers.forEach((h, i) => { row[h || `COL_${i + 1}`] = cells[i] ?? ''; });
    return row;
  });
}

async function getXlsxModule() {
  if (window.XLSX?.read && window.XLSX?.utils?.sheet_to_json) return window.XLSX;

  try {
    const module = await import('xlsx');
    const xlsx = module?.read ? module : module?.default;
    if (xlsx?.read && xlsx?.utils?.sheet_to_json) return xlsx;
  } catch (err) {
    throw new Error(
      `Local XLSX parser failed to load from import map: ${err?.message || String(err)}`
    );
  }
  throw new Error('Local XLSX parser did not expose read/utils. Run npm install and refresh the page.');
}

function workbookToSheetRows(XLSX, workbook) {
  const out = {};
  for (const sheetName of workbook.SheetNames || []) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    out[sheetName] = rows.map((row, index) => ({ _rowIndex: index + 1, ...row }));
  }
  return out;
}

async function readWorkbookFile(file) {
  const XLSX = await getXlsxModule();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const sheets = workbookToSheetRows(XLSX, workbook);
  const sheetNames = Object.keys(sheets);

  if (!sheetNames.length) throw new Error('Workbook contains no readable sheets.');

  return {
    type: 'workbook',
    sheetNames,
    sheets,
    selectedSheet: sheetNames[0],
    rows: sheets[sheetNames[0]] || []
  };
}

function isWorkbookFile(file) {
  return /\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(file.name || '');
}

async function readMasterFile(file) {
  if (isWorkbookFile(file)) {
    return readWorkbookFile(file);
  }

  const text = await file.text();

  if (/\.json$/i.test(file.name)) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.rows)) return parsed.rows;
    if (parsed.masters && typeof parsed.masters === 'object') return parsed.masters;
    throw new Error('JSON must be an array, { rows }, or { masters }.');
  }

  return parseDelimited(text);
}

function headersFromRows(rows) {
  return Array.from(new Set((rows || []).flatMap(row => Object.keys(row || {}))));
}

/** Build a preview map: header -> "HeaderName | v1 | v2 | v3" from first 3 non-empty values */
function buildColPreviewMap(rawRows, headers) {
  const previewMap = {};
  for (const h of headers) {
    const vals = [];
    for (let i = 0; i < rawRows.length && vals.length < 3; i++) {
      const v = rawRows[i]?.[h];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        const sv = String(v).trim();
        if (!vals.includes(sv)) vals.push(sv);
      }
    }
    previewMap[h] = vals.length ? `${h} | ${vals.join(' | ')}` : h;
  }
  return previewMap;
}

const MASTERS_LS_KEY = 'rvm_pcf_masters_v1';

function saveMastersToLocalStorage(mastersState) {
  try {
    localStorage.setItem(MASTERS_LS_KEY, JSON.stringify(mastersState));
  } catch (e) {
    console.warn('[RvmPcfMasterPanel] Could not persist masters to localStorage:', e.message);
  }
}

function loadMastersFromLocalStorage() {
  try {
    const raw = localStorage.getItem(MASTERS_LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Derive rating from piping class prefix (mirrors rc-pipeline-lookup.js logic).
 * Two-char prefix takes priority over one-char.
 */
function deriveRatingFromPipingClass(pipingClass, twoCharMap, oneCharMap) {
  if (!pipingClass) return null;
  const s = String(pipingClass).trim();
  const map2 = twoCharMap || { '10': '10000#', '20': '20000#', '15': '1500#', '25': '2500#', '60': '600#', '30': '300#', '15': '1500#' };
  const map1 = oneCharMap || { '1': '150#', '3': '300#', '6': '600#', '9': '900#', '5': '5000#' };
  return map2[s.slice(0, 2)] ?? map1[s.slice(0, 1)] ?? null;
}

function autoMapFields(headers, def, rawRows) {
  if (def?.stateKey === 'linelist') {
    return autoMapLineListFields(headers, {});
  }

  const map = {};
  const normalized = new Map(headers.map(h => [normalizeHeader(h), h]));

  // Build sample value index for fuzzy matching on data
  const samplesByNorm = new Map();
  if (rawRows && rawRows.length) {
    for (const h of headers) {
      const normH = normalizeHeader(h);
      const sampleVals = [];
      for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
        const v = rawRows[i]?.[h];
        if (v != null && String(v).trim()) sampleVals.push(String(v).trim().toLowerCase());
      }
      samplesByNorm.set(normH, sampleVals);
    }
  }

  for (const [field, aliases] of Object.entries(def.defaultMap || {})) {
    let hit = '';
    
    // Pass 1: Exact matches
    for (const alias of aliases) {
      const exact = normalized.get(normalizeHeader(alias));
      if (exact) { hit = exact; break; }
    }
    
    // Pass 2: Fuzzy matching (Legacy logic)
    if (!hit) {
      for (const alias of aliases) {
        const tag = String(alias || '').trim().toUpperCase();
        if (tag.length === 0) continue;
        
        const loose = headers.find(h => {
          const hClean = String(h || '').trim().toUpperCase();
          if (hClean.includes(tag) || tag.includes(hClean)) {
            if (tag.length <= 3 && hClean.length > 10) return false;
            if (hClean === "CONSTRUCTION CLASS" && tag === "CLASS") return false;
            return true;
          }
          return false;
        });
        if (loose) { hit = loose; break; }
      }
    }
    
    map[field] = hit;
  }
  return map;
}

function getMasterContainer(masterKey) {
  const m = state.rvmPcfExtract?.masters || {};
  const def = MASTER_DEFS[masterKey];
  return m[def.stateKey] || {};
}


function getMasterRows(masterKey) {
  const def = MASTER_DEFS[masterKey];
  const container = getMasterContainer(masterKey);
  if (def.rowsPath === 'blocks') return container.blocks || [];
  return container.rows || [];
}

function setMasterRows(masterKey, rows, fieldMap) {
  const def = MASTER_DEFS[masterKey];
  const masters = state.rvmPcfExtract?.masters || {};
  const current = masters[def.stateKey] || {};

  const nextBlock = {
    ...current,
    [def.fieldMapKey]: fieldMap || current[def.fieldMapKey] || {}
  };

  if (masterKey === 'linelist') {
    nextBlock.keyConfig = {
      ...(current.keyConfig || {}),
      serviceCol: nextBlock[def.fieldMapKey]?.service || '',
      sequenceCol: nextBlock[def.fieldMapKey]?.sequence || nextBlock[def.fieldMapKey]?.lineNo || '',
    };
  }

  if (def.rowsPath === 'blocks') {
    nextBlock.blocks = rows;
  } else {
    nextBlock.rows = rows;
  }

  updateRvmPcfExtractState({
    masters: { ...masters, [def.stateKey]: nextBlock }
  }, `master-${masterKey}-set`);
}

function mapRowsWithFieldMap(rawRows, fieldMap) {
  return (rawRows || []).map((row, index) => {
    const mapped = { _sourceRowIndex: row._rowIndex || index + 1, _raw: row };
    for (const [field, sourceHeader] of Object.entries(fieldMap || {})) {
      mapped[field] = sourceHeader ? row[sourceHeader] : '';
    }
    // Carry the derived LineNo Key (ColumnX1) as a top-level column so it is
    // visible in the Saved Master Rows grid and usable as the join key even when
    // lineNo is mapped to a partial source column.
    if (row.ColumnX1 != null && row.ColumnX1 !== '' && mapped.ColumnX1 == null) {
      mapped.ColumnX1 = row.ColumnX1;
    }
    return mapped;
  });
}

function applyConvertedBore(masterKey, rows, def, fieldMap = {}) {
  if (!def.convertBoreType) return rows;
  const headers = headersFromRows(rows);

  // Check if source column values from fieldMap resolve to actual column names in the rows,
  // because fieldMap values are canonical field names (e.g. "bore") but the actual column may
  // be named differently (e.g. "NB" or "Size"). We check the mapped SOURCE header first.
  let sourceColumn = null;

  // For pipingClass, the mapped field for bore is 'convertedBore'
  const boreFieldKey = def.convertBoreType === 'pipingclass' ? 'convertedBore' : 'bore';
  const mappedSourceCol = fieldMap[boreFieldKey];

  if (mappedSourceCol && headers.includes(mappedSourceCol)) {
    sourceColumn = mappedSourceCol;
  } else if (fieldMap.bore && headers.includes(fieldMap.bore)) {
    sourceColumn = fieldMap.bore;
  } else if (fieldMap.convertedBore && headers.includes(fieldMap.convertedBore)) {
    sourceColumn = fieldMap.convertedBore;
  }

  // Fallback to automatic detection if explicit mapping failed
  if (!sourceColumn) {
    sourceColumn = guessBoreSourceColumn(headers, def.convertBoreType);
  }

  if (!sourceColumn) {
    console.warn(`[applyConvertedBore] Could not resolve bore source column for ${masterKey}. Headers: ${headers.slice(0,10).join(', ')}`);
    return rows;
  }

  const result = ensureConvertedBoreRows(rows, { type: def.convertBoreType, sourceColumn });
  return result.rows;
}

function rowsToCsv(rows) {
  const headers = headersFromRows(rows);
  return [
    headers.join(','),
    ...(rows || []).map(row => headers.map(h => csvEscape(row[h])).join(','))
  ].join('\r\n');
}

function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Columns pinned to the front of the Saved Master Rows grid so the join key and
// converted bore are always visible (ColumnX1 = LineNo Key).
const PINNED_SAVED_COLS = ['ColumnX1', 'lineNoKey', 'lineNo', 'convertedBore'];
const SAVED_COL_LABELS = {
  ColumnX1: 'ColumnX1 (LineNo Key)',
  lineNoKey: 'LineNo Key',
  convertedBore: 'convertedBore',
  _sourceRowIndex: '#',
};

function orderedSavedHeaders(rows, def, masterKey) {
  const all = headersFromRows(rows).filter(h => h !== '_raw');
  const canonical = Object.keys(def?.defaultMap || {});
  // ColumnX1 (LineNo Key) is always a dedicated column for the line list;
  // convertedBore is always dedicated for masters that convert bore — even when
  // no row carries a value yet (cells render blank), so the columns are visible.
  const forced = [];
  if (masterKey === 'linelist') forced.push('ColumnX1');
  if (def?.convertBoreType) forced.push('convertedBore');
  const all2 = Array.from(new Set([...all, ...forced]));
  const order = ['_sourceRowIndex', ...PINNED_SAVED_COLS, ...canonical];
  const ordered = [];
  const seen = new Set();
  for (const h of order) if (all2.includes(h) && !seen.has(h)) { ordered.push(h); seen.add(h); }
  for (const h of all2) if (!seen.has(h)) { ordered.push(h); seen.add(h); }
  return ordered.slice(0, 60);
}

/**
 * Saved Master Rows grid with an inline per-column mapping header (replaces the
 * dedicated FIELD SELECTION panel). Each canonical field column carries a
 * dropdown to pick its source column; ColumnX1 (LineNo Key) and convertedBore
 * are pinned first. When nothing is saved yet, a live preview of the mapped raw
 * rows is shown so mapping can be done in-context before saving.
 */
function renderSavedMasterRows(masterKey, savedRows, rawRows, fieldMap, maxRows = 200) {
  const def = MASTER_DEFS[masterKey];
  const isLivePreview = !savedRows.length && rawRows.length > 0;
  const rows = savedRows.length ? savedRows : (isLivePreview ? mapRowsWithFieldMap(rawRows, fieldMap) : []);
  if (!rows.length) return '<div class="rvm-master-empty">No rows yet. Import a file, then map fields in the column headers below.</div>';

  const headers = orderedSavedHeaders(rows, def, masterKey);
  const rawHeaders = headersFromRows(rawRows).filter(h => h !== '_raw' && h !== '_rowIndex');
  const colPreview = buildColPreviewMap(rawRows, rawHeaders);
  const canonicalSet = new Set(Object.keys(def?.defaultMap || {}));

  const mapHeaderCells = headers.map(h => {
    if (!canonicalSet.has(h) || !rawHeaders.length) return '<th class="rvm-master-maphead"></th>';
    const sel = fieldMap[h] || '';
    const req = (def.required || []).includes(h);
    return `<th class="rvm-master-maphead">
      <select data-field-map="${esc(h)}" title="Source column for ${esc(h)}" style="min-width:120px;font-size:11px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:2px;">
        <option value="">${req ? '-- required --' : '-- Not mapped --'}</option>
        ${rawHeaders.map(rh => `<option value="${esc(rh)}" ${sel === rh ? 'selected' : ''}>${esc(colPreview[rh] || rh)}</option>`).join('')}
      </select>
    </th>`;
  }).join('');

  return `
    ${isLivePreview ? '<div class="rvm-master-note" style="color:#fbbf24;">Live preview (unsaved). Adjust the column mapping below, then “Save Mapped Rows”.</div>' : ''}
    <div class="rvm-master-table-wrap">
      <table class="rvm-master-table">
        <thead>
          <tr>${headers.map(h => `<th>${esc(SAVED_COL_LABELS[h] || h)}</th>`).join('')}</tr>
          <tr>${mapHeaderCells}</tr>
        </thead>
        <tbody>
          ${rows.slice(0, maxRows).map(row =>
            `<tr>${headers.map(h => `<td>${esc(row[h])}</td>`).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
      ${rows.length > maxRows ? `<div class="rvm-master-note">Showing ${maxRows} of ${rows.length} rows.</div>` : ''}
    </div>
  `;
}

function renderRowsTable(rows, maxRows = 200) {
  if (!rows.length) return '<div class="rvm-master-empty">No rows loaded.</div>';

  const headers = headersFromRows(rows).filter(h => h !== '_raw').slice(0, 50);
  return `
    <div class="rvm-master-table-wrap">
      <table class="rvm-master-table">
        <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.slice(0, maxRows).map(row =>
            `<tr>${headers.map(h => `<td>${esc(row[h])}</td>`).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
      ${rows.length > maxRows ? `<div class="rvm-master-note">Showing ${maxRows} of ${rows.length} rows.</div>` : ''}
    </div>
  `;
}

function renderEditableSupportMappingTable(rows) {
  const defaultRow = { name: '', supportKind: 'REST', friction: '', gap: '', desc: '' };
  const safeRows = rows.length ? rows : [defaultRow];
  
  return `
    <div class="rvm-master-table-wrap">
      <table class="rvm-master-table" id="support-mapping-editor-table">
        <thead>
          <tr>
            <th>SUPPORT_NAME (name)</th>
            <th>Kind</th>
            <th>Friction</th>
            <th>Gap</th>
            <th>Description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${safeRows.map((r, i) => `
            <tr>
              <td><input type="text" data-col="name" value="${esc(r.name)}" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;padding:4px;"></td>
              <td>
                <select data-col="supportKind" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;padding:4px;">
                  ${['REST', 'GUIDE', 'ANCHOR', 'SPRING', 'LINESTOP', 'LIMIT'].map(k => `<option value="${k}" ${r.supportKind === k ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
              </td>
              <td><input type="text" data-col="friction" value="${esc(r.friction)}" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;padding:4px;"></td>
              <td><input type="text" data-col="gap" value="${esc(r.gap)}" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;padding:4px;"></td>
              <td><input type="text" data-col="desc" value="${esc(r.desc)}" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;padding:4px;"></td>
              <td style="text-align:center;"><button type="button" class="rvm-master-btn danger" data-delete-support-row style="padding:2px 6px;">X</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:8px;display:flex;gap:8px;">
        <button type="button" class="rvm-master-btn" data-add-support-row>+ Add Row</button>
        <button type="button" class="rvm-master-btn" data-save-support-mapping style="background:#3b82f6;">Save Support Mapping</button>
      </div>
    </div>
  `;
}

function renderFieldMapping(masterKey, rawRows, fieldMap) {
  const def = MASTER_DEFS[masterKey];
  const headers = headersFromRows(rawRows);
  const colPreview = buildColPreviewMap(rawRows, headers);

  let compositeBuilder = '';
  if (masterKey === 'linelist') {
    // Restore previously selected composite parts from localStorage
    const savedX1 = (() => { try { return JSON.parse(localStorage.getItem('rvm_pcf_x1_keys') || '{}'); } catch { return {}; } })();

    compositeBuilder = `
      <div class="rvm-master-field-map" style="margin-top:1rem;background:#1e2025;padding:12px;border:1px solid #333;border-radius:6px;">
        <div class="rvm-master-section-title" style="color:#fbbf24;margin-bottom:8px;">LINENO COMPOSITE BUILDER (OPTIONAL)</div>
        <div style="font-size:11px;color:#8ab;margin-bottom:8px;">
          If LineNo requires multiple fields (e.g. Area + Unit + Sequence), select up to 3 fields to derive a new <b>ColumnX1</b>.
          ColumnX1 becomes the <b>Pipeline Reference key</b> — it links linelist rows to PCF PIPELINE-REFERENCE for CA1-10 injection.
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${[1, 2, 3].map(i => `
            <select data-composite-part="${i}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;min-width:140px;">
              <option value="">(None)</option>
              ${headers.map(h => `<option value="${esc(h)}" ${savedX1['key'+i] === h ? 'selected' : ''}>${esc(colPreview[h] || h)}</option>`).join('')}
            </select>
            ${i < 3 ? '<span style="color:#f59e0b;font-weight:bold;">+</span>' : ''}
          `).join('')}
          <button type="button" class="rvm-master-btn" data-derive-lineno style="margin-left:8px;background:#3b82f6;">Derive ColumnX1</button>
        </div>
        <div style="margin-top:10px;padding:8px 10px;background:#0f172a;border-left:3px solid #f59e0b;border-radius:3px;font-size:11px;color:#94a3b8;">
          <b style="color:#fbbf24;">Mapping Criteria:</b> ColumnX1 must uniquely identify a pipeline (line number). Common patterns:<br/>
          &nbsp;• Single column: select only Key1 (e.g. <em>Line No</em>, <em>Pipeline Ref</em>, <em>TAG</em>)<br/>
          &nbsp;• Composite: Key1 + Key2 = <em>Area</em> + <em>Sequence</em> → "A01-1234" (no separator)<br/>
          &nbsp;• Matches PCF <code>PIPELINE-REFERENCE</code> for CA-1 to CA-10 attribute injection.
        </div>
      </div>
    `;
  }

  // Field selection / header mapping now lives inline in the Saved Master Rows
  // grid headers (see renderSavedMasterRows). Only the optional LineNo composite
  // builder is rendered here.
  return compositeBuilder;
}

function renderDiagnostics(rows, def, fieldMap) {
  const missing = (def.required || []).filter(f => !fieldMap[f]);
  const issues = [];

  if (!rows.length) issues.push({ severity: 'warning', text: 'No rows loaded.' });
  for (const f of missing) issues.push({ severity: 'error', text: `Required field not mapped: ${f}` });
  if (def.convertBoreType && rows.length && !headersFromRows(rows).includes(CONVERTED_BORE_COL)) {
    issues.push({ severity: 'warning', text: 'Converted Bore column not present yet. Click "Convert Bore".' });
  }
  if (!issues.length) issues.push({ severity: 'info', text: 'Master mapping looks ready.' });

  return `
    <div class="rvm-master-diagnostics">
      ${issues.map(i => `<div class="rvm-master-diag severity-${esc(i.severity)}">${esc(i.text)}</div>`).join('')}
    </div>
  `;
}

function renderMasterTab(masterKey, local) {
  const def = MASTER_DEFS[masterKey];
  const rows = getMasterRows(masterKey);
  const rawRows = local.rawRows || [];
  const fieldMap = local.fieldMap || getMasterContainer(masterKey)[def.fieldMapKey] || {};

  return `
    <div class="rvm-master-card">
      <div class="rvm-master-title-row">
        <div>
          <div class="rvm-master-title">${esc(def.title)}</div>
          <div class="rvm-master-desc">${esc(def.description)}</div>
        </div>
        <div class="rvm-master-count">${rows.length} saved row(s)</div>
      </div>

      <div class="rvm-master-toolbar">
        <label class="rvm-master-btn">
          Import CSV/XLSX/JSON
          <input hidden type="file" accept=".csv,.tsv,.txt,.json,.xlsx,.xlsm,.xlsb,.xls,.ods,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" data-import-master="${esc(masterKey)}">
        </label>
        <button type="button" class="rvm-master-btn" data-auto-map="${esc(masterKey)}" ${rawRows.length ? '' : 'disabled'}>Auto Map Fields</button>
        <button type="button" class="rvm-master-btn" data-save-master="${esc(masterKey)}" ${rawRows.length ? '' : 'disabled'}>Save Mapped Rows</button>
        <button type="button" class="rvm-master-btn" data-convert-bore="${esc(masterKey)}" ${rows.length && def.convertBoreType ? '' : 'disabled'}>Convert Bore</button>
        <button type="button" class="rvm-master-btn" data-export-master="${esc(masterKey)}" ${rows.length ? '' : 'disabled'}>Export JSON</button>
        <button type="button" class="rvm-master-btn" data-export-master-csv="${esc(masterKey)}" ${rows.length ? '' : 'disabled'}>Export CSV</button>
        <button type="button" class="rvm-master-btn danger" data-clear-master="${esc(masterKey)}" ${rows.length ? '' : 'disabled'}>Clear</button>
      </div>

      ${renderDiagnostics(rows, def, fieldMap)}

      ${local.sheetNames?.length > 1 ? `
        <div class="rvm-master-sheet-select">
          <label>
            <span>Workbook Sheet</span>
            <select data-sheet-select="${esc(masterKey)}">
              ${local.sheetNames.map(sheet => `
                <option value="${esc(sheet)}" ${local.selectedSheet === sheet ? 'selected' : ''}>${esc(sheet)}</option>
              `).join('')}
            </select>
          </label>
        </div>
      ` : ''}

      ${masterKey === 'pipingClass' ? `
        <div class="rvm-master-field-map" style="margin-top:1rem;background:#1e2025;padding:12px;border:1px solid #333;border-radius:6px;">
          <div class="rvm-master-section-title" style="color:#fbbf24;margin-bottom:8px;">RATING EXTRACTION REGEX (OPTIONAL)</div>
          <div style="font-size:11px;color:#8ab;margin-bottom:8px;">
            Configure the Nth regex group used to fetch Rating from the Pipeline Reference string. (Example: <code>(\\d+)#</code> group 1)
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="cfg-rating-regex" value="${esc(localStorage.getItem('rvm_pcf_rating_regex') || '')}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;min-width:140px;" placeholder="Regex (e.g. (\\d+)#)">
            <input type="number" id="cfg-rating-group" value="${esc(localStorage.getItem('rvm_pcf_rating_group') || '1')}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;width:60px;" title="Match Group Index">
            <button type="button" class="rvm-master-btn" data-save-rating-regex style="background:#3b82f6;">Save Regex</button>
            <span id="cfg-rating-status" style="color:#22c55e;font-size:12px;margin-left:8px;display:none;">Saved!</span>
          </div>
        </div>
      ` : ''}

      ${masterKey === 'pipingClass' ? `
        <div class="rvm-master-field-map" style="margin-top:1rem;background:#1e2025;padding:12px;border:1px solid #333;border-radius:6px;">
          <div class="rvm-master-section-title" style="color:#fbbf24;margin-bottom:8px;">PIPING CLASS REGEX (OPTIONAL)</div>
          <div style="font-size:11px;color:#8ab;margin-bottom:8px;">
            Regex + group used to derive the Piping Class token from the Branch/Pipeline reference. Leave blank to use the built-in pattern.
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="cfg-pclass-regex" value="${esc(localStorage.getItem('rvm_pcf_piping_class_regex') || '')}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;min-width:240px;" placeholder="Regex for piping class token">
            <input type="number" id="cfg-pclass-group" value="${esc(localStorage.getItem('rvm_pcf_piping_class_regex_group') || '1')}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;width:60px;" title="Match Group Index">
            <button type="button" class="rvm-master-btn" data-save-pclass-regex style="background:#3b82f6;">Save Regex</button>
            <span id="cfg-pclass-status" style="color:#22c55e;font-size:12px;margin-left:8px;display:none;">Saved!</span>
          </div>
        </div>
      ` : ''}

      ${masterKey === 'linelist' ? `
        <div class="rvm-master-field-map" style="margin-top:1rem;background:#1e2025;padding:12px;border:1px solid #333;border-radius:6px;">
          <div class="rvm-master-section-title" style="color:#fbbf24;margin-bottom:8px;">LINE NO. KEY REGEX (OPTIONAL)</div>
          <div style="font-size:11px;color:#8ab;margin-bottom:8px;">
            Regex + group used to derive the Line No. Key (e.g. <code>S8810101</code>) from the Branch name. Leave blank to use the built-in pattern &mdash; a position-independent scan already handles variants like <code>S-8810101</code> and <code>/ASIM-88-1885-...</code>.
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="cfg-linekey-regex" value="${esc(localStorage.getItem('rvm_pcf_line_key_regex') || '')}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;min-width:320px;" placeholder="Regex for line-no key token (capturing group)">
            <input type="number" id="cfg-linekey-group" value="${esc(localStorage.getItem('rvm_pcf_line_key_regex_group') || '1')}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;width:60px;" title="Match Group Index">
            <button type="button" class="rvm-master-btn" data-save-linekey-regex style="background:#3b82f6;">Save Regex</button>
            <span id="cfg-linekey-status" style="color:#22c55e;font-size:12px;margin-left:8px;display:none;">Saved!</span>
          </div>
        </div>
      ` : ''}

      <div class="rvm-master-field-map" style="margin-top:1rem;background:#1e2025;padding:12px;border:1px solid #333;border-radius:6px;">
        <div class="rvm-master-section-title" style="color:#fbbf24;margin-bottom:8px;">LINK EXTERNAL JSON URL</div>
        <div style="font-size:11px;color:#8ab;margin-bottom:8px;">
          Automatically load this master from a URL on startup.
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="cfg-link-url-${esc(masterKey)}" value="${esc(effectiveMasterLink(masterKey))}" style="padding:4px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;flex:1;" placeholder="URL (e.g. docs/Masters/wtValveweights.json)">
          <button type="button" class="rvm-master-btn" data-save-link-url="${esc(masterKey)}" style="background:#3b82f6;">Save & Load</button>
          <span id="cfg-link-status-${esc(masterKey)}" style="color:#22c55e;font-size:12px;margin-left:8px;display:none;">Loaded!</span>
        </div>
      </div>

      ${rawRows.length ? renderFieldMapping(masterKey, rawRows, fieldMap) : `
        <div class="rvm-master-upload-help">
          Import a CSV/TSV/XLSX/JSON file. After import, use field selection to map project-specific headers into the canonical master fields.
        </div>
      `}

      <div class="rvm-master-split">
        <section>
          <div class="rvm-master-section-title">Imported Preview</div>
          ${renderRowsTable(rawRows, 100)}
        </section>
        <section>
          <div class="rvm-master-section-title">Saved Master Rows</div>
          ${masterKey === 'supportMapping' ? renderEditableSupportMappingTable(rows) : renderSavedMasterRows(masterKey, rows, rawRows, fieldMap, 200)}
        </section>
      </div>
    </div>
  `;
}

function renderDiagnosticsTab() {
  const masters = state.rvmPcfExtract?.masters || {};
  const extractRows = state.rvmPcfExtract?.rows || [];

  const lines = [
    { name: 'Line List', rows: masters.linelist?.rows?.length || 0 },
    { name: 'Weights / Valve CA8', rows: masters.weight?.rows?.length || 0 },
    { name: 'Piping Class', rows: masters.pipingClass?.rows?.length || 0 },
    { name: 'Material Map', rows: masters.materialMap?.rows?.length || 0 },
    { name: 'Support Mapping Blocks', rows: masters.supportMapping?.blocks?.length || 0 },
    { name: 'Branch Geometry', rows: masters.branchGeometry?.rows?.length || 0 },
    { name: 'Final 2D CSV', rows: extractRows.length }
  ];

  return `
    <div class="rvm-master-card">
      <div class="rvm-master-title">Master Match Diagnostics</div>
      <div class="rvm-master-desc">Static-safe diagnostics summary for imported masters and Final 2D CSV readiness.</div>
      <div class="rvm-master-toolbar">
        <button type="button" class="rvm-master-btn" data-export-diagnostics>Export Diagnostics JSON</button>
      </div>
      <div class="rvm-master-table-wrap">
        <table class="rvm-master-table">
          <thead><tr><th>Area</th><th>Rows</th><th>Status</th></tr></thead>
          <tbody>
            ${lines.map(line => `
              <tr>
                <td>${esc(line.name)}</td>
                <td>${esc(line.rows)}</td>
                <td>${line.rows ? 'Loaded' : 'Empty'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <pre class="rvm-master-json">${esc(JSON.stringify({
        mastersSummary: lines,
        diagnostics: state.rvmPcfExtract?.diagnostics || []
      }, null, 2))}</pre>
    </div>
  `;
}

export function mountRvmPcfLegacyMasterPanel(container) {
  let active = 'linelist';
  const localByTab = new Map();

  const getLocal = (key) => {
    if (!localByTab.has(key)) localByTab.set(key, { rawRows: [], fieldMap: {} });
    return localByTab.get(key);
  };

  // ── Restore masters from localStorage on mount ──
  (() => {
    const saved = loadMastersFromLocalStorage();
    try {
      const currentMasters = state.rvmPcfExtract?.masters || {};
      const merged = { ...currentMasters };
      if (saved) {
        for (const [stateKey, data] of Object.entries(saved)) {
          if (data && (Array.isArray(data.rows) || Array.isArray(data.blocks))) {
            merged[stateKey] = { ...(currentMasters[stateKey] || {}), ...data };
          }
        }
      }

      const existingLineListRows = merged.linelist?.rows || [];
      const legacyLineList = loadLegacyLineListStorage();
      if (!existingLineListRows.length && legacyLineList.rows.length) {
        const legacyFieldMap = autoMapLineListFields(
          headersFromRows(legacyLineList.rows),
          legacyLineList.fieldMap
        );
        let mappedLegacyRows = mapRowsWithFieldMap(legacyLineList.rows, legacyFieldMap);
        mappedLegacyRows = applyConvertedBore('linelist', mappedLegacyRows, MASTER_DEFS.linelist, legacyFieldMap);
        merged.linelist = {
          ...(merged.linelist || {}),
          rows: mappedLegacyRows,
          linelistFieldMap: legacyFieldMap,
          keyConfig: legacyLineList.keyConfig,
          sourceName: 'legacy-localStorage',
          legacyStorageImported: true
        };
      }

      if (saved || (!existingLineListRows.length && legacyLineList.rows.length)) {
        updateRvmPcfExtractState({ masters: merged }, 'master-restore-from-localstorage');
        saveMastersToLocalStorage(merged);
      } else {
        return;
      }
    } catch (e) {
      console.warn('[RvmPcfMasterPanel] Could not restore masters from localStorage:', e.message);
    }

    setTimeout(async () => {
      const keys = ['linelist', 'weights', 'pipingClass', 'materialMap', 'supportMapping', 'branchGeometry'];
      let changed = false;
      const currentMasters = state.rvmPcfExtract?.masters || {};
      for (const k of keys) {
        const url = effectiveMasterLink(k);
        if (url) {
           try {
             const res = await fetch(url);
             if (res.ok) {
               const data = await res.json();
               if (Array.isArray(data)) {
                 const fieldMap = autoMapFields(headersFromRows(data), MASTER_DEFS[k], data);
                 const def = MASTER_DEFS[k];
                 currentMasters[def.stateKey] = {
                   rows: data,
                   [def.fieldMapKey]: fieldMap,
                   ...(k === 'linelist' ? {
                     keyConfig: {
                       serviceCol: fieldMap.service || '',
                       sequenceCol: fieldMap.sequence || fieldMap.lineNo || ''
                     }
                   } : {})
                 };
                 changed = true;
               }
             }
           } catch (e) {
             console.warn('Failed to load linked master', k, url, e);
           }
        }
      }
      if (changed) {
        updateRvmPcfExtractState({ masters: currentMasters }, 'master-link-load');
        saveMastersToLocalStorage(currentMasters);
        if (typeof draw === 'function') draw();
      }
    }, 50);
  })();

  const draw = () => {
    const tabItems = [
      ['linelist', 'Line List'],
      ['weights', 'Weights / Valve CA8'],
      ['pipingClass', 'Piping Class'],
      ['materialMap', 'Material Map'],
      ['supportMapping', 'Support Mapping'],
      ['branchGeometry', 'TEE/OLET BRLEN'],
      ['diagnostics', 'Diagnostics']
    ];

    container.innerHTML = `
      <div class="rvm-legacy-master-root">
        <div class="rvm-legacy-master-tabs">
          ${tabItems.map(([id, label]) => `
            <button type="button" class="rvm-legacy-master-tab ${active === id ? 'is-active' : ''}" data-master-tab="${id}">
              ${esc(label)}
            </button>
          `).join('')}
        </div>
        <div class="rvm-legacy-master-content">
          ${active === 'diagnostics' ? renderDiagnosticsTab() : renderMasterTab(active, getLocal(active))}
        </div>
      </div>
    `;

    bind();
  };

  const bind = () => {
    container.querySelectorAll('[data-master-tab]').forEach(btn => {
      btn.addEventListener('click', () => { active = btn.dataset.masterTab; draw(); });
    });

    container.querySelectorAll('[data-import-master]').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.dataset.importMaster;
        const file = input.files?.[0];
        if (!file) return;
        try {
          const result = await readMasterFile(file);
          const local = getLocal(key);

          if (result && result.type === 'workbook') {
            local.workbookSheets = result.sheets;
            local.sheetNames = result.sheetNames;
            local.selectedSheet = result.selectedSheet;
            local.rawRows = result.rows;
          } else {
            local.workbookSheets = null;
            local.sheetNames = [];
            local.selectedSheet = '';
            local.rawRows = Array.isArray(result) ? result : [];
          }

          local.fieldMap = autoMapFields(headersFromRows(local.rawRows), MASTER_DEFS[key], local.rawRows);
          draw();
        } catch (err) {
          updateRvmPcfExtractState({
            diagnostics: [
              ...(state.rvmPcfExtract?.diagnostics || []),
              { severity: 'error', code: 'MASTER-IMPORT-FAILED', message: `${file.name}: ${err.message}` }
            ]
          }, 'master-import-failed');
          draw();
        }
      });
    });

    container.querySelectorAll('[data-sheet-select]').forEach(select => {
      select.addEventListener('change', () => {
        const key = select.dataset.sheetSelect;
        const local = getLocal(key);
        local.selectedSheet = select.value;
        local.rawRows = local.workbookSheets?.[select.value] || [];
        local.fieldMap = autoMapFields(headersFromRows(local.rawRows), MASTER_DEFS[key], local.rawRows);
        draw();
      });
    });

    const btnRatingRegex = container.querySelector('[data-save-rating-regex]');
    if (btnRatingRegex) {
      btnRatingRegex.addEventListener('click', () => {
        const regexInput = container.querySelector('#cfg-rating-regex').value;
        const groupInput = container.querySelector('#cfg-rating-group').value;
        localStorage.setItem('rvm_pcf_rating_regex', regexInput);
        localStorage.setItem('rvm_pcf_rating_group', groupInput);
        // Workflow reads the *_regex_group key; keep both in sync.
        localStorage.setItem('rvm_pcf_rating_regex_group', groupInput);
        const status = container.querySelector('#cfg-rating-status');
        if (status) {
          status.style.display = 'inline';
          setTimeout(() => status.style.display = 'none', 2000);
        }
      });
    }

    const _wireRegexSave = (btnSel, regexSel, groupSel, regexKey, groupKey, statusSel) => {
      const btn = container.querySelector(btnSel);
      if (!btn) return;
      btn.addEventListener('click', () => {
        localStorage.setItem(regexKey, container.querySelector(regexSel).value.trim());
        localStorage.setItem(groupKey, container.querySelector(groupSel).value.trim() || '1');
        const status = container.querySelector(statusSel);
        if (status) { status.style.display = 'inline'; setTimeout(() => status.style.display = 'none', 2000); }
      });
    };
    _wireRegexSave('[data-save-pclass-regex]', '#cfg-pclass-regex', '#cfg-pclass-group',
      'rvm_pcf_piping_class_regex', 'rvm_pcf_piping_class_regex_group', '#cfg-pclass-status');
    _wireRegexSave('[data-save-linekey-regex]', '#cfg-linekey-regex', '#cfg-linekey-group',
      'rvm_pcf_line_key_regex', 'rvm_pcf_line_key_regex_group', '#cfg-linekey-status');

    container.querySelectorAll('[data-save-link-url]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.saveLinkUrl;
        const urlInput = container.querySelector(`#cfg-link-url-${key}`).value.trim();
        localStorage.setItem(`rvm_pcf_link_${key}`, urlInput);
        
        if (urlInput) {
          try {
             const res = await fetch(urlInput);
             if (res.ok) {
             const data = await res.json();
             if (Array.isArray(data)) {
               const currentMasters = state.rvmPcfExtract?.masters || {};
               const fieldMap = autoMapFields(headersFromRows(data), MASTER_DEFS[key], data);
               const def = MASTER_DEFS[key];
               currentMasters[def.stateKey] = {
                 rows: data,
                 [def.fieldMapKey]: fieldMap,
                 ...(key === 'linelist' ? {
                   keyConfig: {
                     serviceCol: fieldMap.service || '',
                     sequenceCol: fieldMap.sequence || fieldMap.lineNo || ''
                   }
                 } : {})
               };
               updateRvmPcfExtractState({ masters: currentMasters }, 'master-link-load');
                 saveMastersToLocalStorage(currentMasters);
                 draw();
                 const status = container.querySelector(`#cfg-link-status-${key}`);
                 if (status) {
                   status.style.display = 'inline';
                   setTimeout(() => status.style.display = 'none', 2000);
                 }
               }
             } else {
               alert(`Failed to fetch URL. Status: ${res.status}`);
             }
          } catch (e) {
             alert(`Failed to fetch URL: ${e.message}`);
          }
        } else {
           // Cleared
           const status = container.querySelector(`#cfg-link-status-${key}`);
           if (status) {
             status.textContent = 'Cleared!';
             status.style.display = 'inline';
             setTimeout(() => status.style.display = 'none', 2000);
           }
        }
      });
    });

    container.querySelectorAll('[data-field-map]').forEach(select => {
      select.addEventListener('change', () => {
        getLocal(active).fieldMap[select.dataset.fieldMap] = select.value;
        // Redraw so the inline Saved Master Rows live preview reflects the mapping.
        draw();
      });
    });

    container.querySelectorAll('[data-auto-map]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.autoMap;
        const local = getLocal(key);
        local.fieldMap = autoMapFields(headersFromRows(local.rawRows), MASTER_DEFS[key], local.rawRows);
        draw();
      });
    });

    container.querySelector('[data-derive-lineno]')?.addEventListener('click', () => {
      const local = getLocal('linelist');
      const selects = Array.from(container.querySelectorAll('[data-composite-part]'));
      const keys = selects.map(s => s.value).filter(Boolean);
      if (keys.length < 1) { alert('Select at least one composite key field.'); return; }

      // Save selections to localStorage for restoration
      try {
        localStorage.setItem('rvm_pcf_x1_keys', JSON.stringify({ key1: keys[0] || '', key2: keys[1] || '', key3: keys[2] || '' }));
      } catch {}

      let count = 0;
      local.rawRows = local.rawRows.map(row => {
        const val = keys.map(k => String(row[k] || '').trim()).filter(Boolean).join('');
        if (val) count++;
        return { ...row, ColumnX1: val };
      });

      local.fieldMap.lineNo = 'ColumnX1';

      // For each row that has a pipingClass mapped, try to derive rating from piping class prefix
      if (local.fieldMap.pipingClass) {
        const pcCol = local.fieldMap.pipingClass;
        local.rawRows = local.rawRows.map(row => {
          const pc = row[pcCol] ? String(row[pcCol]).trim() : '';
          const derivedRating = pc ? deriveRatingFromPipingClass(pc) : '';
          return { ...row, _derivedRating: derivedRating || '' };
        });
        // Auto-map rating to _derivedRating if rating not already mapped
        if (!local.fieldMap.rating) local.fieldMap.rating = '_derivedRating';
      }

      draw();
      // Show status after draw
      setTimeout(() => {
        const statusEl = container.querySelector('[data-derive-status]');
        if (statusEl) statusEl.textContent = `✓ ColumnX1 derived for ${count} row(s) from [${keys.join(' + ')}]. lineNo → ColumnX1`;
      }, 50);
    });

    container.querySelectorAll('[data-save-master]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.saveMaster;
        const def = MASTER_DEFS[key];
        const local = getLocal(key);
        const missing = (def.required || []).filter(f => !local.fieldMap[f]);

        if (missing.length) {
          updateRvmPcfExtractState({
            diagnostics: [
              ...(state.rvmPcfExtract?.diagnostics || []),
              { severity: 'error', code: 'MASTER-FIELD-MAPPING-INCOMPLETE', message: `${def.title}: missing required fields ${missing.join(', ')}` }
            ]
          }, 'master-field-mapping-incomplete');
          draw();
          return;
        }

        let mapped = mapRowsWithFieldMap(local.rawRows, local.fieldMap);
        mapped = applyConvertedBore(key, mapped, def, local.fieldMap);
        setMasterRows(key, mapped, local.fieldMap);

        // Persist all masters to localStorage after every save
        const allMasters = state.rvmPcfExtract?.masters || {};
        saveMastersToLocalStorage(allMasters);

        draw();
      });
    });

    container.querySelectorAll('[data-convert-bore]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.convertBore;
        const def = MASTER_DEFS[key];
        const local = getLocal(key);
        const rows = getMasterRows(key);
        const converted = applyConvertedBore(key, rows, def, local.fieldMap);
        setMasterRows(key, converted, getMasterContainer(key)[def.fieldMapKey] || {});
        draw();
      });
    });

    container.querySelectorAll('[data-export-master]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.exportMaster;
        downloadFile(`rvm-pcf-${key}-master.json`, JSON.stringify(getMasterRows(key), null, 2), 'application/json;charset=utf-8');
      });
    });

    container.querySelectorAll('[data-export-master-csv]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.exportMasterCsv;
        downloadFile(`rvm-pcf-${key}-master.csv`, rowsToCsv(getMasterRows(key)), 'text/csv;charset=utf-8');
      });
    });

    container.querySelectorAll('[data-clear-master]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.clearMaster;
        setMasterRows(key, [], getMasterContainer(key)[MASTER_DEFS[key].fieldMapKey] || {});
        draw();
      });
    });

    container.querySelector('[data-export-diagnostics]')?.addEventListener('click', () => {
      downloadFile(
        'rvm-pcf-master-diagnostics.json',
        JSON.stringify({ masters: state.rvmPcfExtract?.masters || {}, diagnostics: state.rvmPcfExtract?.diagnostics || [] }, null, 2),
        'application/json;charset=utf-8'
      );
    });

    container.addEventListener('click', (e) => {
      if (e.target.matches('[data-delete-support-row]')) {
        e.target.closest('tr')?.remove();
      } else if (e.target.matches('[data-add-support-row]')) {
        const tbody = container.querySelector('#support-mapping-editor-table tbody');
        if (tbody) {
          const template = document.createElement('template');
          template.innerHTML = renderEditableSupportMappingTable([]).match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
          tbody.appendChild(template.content.cloneNode(true));
        }
      } else if (e.target.matches('[data-save-support-mapping]')) {
        const rows = [];
        container.querySelectorAll('#support-mapping-editor-table tbody tr').forEach(tr => {
          const row = {};
          tr.querySelectorAll('[data-col]').forEach(inp => { row[inp.dataset.col] = inp.value; });
          if (row.name) rows.push(row);
        });
        setMasterRows('supportMapping', rows, MASTER_DEFS['supportMapping'].defaultMap);
        draw();
      }
    });
  };

  draw();

  return () => { container.innerHTML = ''; };
}
