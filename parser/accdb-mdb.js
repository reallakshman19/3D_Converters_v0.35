/**
 * accdb-mdb.js — Binary Access database (ACCDB/MDB) reader for native CAESAR II files.
 *
 * CAESAR II stores its model in a Jet/ACE Access database. This module:
 *   1. Opens the database with mdb-reader (CDN, no build step)
 *   2. Enumerates all tables and logs their schema
 *   3. Looks for embedded CAESAR II neutral/XML text in any MEMO column
 *   4. Tries to extract pipe element rows from tables whose columns match
 *      CAESAR II field-name patterns (FROM_NODE, DIAMETER, WALL_THICK, etc.)
 *   5. Falls back to a clear diagnostic error with export instructions
 */

import { pipeLength, round } from '../utils/formatter.js';

// importmap keys (index.html)
const MDB_CDN    = 'mdb-reader';   // → esm.sh/mdb-reader@2
const BUFFER_CDN = 'https://esm.sh/buffer@6'; // Node.js Buffer polyfill for browser

// ── Column name matchers ───────────────────────────────────────────────────
// Each entry is a list of candidate names (checked case-insensitively, then
// by partial match). First match wins.
const COLS = {
  from:    ['FROM_NODE', 'FROM', 'FROMNODE', 'NODE_FROM', 'NODEFROM', 'FNODE'],
  to:      ['TO_NODE',   'TO',   'TONODE',   'NODE_TO',   'NODETO',   'TNODE'],
  dx:      ['DELTA_X',   'DX',   'DELTAX',   'D_X',  'LENGTH_X', 'X'],
  dy:      ['DELTA_Y',   'DY',   'DELTAY',   'D_Y',  'LENGTH_Y', 'Y'],
  dz:      ['DELTA_Z',   'DZ',   'DELTAZ',   'D_Z',  'LENGTH_Z', 'Z'],
  od:      ['DIAMETER',  'OD',   'OUTSIDE_DIAMETER', 'PIPE_OD', 'PIPE_DIAMETER'],
  wall:    ['WALL_THICK','WALL', 'WALLTHICK','THICKNESS', 'WALL_THICKNESS', 'WT'],
  insul:   ['INSUL_THICK','INSULATION','INSUL','INSUL_THICKNESS'],
  T1:      ['TEMP_EXP_C1','TEMPERATURE1','TEMP1','T1','OPER_TEMP','DESIGN_TEMP'],
  T2:      ['TEMP_EXP_C2','TEMPERATURE2','TEMP2','T2','OPER_TEMP2','DESIGN_TEMP2'],
  P1:      ['PRESSURE1', 'PRESSURE','P1','OPER_PRESSURE','DESIGN_PRESSURE'],
  P2:      ['PRESSURE2', 'P2', 'OPER_PRESSURE2', 'DESIGN_PRESSURE2', 'HYDRO_PRESSURE'],
  density: ['PIPE_DENSITY','DENSITY','MATERIAL_DENSITY'],
  matName: ['MATERIAL_NAME','MATERIAL','MAT_NAME','MATERIAL_NUM'],
  corr:    ['CORR_ALLOW', 'CORROSION', 'CORROSION_ALLOWANCE', 'CA'],
  rest:    ['REST_PTR', 'RESTRAINT_PTR', 'RESTRAINT'],
};

function matchCol(colNames, key) {
  const upper = colNames.map(c => c.toUpperCase());
  const patterns = COLS[key] ?? [];
  // Exact match first
  for (const pat of patterns) {
    const i = upper.indexOf(pat.toUpperCase());
    if (i >= 0) return colNames[i];
  }
  // Partial-contain match
  for (const pat of patterns) {
    const i = upper.findIndex(c => c.includes(pat.toUpperCase()));
    if (i >= 0) return colNames[i];
  }
  return null;
}

function num(row, col, fallback = 0) {
  if (!col) return fallback;
  const v = parseFloat(row[col]);
  return isFinite(v) ? v : fallback;
}

function normalizeKey(text) {
  return String(text ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function roundField(value, decimals = 2) {
  const n = round(value, decimals);
  return n === null ? null : n;
}

function numericCell(row, col) {
  if (!col) return { present: false, value: null, raw: null };
  const raw = row[col];
  if (raw === null || raw === undefined || raw === '') return { present: false, value: null, raw };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { present: false, value: null, raw };
  return { present: true, value: n, raw };
}

function resolveNumeric(row, col, prev, fallback = 0, decimals = 2) {
  const cell = numericCell(row, col);
  if (cell.present) {
    return { value: roundField(cell.value, decimals), source: 'direct', column: col };
  }
  if (prev !== undefined && prev !== null) {
    return { value: prev, source: 'carry', column: col };
  }
  return { value: roundField(fallback, decimals), source: 'default', column: col };
}

function resolveString(row, col, prev, fallback = '') {
  if (!col) {
    if (prev !== undefined && prev !== null && prev !== '') return { value: prev, source: 'carry', column: col };
    return { value: fallback, source: 'default', column: col };
  }
  const raw = row[col];
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    return { value: String(raw).trim(), source: 'direct', column: col };
  }
  if (prev !== undefined && prev !== null && prev !== '') {
    return { value: prev, source: 'carry', column: col };
  }
  return { value: fallback, source: 'default', column: col };
}

function createStaleBucket() {
  return new Map();
}

function pushStale(bucket, field, source, value, tableName, column, rowIdx) {
  if (!field || source === 'direct') return;
  const key = `${field}::${source}`;
  const entry = bucket.get(key) ?? {
    field,
    source,
    count: 0,
    value,
    table: tableName,
    column,
    samples: [],
  };
  entry.count += 1;
  if (entry.samples.length < 5) {
    entry.samples.push(`${tableName} row ${rowIdx + 1}`);
  }
  bucket.set(key, entry);
}

function summarizeStale(bucket) {
  return [...bucket.values()].sort((a, b) => a.field.localeCompare(b.field) || a.source.localeCompare(b.source));
}

function defaultUnits() {
  return {
    length: 'mm',
    temperature: 'C',
    pressure: 'KPa',
    stress: 'KPa',
    displacement: 'mm',
    force: 'N',
    rotation: 'deg',
    moment: 'N.m',
    density: 'kg/cu.m.',
    mass: 'kg',
    tables: {},
    factors: {},
  };
}

function maybeUnitKey(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  if (key.includes('TEMP')) return 'temperature';
  if (key.includes('PRESS')) return 'pressure';
  if (key.includes('STRESS')) return 'stress';
  if (key.includes('DISP')) return 'displacement';
  if (key.includes('FORCE')) return 'force';
  if (key.includes('MOMENT')) return 'moment';
  if (key.includes('ROT')) return 'rotation';
  if (key.includes('DENS')) return 'density';
  if (key.includes('MASS')) return 'mass';
  if (key.includes('LENGTH') || key === 'LEN' || key === 'COORD' || key === 'COORDS') return 'length';
  return null;
}

function normalizeUnitText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function setUnit(tableUnits, key, value) {
  const normalized = normalizeUnitText(value);
  if (!normalized) return;
  tableUnits[key] = normalized;
}

function extractInputUnitsTable(rows) {
  const row = rows.find(r => r && Object.keys(r).length) ?? rows[0];
  if (!row) return null;

  const tableUnits = {};
  const fieldMap = {
    length: 'LENGTH',
    force: 'FORCE',
    mass: 'MASS_DYN',
    moment: 'MOMENT_IN',
    stress: 'STRESS',
    temperature: 'TEMP',
    pressure: 'PRESSURE',
    density: 'PIPE_DENSITY',
    displacement: 'LENGTH',
    rotation: 'RUNITS',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
      setUnit(tableUnits, key, row[col]);
    }
  }

  const factorMap = {
    length: 'CLENGTH',
    force: 'CFORCE',
    mass: 'CMASS_DYN',
    momentIn: 'CMOMENT_IN',
    momentOut: 'CMOMENT_OUT',
    stress: 'CSTRESS',
    temperature: 'CTEMP',
    pressure: 'CPRESSURE',
    modulus: 'CEMOD',
    pipeDensity: 'CPDENS',
    insulDensity: 'CIDENS',
    fluidDensity: 'CFDENS',
    trans: 'CTRANS',
    rotStiff: 'CROTSTIFF',
    unifLoad: 'CUNIFLOAD',
  };

  const factors = {};
  for (const [key, col] of Object.entries(factorMap)) {
    if (row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
      const n = Number(row[col]);
      if (Number.isFinite(n)) factors[key] = n;
    }
  }
  if (Object.keys(factors).length) tableUnits.factors = factors;

  return Object.keys(tableUnits).length ? tableUnits : null;
}

function extractUnitsFromTable(tableName, cols, rows) {
  const tableUnits = {};
  const lowerName = String(tableName ?? '').toLowerCase();
  if (lowerName.includes('input_units')) {
    return extractInputUnitsTable(rows);
  }
  const colMap = cols.map(c => ({ raw: c, norm: normalizeKey(c) }));

  for (const { raw, norm } of colMap) {
    const colUnitKey = maybeUnitKey(norm);
    if (colUnitKey && (norm.includes('UNIT') || norm.includes('UOM'))) {
      const sample = rows.map(r => r[raw]).find(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (sample !== undefined) tableUnits[colUnitKey] = String(sample).trim();
    }
  }

  if (lowerName.includes('output_displacements')) {
    for (const row of rows.slice(0, 20)) {
      setUnit(tableUnits, 'displacement', row.DUNITS);
      setUnit(tableUnits, 'rotation', row.RUNITS);
    }
  }

  if (lowerName.includes('output_stresses') || lowerName.includes('output_component_stresses')) {
    for (const row of rows.slice(0, 20)) {
      setUnit(tableUnits, 'stress', row.SUNITS || row.STRESS_UNITS || row.UNITS || row.UNIT);
      setUnit(tableUnits, 'force', row.FUNITS);
      setUnit(tableUnits, 'moment', row.MUNITS);
    }
  }

  if (lowerName.includes('unit')) {
    for (const row of rows.slice(0, 50)) {
      const values = cols
        .map(c => row[c])
        .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (values.length < 2) continue;

      const first = String(values[0]).trim();
      const second = String(values[1]).trim();
      const key = maybeUnitKey(first);
      if (key && second) {
        tableUnits[key] = second;
      } else if (/^[A-Z0-9_\- ]+$/i.test(first) && second) {
        const guessedKey = maybeUnitKey(first) || normalizeKey(first).toLowerCase();
        if (guessedKey) tableUnits[guessedKey] = second;
      }
    }
  }

  return Object.keys(tableUnits).length ? tableUnits : null;
}

function mergeUnits(globalUnits, tableUnits, tableName) {
  if (!tableUnits) return;
  globalUnits.tables[tableName] = tableUnits;
  if (tableUnits.factors) {
    globalUnits.factors = globalUnits.factors || {};
    globalUnits.factors[tableName] = tableUnits.factors;
  }
  for (const [key, value] of Object.entries(tableUnits)) {
    if (key === 'tables' || key === 'factors') continue;
    globalUnits[key] = value;
  }
}

function summarizeStressRows(rows) {

  const byCase = new Map();
  for (const row of rows) {
    const key = String(row.loadCase ?? 'Case').trim();
    const current = byCase.get(key) ?? { loadCase: key, node: row.node, calc: row.calc, allow: row.allow, ratio: row.ratio, status: row.status };
    if ((row.ratio ?? -Infinity) >= (current.ratio ?? -Infinity)) {
      current.node = row.node;
      current.calc = row.calc;
      current.allow = row.allow;
      current.ratio = row.ratio;
      current.status = row.status;
    }
    byCase.set(key, current);
  }
  return [...byCase.values()].sort((a, b) => b.ratio - a.ratio);
}

function summarizeDisplacementRows(rows) {
  const byCase = new Map();
  for (const row of rows) {
    const key = String(row.loadCase ?? 'Case').trim();
    const mag = Math.max(Math.abs(row.dx || 0), Math.abs(row.dy || 0), Math.abs(row.dz || 0));
    const current = byCase.get(key) ?? { loadCase: key, node: row.node, dx: row.dx, dy: row.dy, dz: row.dz, magnitude: mag };
    if (mag >= (current.magnitude ?? -Infinity)) {
      current.node = row.node;
      current.dx = row.dx;
      current.dy = row.dy;
      current.dz = row.dz;
      current.magnitude = mag;
      current.component = Math.abs(row.dy || 0) >= Math.abs(row.dx || 0) && Math.abs(row.dy || 0) >= Math.abs(row.dz || 0)
        ? 'DY'
        : Math.abs(row.dx || 0) >= Math.abs(row.dz || 0)
          ? 'DX'
          : 'DZ';
    }
    byCase.set(key, current);
  }
  return [...byCase.values()].sort((a, b) => b.magnitude - a.magnitude);
}

function _supportKindFromText(text = '') {
  const t = String(text).toUpperCase();
  if (/(^|[^A-Z0-9])(RIGID\s+)?ANC(HOR)?([^A-Z0-9]|$)|\bFIXED\b/.test(t)) return 'ANCHOR';
  if (/\bGDE\b|\bGUI\b|GUIDE|SLIDE|SLID/.test(t)) return 'GUIDE';
  if (/\bRST\b|\bREST\b|\+Y\s*SUPPORT|\bY\s*SUPPORT\b|\+Y\b/.test(t)) return 'REST';
  if (/\bSTOP\b/.test(t)) return 'STOP';
  if (/\bSPRING\b|\bHANGER\b/.test(t)) return 'SPRING';
  if (/\bRIGID\b/.test(t)) return 'RIGID';
  return 'UNKNOWN';
}

function _supportKindToDofs(kind, row = {}) {
  const cosines = [
    Number(row.XCOSINE),
    Number(row.YCOSINE),
    Number(row.ZCOSINE),
  ];
  const finiteCosines = cosines.filter(Number.isFinite);

  if (kind === 'ANCHOR') return [1, 2, 3, 4, 5, 6];
  if (kind === 'GUIDE') return [1, 3];
  if (kind === 'REST' || kind === 'STOP' || kind === 'SPRING') return [2];

  if (finiteCosines.length) {
    const dofs = [];
    if (Math.abs(cosines[0] || 0) > 0.0001) dofs.push(1);
    if (Math.abs(cosines[1] || 0) > 0.0001) dofs.push(2);
    if (Math.abs(cosines[2] || 0) > 0.0001) dofs.push(3);
    return dofs.length ? dofs : [2];
  }

  return [];
}

function _extractRestraintTypeLookup(rows) {
  const lookup = new Map();
  for (const row of rows) {
    const entries = Object.entries(row).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
    if (!entries.length) continue;

    let id = null;
    let name = null;
    let desc = null;
    let label = null;

    for (const [key, value] of entries) {
      const keyUpper = key.toUpperCase();
      const numeric = Number(value);
      if (id === null && Number.isFinite(numeric) && /(TYPE|ID|NUM|CODE)$/i.test(keyUpper)) {
        id = numeric;
      }
      if (typeof value === 'string' && /[A-Z]/i.test(value)) {
        const text = String(value).trim();
        if (name === null && /(NAME|TYPE|TAG|CODE|LABEL)$/i.test(keyUpper)) {
          name = text;
        }
        if (desc === null && /(DESC|DESCRIPTION|TEXT|DETAIL|LONG)/i.test(keyUpper)) {
          desc = text;
        }
        if (label === null && /(NAME|TYPE|DESC|TAG|LABEL|TEXT)$/i.test(keyUpper)) {
          label = text;
        }
      }
    }

    if (id === null) {
      const numericEntry = entries.find(([, value]) => Number.isFinite(Number(value)));
      if (numericEntry) id = Number(numericEntry[1]);
    }
    if (label === null) {
      const textEntry = entries.find(([, value]) => typeof value === 'string' && /[A-Z]/i.test(value));
      if (textEntry) label = String(textEntry[1]).trim();
    }
    if (name === null) {
      const codeLike = entries.find(([, value]) => typeof value === 'string' && /\bCA\d+\b/i.test(String(value)));
      if (codeLike) {
        const m = String(codeLike[1]).toUpperCase().match(/\bCA\d+\b/);
        if (m) name = m[0];
      }
    }
    if (name === null && label) {
      const m = String(label).toUpperCase().match(/\bCA\d+\b/);
      if (m) name = m[0];
    }

    if (id !== null && (name || label || desc)) {
      lookup.set(id, {
        name: name || '',
        description: desc || '',
        label: label || name || desc || '',
      });
    }
  }
  return lookup;
}

function _mergeRestraintNode(bucket, patch) {
  const node = Number(patch?.node ?? patch?.NODE ?? patch?.NODE_NUM ?? patch?.id);
  if (!Number.isFinite(node) || node <= 0) return;

  const existing = bucket.get(node) ?? {
    node,
    ptr: 0,
    type: '',
    name: '',
    keywords: '',
    isAnchor: false,
    dofs: [],
    axisCosines: null,
    stiffness: null,
    gap: null,
    friction: null,
    cnode: null,
    resTypeId: null,
    resultantF: null,
    resultantM: null,
    caseName: '',
    loadCase: '',
    supportBlock: '',
    supportDescription: '',
    sourceTables: [],
  };

  const merged = { ...existing };

  if (patch.ptr !== undefined && patch.ptr !== null && patch.ptr !== 0 && !merged.ptr) merged.ptr = Number(patch.ptr) || merged.ptr;
  if (patch.resTypeId !== undefined && patch.resTypeId !== null && !merged.resTypeId) merged.resTypeId = Number(patch.resTypeId) || merged.resTypeId;
  if (patch.stiffness !== undefined && patch.stiffness !== null && Number.isFinite(Number(patch.stiffness))) merged.stiffness = Number(patch.stiffness);
  if (patch.gap !== undefined && patch.gap !== null && Number.isFinite(Number(patch.gap))) merged.gap = Number(patch.gap);
  if (patch.friction !== undefined && patch.friction !== null && Number.isFinite(Number(patch.friction))) merged.friction = Number(patch.friction);
  if (patch.cnode !== undefined && patch.cnode !== null && Number.isFinite(Number(patch.cnode))) merged.cnode = Number(patch.cnode);
  if (patch.resultantF !== undefined && patch.resultantF !== null && Number.isFinite(Number(patch.resultantF))) merged.resultantF = Number(patch.resultantF);
  if (patch.resultantM !== undefined && patch.resultantM !== null && Number.isFinite(Number(patch.resultantM))) merged.resultantM = Number(patch.resultantM);
  if (patch.caseName) merged.caseName = String(patch.caseName).trim();
  if (patch.loadCase) merged.loadCase = String(patch.loadCase).trim();
  if (patch.supportBlock) merged.supportBlock = String(patch.supportBlock).trim();
  if (patch.supportDescription) merged.supportDescription = String(patch.supportDescription).trim();
  if (Array.isArray(patch.sourceTables) && patch.sourceTables.length) {
    merged.sourceTables = [...new Set([...(merged.sourceTables || []), ...patch.sourceTables])];
  }

  const text = String(patch.type || patch.name || patch.rawType || '').trim();
  if (text) {
    if (!merged.type || /^Support(\s*\(ACCDB\))?$/i.test(merged.type) || /^Type\s*\d+$/i.test(merged.type)) {
      merged.type = text;
    }
    merged.rawType = merged.rawType || text;
  }
  if (patch.isAnchor !== undefined) merged.isAnchor = merged.isAnchor || !!patch.isAnchor;
  if (patch.axisCosines) merged.axisCosines = patch.axisCosines;

  const dofs = Array.isArray(patch.dofs) ? patch.dofs.map(Number).filter(Number.isFinite) : [];
  if (dofs.length) {
    const mergedDofs = new Set([...(merged.dofs || []), ...dofs]);
    merged.dofs = [...mergedDofs].sort((a, b) => a - b);
  }

  bucket.set(node, merged);
}

function _parseInputRestraintTable(rows, tableName, restraintTypes, bucket) {
  for (const row of rows) {
    const node = Number(row.NODE_NUM ?? row.NODE ?? row.NODE_ID ?? row.FROM_NODE ?? row.TO_NODE ?? row.NODENO ?? row.NODE_NUMBER ?? 0);
    if (!Number.isFinite(node) || node <= 0) continue;

    const resTypeId = Number(row.RES_TYPEID ?? row.TYPE_ID ?? row.REST_TYPEID ?? row.TYPE ?? NaN);
    const typeMeta = Number.isFinite(resTypeId) ? restraintTypes.get(resTypeId) : null;
    const lookupLabel = typeof typeMeta === 'string' ? typeMeta : (typeMeta?.label || '');
    const lookupName = typeof typeMeta === 'string' ? '' : (typeMeta?.name || '');
    const lookupDesc = typeof typeMeta === 'string' ? '' : (typeMeta?.description || '');
    const rawType = String(row.RES_TAG || row.RES_GUID || lookupName || lookupLabel || '').trim();
    const kind = _supportKindFromText(`${rawType} ${lookupDesc}`);
    const dofs = _supportKindToDofs(kind, row);
    const axisCosines = {
      x: Number.isFinite(Number(row.XCOSINE)) ? Number(row.XCOSINE) : null,
      y: Number.isFinite(Number(row.YCOSINE)) ? Number(row.YCOSINE) : null,
      z: Number.isFinite(Number(row.ZCOSINE)) ? Number(row.ZCOSINE) : null,
    };
    const hasAxisCosines = Object.values(axisCosines).some(v => v !== null && v !== undefined);

    _mergeRestraintNode(bucket, {
      node,
      ptr: Number(row.REST_PTR ?? row.RESTRAINT_PTR ?? row.PTR ?? 0) || 0,
      type: lookupName || rawType || lookupLabel || '',
      rawType: rawType || lookupLabel || '',
      supportBlock: lookupName,
      supportDescription: lookupDesc,
      resTypeId: Number.isFinite(resTypeId) ? resTypeId : null,
      stiffness: row.STIFFNESS,
      gap: row.GAP,
      friction: row.FRIC_COEF,
      cnode: row.CNODE,
      dofs,
      axisCosines: hasAxisCosines ? axisCosines : null,
      isAnchor: kind === 'ANCHOR',
      sourceTables: [tableName],
    });
  }
}

function _parseOutputRestraintSummaryTable(rows, tableName, bucket) {
  for (const row of rows) {
    const node = Number(row.NODE ?? row.NODE_NUM ?? row.NODE_ID ?? 0);
    if (!Number.isFinite(node) || node <= 0) continue;

    const rawType = String(row.TYPE || row.RES_TAG || row.RES_GUID || '').trim();
    const kind = _supportKindFromText(rawType);
    const dofs = _supportKindToDofs(kind, row);

    _mergeRestraintNode(bucket, {
      node,
      type: rawType,
      rawType,
      resultantF: row.RESULTANTF,
      resultantM: row.RESULTANTM,
      caseName: row.CASE,
      loadCase: row.LCASE_NAME || row.CASE,
      isAnchor: kind === 'ANCHOR',
      dofs,
      sourceTables: [tableName],
    });
  }
}

function _finalizeRestraints(bucket) {
  return [...bucket.values()]
    .map(r => ({
      ...r,
      type: r.type || r.rawType || 'Support (ACCDB)',
      isAnchor: !!r.isAnchor || _supportKindFromText(r.type || r.rawType) === 'ANCHOR',
      dofs: Array.isArray(r.dofs) ? r.dofs : [],
      sourceTables: r.sourceTables || [],
    }))
    .sort((a, b) => Number(a.node) - Number(b.node));
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {string}      fileName
 * @param {object[]}    log        — mutable; entries pushed here
 * @returns {object|null}  partial parsed result, or null on failure
 */
export async function parseBinaryAccdb(arrayBuffer, fileName, log) {
  // ── 1. Polyfill Buffer + load mdb-reader ─────────────────────────────────
  // mdb-reader uses Node.js Buffer methods (e.g. .copy()) internally.
  // In the browser we must polyfill globalThis.Buffer BEFORE importing the
  // library so its module-level Buffer references resolve to the polyfill.
  let MDBReader;
  try {
    if (typeof globalThis.Buffer === 'undefined' || typeof globalThis.Buffer.from !== 'function') {
      const bufMod = await import(BUFFER_CDN);
      globalThis.Buffer = bufMod.Buffer ?? bufMod.default?.Buffer ?? bufMod.default ?? bufMod;
    }
    const mod = await import(/* @vite-ignore */ MDB_CDN);
    MDBReader = mod.default ?? mod.MDBReader ?? mod;
    if (typeof MDBReader !== 'function') throw new Error('MDBReader is not a constructor');
  } catch (e) {
    log.push({ level: 'ERROR', msg: `mdb-reader library failed to load: ${e.message}` });
    log.push({ level: 'INFO',  msg: 'Requires internet access to load CDN libraries. Alternatively export from CAESAR II as a neutral text file.' });
    return null;
  }

  // ── 2. Open database ─────────────────────────────────────────────────────
  // Pass a proper Buffer (not a raw Uint8Array) so .copy() and other
  // Node.js Buffer methods are available to mdb-reader internals.
  let reader;
  try {
    const buf = globalThis.Buffer.from(arrayBuffer);
    reader = new MDBReader(buf);
  } catch (e) {
    log.push({ level: 'ERROR', msg: `Cannot open as Access database: ${e.message}` });
    log.push({ level: 'INFO',  msg: 'The file may use an unsupported Access version, be password-protected, or be corrupted.' });
    return null;
  }

  const tableNames = reader.getTableNames();
  log.push({ level: 'INFO', msg: `ACCDB opened — ${tableNames.length} table(s): ${tableNames.join(', ')}` });

  // ── Find JOBNAME, FLANGE, STRESS and DISPLACEMENT info globally ──────────────────────────────
  let jobName = null;
  let flanges = [];
  let stresses = [];
  let displacements = [];
  const restraintByNode = new Map();
  let restraintTypes = new Map();
  const units = defaultUnits();
  const staleBucket = createStaleBucket();

  for (const tName of tableNames) {
    try {
      const t = reader.getTable(tName);
      const rawCols = t.getColumnNames();
      const tCols = rawCols.map(c => c.toUpperCase());
      const rows = t.getData();

      const tableUnits = extractUnitsFromTable(tName, rawCols, rows);
      mergeUnits(units, tableUnits, tName);
      if (tableUnits) {
        const unitPairs = Object.entries(tableUnits).map(([k, v]) => `${k}=${v}`).join(', ');
        log.push({ level: 'INFO', msg: `Units extracted from "${tName}": ${unitPairs}` });
      }

      // Extract JobName
      if (!jobName && tCols.some(c => c.includes('JOBNAME') || c.includes('PROJECT'))) {
        const tr = rows[0];
        if (tr) {
          const jk = Object.keys(tr).find(k => k.toUpperCase().includes('JOBNAME') || k.toUpperCase() === 'JOB');
          if (jk && tr[jk]) jobName = String(tr[jk]).trim();
        }
      }
      // Extract Flange
      if (tName.toLowerCase().includes('output_flange')) {
        for (const fr of rows) {
           const node = fr['NODE'] || fr['NODE_NUM'] || '—';
           const method = String(fr['METHOD'] || 'Equivalent Pressure').replace('method', '').trim();
           const maxPct = fr['RATIO'] || fr['MAX_PERCENT'] || fr['PERCENT'] || '—';
           const status = fr['STATUS'] || fr['PASSFAIL'] || (parseFloat(maxPct) <= 100 ? 'PASS' : parseFloat(maxPct) > 100 ? 'FAIL' : 'PASS');
           flanges.push({ 
             location: `Node ${node}`, 
             method: method, 
             standard: 'Generic', 
             status: String(status).toUpperCase() === 'FAIL' || status === '1' ? 'FAIL' : 'PASS',
             maxPct: typeof maxPct === 'number' ? maxPct.toFixed(1) : parseFloat(maxPct).toFixed(1)
           });
        }
      }

      // Extract Stresses
      if (tName.toLowerCase().includes('output_stress')) {
        for (const sr of rows) {
            const node = sr['FROM_NODE'] || sr['NODE'] || '—';
            const loadCase = sr['CASE'] || sr['LCASE_NAME'] || `Case ${sr['LCASE_NUM']}`;
            const calcRaw = sr['CODE_STRESST'] || sr['CODE_STRESSF'] || sr['CODE_STRESS'] || sr['CALC_STRESS'] || 0;
            const allowRaw = sr['ALLOW_STRESST'] || sr['ALLOW_STRESSF'] || sr['ALLOW_STRESS'] || sr['ALLOWABLE'] || null;
            const calc = roundField(calcRaw, 2) ?? 0;
            const allow = allowRaw !== null && allowRaw !== undefined && allowRaw !== '' ? roundField(allowRaw, 2) : null;
            const ratioRaw = sr['PRCT_STRT'] || sr['PRCT_STRF'] || sr['RATIO'] || (allowRaw ? (Number(calcRaw) / Number(allowRaw) * 100) : 0);
            const ratio = roundField(ratioRaw, 1) ?? 0;
            const status = sr['CHECK_STATUS'] || (ratio <= 100 ? 'PASS' : 'FAIL');

            stresses.push({
                node,
                loadCase,
                calc,
                allow,
                ratio,
                status: String(status).toUpperCase().includes('PASS') ? 'PASS' : 'FAIL',
            });
        }
        log.push({ level: 'OK', msg: `Extracted ${stresses.length} stress records from "${tName}"` });
      }

      // Extract Displacements
      if (tName.toLowerCase().includes('output_displacement')) {
        for (const dr of rows) {
            const node = dr['NODE'] || dr['NODE_NUM'] || '—';
            const loadCase = dr['CASE'] || dr['LCASE_NAME'] || `Case ${dr['LCASE_NUM']}`;
            const dx = roundField(dr['DX'] || 0, 2) ?? 0;
            const dy = roundField(dr['DY'] || 0, 2) ?? 0;
            const dz = roundField(dr['DZ'] || 0, 2) ?? 0;

            displacements.push({
                node,
                loadCase,
                dx,
                dy,
                dz,
            });
        }
        log.push({ level: 'OK', msg: `Extracted ${displacements.length} displacement records from "${tName}"` });
      }

    } catch(e) {}
  }

  // Parse restraint lookup and node-wise support tables before we build the pipe model.
  for (const tName of tableNames) {
    try {
      if (!String(tName).toUpperCase().includes('RESTRAINT_TYPES')) continue;
      const t = reader.getTable(tName);
      const rows = t.getData();
      const lookup = _extractRestraintTypeLookup(rows);
      if (lookup.size) {
        restraintTypes = lookup;
        const typePairs = [...lookup.entries()].map(([id, label]) => `${id}=${label}`).join(', ');
        log.push({ level: 'INFO', msg: `Restraint types extracted from "${tName}": ${typePairs}` });
      }
    } catch (e) {
      log.push({ level: 'WARN', msg: `Restraint type table "${tName}" unreadable: ${e.message}` });
    }
  }

  for (const tName of tableNames) {
    try {
      const lower = String(tName).toLowerCase();
      if (!(lower.includes('input_restraints') || lower.includes('output_restraints_summary') || lower === 'output_restraints')) continue;

      const t = reader.getTable(tName);
      const rows = t.getData();
      if (lower.includes('input_restraints')) {
        _parseInputRestraintTable(rows, tName, restraintTypes, restraintByNode);
        log.push({ level: 'INFO', msg: `Parsed ${rows.length} input restraint row(s) from "${tName}"` });
      } else {
        _parseOutputRestraintSummaryTable(rows, tName, restraintByNode);
        log.push({ level: 'INFO', msg: `Parsed ${rows.length} restraint summary row(s) from "${tName}"` });
      }
    } catch (e) {
      log.push({ level: 'WARN', msg: `Restraint table "${tName}" unreadable: ${e.message}` });
    }
  }

  // ── 3. Strategy A — look for embedded CAESAR II neutral/XML text ──────────
  for (const name of tableNames) {
    try {
      const table = reader.getTable(name);
      const cols  = table.getColumnNames();
      const rows  = table.getData();
      for (const col of cols) {
        for (const row of rows.slice(0, 10)) {
          const val = row[col];
          if (typeof val === 'string' && val.length > 200) {
            if (/^#\$\s*(VERSION|ELEMENTS|CONTROL)/m.test(val)) {
              log.push({ level: 'OK', msg: `Found embedded CAESAR II neutral text in table "${name}", column "${col}"` });
              return { embeddedText: val, jobName, flanges, stresses: summarizeStressRows(stresses), stressDetails: stresses, displacements: summarizeDisplacementRows(displacements), displacementDetails: displacements, units, staleValues: summarizeStale(staleBucket) };
            }
            if (val.includes('<CAESARII') || val.includes('<PIPINGMODEL')) {
              log.push({ level: 'OK', msg: `Found embedded CAESARII XML text in table "${name}", column "${col}"` });
              return { embeddedText: val, jobName, flanges, stresses: summarizeStressRows(stresses), stressDetails: stresses, displacements: summarizeDisplacementRows(displacements), displacementDetails: displacements, units, staleValues: summarizeStale(staleBucket) };
            }
          }
        }
      }
    } catch { /* skip unreadable tables */ }
  }

  // ── 4. Strategy B — find table with FROM/TO node + geometry columns ───────
  for (const name of tableNames) {
    try {
      const table = reader.getTable(name);
      const cols  = table.getColumnNames();

      const fromCol = matchCol(cols, 'from');
      const toCol   = matchCol(cols, 'to');
      const odCol   = matchCol(cols, 'od');
      const dxCol   = matchCol(cols, 'dx');
      const dyCol   = matchCol(cols, 'dy');
      const dzCol   = matchCol(cols, 'dz');

      // Need at minimum: FROM + TO + either geometry (dx/dy/dz) or size (OD)
      if (!fromCol || !toCol || (!odCol && !dxCol)) continue;

      const wallCol   = matchCol(cols, 'wall');
      const insulCol  = matchCol(cols, 'insul');
      const t1Col     = matchCol(cols, 'T1');
      const t2Col     = matchCol(cols, 'T2');
      const p1Col     = matchCol(cols, 'P1');
      const p2Col     = matchCol(cols, 'P2');
      const densCol   = matchCol(cols, 'density');
      const matCol    = matchCol(cols, 'matName');
      const corrCol   = matchCol(cols, 'corr');
      const restCol   = matchCol(cols, 'rest');

      log.push({ level: 'INFO', msg: `Pipe-like table "${name}": FROM="${fromCol}" TO="${toCol}" OD="${odCol ?? '—'}" DX="${dxCol ?? '—'}" columns: ${cols.length}` });

      const rows = table.getData();
      log.push({ level: 'INFO', msg: `  → ${rows.length} row(s)` });

      const elements = [];
      const nodes    = {};

      // Carry-forward (same pattern as XML parser)
      let pOd = 0, pWall = 0, pInsul = 0, pT1 = 0, pT2 = 0, pP1 = 0, pP2 = 0, pDens = 7.833e-3, pMat = 'CS', pCorr = 0;

      // Origin for first node
      const firstFrom = parseInt(rows[0]?.[fromCol]) || 0;
      if (firstFrom > 0) nodes[firstFrom] = { x: 0, y: 0, z: 0 };

      for (let i = 0; i < rows.length; i++) {
        const row  = rows[i];
        const from = parseInt(row[fromCol]) || 0;
        const to   = parseInt(row[toCol])   || 0;
        if (!from || !to || from === to) continue;

        const dx = roundField(num(row, dxCol), 3) ?? 0;
        const dy = roundField(num(row, dyCol), 3) ?? 0;
        const dz = roundField(num(row, dzCol), 3) ?? 0;

        const odRes    = resolveNumeric(row, odCol,    pOd,    0, 3);
        const wallRes  = resolveNumeric(row, wallCol,  pWall,  0, 3);
        const insulRes = resolveNumeric(row, insulCol, pInsul, 0, 3);
        const t1Res    = resolveNumeric(row, t1Col,    pT1,    0, 2);
        const t2Res    = resolveNumeric(row, t2Col,    pT2,    0, 2);
        const p1Res    = resolveNumeric(row, p1Col,    pP1,    0, 2);
        const p2Res    = resolveNumeric(row, p2Col,    pP2,    0, 2);
        const densRes  = resolveNumeric(row, densCol,  pDens,  7.833e-3, 4);
        const corrRes  = resolveNumeric(row, corrCol,   pCorr,  0, 3);
        const matRes   = resolveString(row, matCol,     pMat,   'CS');

        const od       = odRes.value;
        const wall     = wallRes.value;
        const insul    = insulRes.value;
        const T1       = t1Res.value;
        const T2       = t2Res.value;
        const P1       = p1Res.value;
        const P2       = p2Res.value;
        const density  = densRes.value;
        const material = matRes.value;
        const corrosion = corrRes.value;
        // In CAESAR table format, we might not always have T3-T9 mapped strictly unless specific tables, defaults to 0
        const T3 = 0, T4 = 0, T5 = 0, T6 = 0, T7 = 0, T8 = 0, T9 = 0;
        const P3 = 0, P4 = 0, P5 = 0, P6 = 0, P7 = 0, P8 = 0, P9 = 0;
        const p_hydro = 0;

        pOd = od;  pWall = wall;  pInsul = insul;
        pT1 = T1;  pT2 = T2;      pP1 = P1;  pP2 = P2;
        pDens = density; pMat = material;  pCorr = corrosion;

        pushStale(staleBucket, 'OD', odRes.source, od, name, odCol, i);
        pushStale(staleBucket, 'WALL', wallRes.source, wall, name, wallCol, i);
        pushStale(staleBucket, 'INSUL', insulRes.source, insul, name, insulCol, i);
        pushStale(staleBucket, 'T1', t1Res.source, T1, name, t1Col, i);
        pushStale(staleBucket, 'T2', t2Res.source, T2, name, t2Col, i);
        pushStale(staleBucket, 'P1', p1Res.source, P1, name, p1Col, i);
        pushStale(staleBucket, 'P2', p2Res.source, P2, name, p2Col, i);
        pushStale(staleBucket, 'DENSITY', densRes.source, density, name, densCol, i);
        pushStale(staleBucket, 'CORR', corrRes.source, corrosion, name, corrCol, i);
        pushStale(staleBucket, 'MATERIAL', matRes.source, material, name, matCol, i);

        if (!nodes[from]) nodes[from] = { x: 0, y: 0, z: 0 };
        const origin = nodes[from];
        const toPos  = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
        if (!nodes[to]) nodes[to] = toPos;

        const restPtr = parseInt(row[restCol]) || 0;

        elements.push({
          index: i, from, to, dx, dy, dz, od, wall, insul,
          T1, T2, T3, T4, T5, T6, T7, T8, T9,
          P1, P2, P3, P4, P5, P6, P7, P8, P9,
          P_hydro: p_hydro, corrosion,
          E_cold: 203390.7, E_hot: 178960.6, density, poisson: 0.292,
          material,
          length:  pipeLength(dx, dy, dz),
          fromPos: { ...origin },
          toPos:   { ...toPos },
          hasBend: false,
          restPtr: restPtr
        });

        if (restPtr > 0) {
          _mergeRestraintNode(restraintByNode, {
            node: from,
            ptr: restPtr,
            type: 'Support (ACCDB)',
            rawType: 'Support (ACCDB)',
            dofs: [],
            stiffness: 1e10,
            sourceTables: [name],
          });
        }
      }

      // We already extracted JOBNAME, FLANGE, STRESSES, and DISPLACEMENTS globally earlier.
      // Re-use `jobName`, `flanges`, `stresses`, `displacements` from outer scope.

      if (elements.length > 0) {
        const restraints = _finalizeRestraints(restraintByNode);
        log.push({ level: 'OK', msg: `Extracted ${elements.length} element(s) from ACCDB table "${name}"` });
        return {
          elements, nodes,
          bends: [], restraints, forces: [], rigids: [], flanges,
          stresses: summarizeStressRows(stresses),
          stressDetails: stresses,
          displacements: summarizeDisplacementRows(displacements),
          displacementDetails: displacements,
          units,
          staleValues: summarizeStale(staleBucket),
          meta: { sourceTable: name, jobName },
          format: 'ACCDB-TABLE',
        };
      }

      log.push({ level: 'WARN', msg: `Table "${name}" matched structure but yielded 0 valid elements` });
    } catch (e) {
      log.push({ level: 'WARN', msg: `Table "${name}" unreadable: ${e.message}` });
    }
  }

  // ── 5. Nothing found — dump full schema for diagnostics ──────────────────
  log.push({ level: 'WARN', msg: 'No CAESAR II pipe data recognized. Full table schema:' });
  for (const name of tableNames) {
    try {
      const table    = reader.getTable(name);
      const cols     = table.getColumnNames();
      const rowCount = table.getData().length;
      log.push({ level: 'INFO', msg: `  "${name}": ${rowCount} row(s) | ${cols.join(', ')}` });
    } catch (e) {
      log.push({ level: 'WARN', msg: `  "${name}": unreadable — ${e.message}` });
    }
  }

  log.push({ level: 'ERROR', msg: 'No pipe element data could be extracted from this Access database.' });
  log.push({ level: 'INFO',  msg: 'Export from CAESAR II: File → Neutral File → select all sections → save (generates a text file you can load here).' });
  return null;
}
