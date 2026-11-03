/**
 * accdb-to-pcf.js
 * Implements the 3-stage data transformation:
 * Stage 1: ACCDB (Parsed) -> Universal CSV Format
 * Stage 2: Universal CSV -> Simplified PCF Data Table Format
 */

import { resolveKindPure } from '../support/SupportKindResolver.js';
import { getPcfMapping } from '../core/settings.js';

// ── Stage 1: ACCDB to Universal CSV ──────────────────────────────────────────

export function buildUniversalCSV(parsed, options = {}) {
  if (!parsed || !parsed.elements) return [];

  const elements = parsed.elements;
  const bends = parsed.bends || [];
  const restraints = parsed.restraints || [];
  const rigids = parsed.rigids || [];
  const sifs = parsed.sifs || []; // Assuming parser provides this, else empty
  const supportMappings = _normalizeSupportMappings(options.supportMappings);

  // Index auxiliary arrays by their pointers for O(1) lookup
  const bendIdx = {};
  bends.forEach(b => bendIdx[b.ptr] = b);

  const restIdx = {};
  restraints.forEach(r => {
    for (const key of [r.ptr, r.node]) {
      if (key !== undefined && key !== null) restIdx[key] = r;
    }
  });

  const rigidIdx = {};
  rigids.forEach(r => {
    for (const key of [r.ptr, r.node, r.id]) {
      if (key !== undefined && key !== null) rigidIdx[key] = r;
    }
  });

  const csvRows = [];

  elements.forEach(el => {
    // Stage 1 maps the raw parsed element properties into a flat, denormalized row
    // mimicking the ~130-column universal CSV from CAESAR-CII-Converter-2
    const row = {
      // Element Identity
      ELEMENTID: el.index,
      FROM_NODE: el.from,
      TO_NODE: el.to,
      LINE_NO: el.lineNo || '',

      // Geometry
      DELTA_X: el.dx || 0,
      DELTA_Y: el.dy || 0,
      DELTA_Z: el.dz || 0,
      DIAMETER: el.od || 0,
      WALL_THICK: el.wall || 0,
      INSUL_THICK: el.insul || 0,

      // Pointers
      BEND_PTR: el.bendPtr || 0,
      REST_PTR: el.restPtr || el.restraintPtr || 0,
      RIGID_PTR: el.rigidPtr || 0,
      INT_PTR: el.sifPtr || 0,
      FLANGE_PTR: el.flangePtr || 0,
      REDUCER_PTR: el.reducerPtr || 0,

      // Material / Thermal / Press
      T1: el.T1 || 0,
      T2: el.T2 || 0,
      T3: el.T3 || 0,
      T4: el.T4 || 0,
      T5: el.T5 || 0,
      T6: el.T6 || 0,
      T7: el.T7 || 0,
      T8: el.T8 || 0,
      T9: el.T9 || 0,
      P1: el.P1 || 0,
      P2: el.P2 || 0,
      P3: el.P3 || 0,
      P4: el.P4 || 0,
      P5: el.P5 || 0,
      P6: el.P6 || 0,
      P7: el.P7 || 0,
      P8: el.P8 || 0,
      P9: el.P9 || 0,
      P_HYDRO: el.P_hydro || 0,
      CORR_ALLOW: el.corrosion || 0,
      INSUL_DENSITY: el.insulDensity || 0,
      FLUID_DENSITY: el.fluidDensity || 0,
      MATERIAL_NAME: el.material || '',
    };

    // Join Bends
    if (row.BEND_PTR && bendIdx[row.BEND_PTR]) {
      const b = bendIdx[row.BEND_PTR];
      row.BND_RADIUS = b.radius;
      row.BND_ANGLE1 = b.angle1;
      row.BND_NODE1 = b.node1;
      row.BND_NODE2 = b.node2;
    }

    // Join Restraints
    if (row.REST_PTR && restIdx[row.REST_PTR]) {
      const r = restIdx[row.REST_PTR];
      const mapping = _resolveSupportMapping(r, supportMappings);
      row.RST_NODE_NUM = r.node;
      row.RST_TYPE = r.type;
      row.RST_RAW_TYPE = r.rawType || r.type || '';
      row.RST_BLOCK = mapping?.name || String(r.supportBlock || _extractSupportBlockCode(row.RST_RAW_TYPE || '')).toUpperCase();
      row.RST_KIND = mapping?.supportKind
        || _supportKindFromBlock(row.RST_BLOCK, mapping?.description || r.supportDescription || '')
        || _supportNameFromType(row.RST_RAW_TYPE || '')
        || '';
      row.RST_DESC = mapping?.description || r.supportDescription || '';
      row.RST_FRICTION = mapping?.friction ?? '';
      row.RST_GAP = mapping?.gap ?? '';
      if (Array.isArray(r.dofs) && r.dofs.length) {
        row.RST_DOFS = r.dofs.join(',');
      }
      if (r.axisCosines) {
        row.RST_AXIS_COSINES = `${r.axisCosines.x ?? 0}, ${r.axisCosines.y ?? 0}, ${r.axisCosines.z ?? 0}`;
      }
    }

    // Join Rigids
    if (row.RIGID_PTR && rigidIdx[row.RIGID_PTR]) {
      const r = rigidIdx[row.RIGID_PTR];
      row.RGD_WGT = r.weight;
    }

    csvRows.push(row);
  });

  return csvRows;
}

function _normalizeSupportMappings(rows) {
  const src = Array.isArray(rows) ? rows : [];
  return src
    .map((row) => ({
      supportKind: String(row?.supportKind || row?.kind || '').toUpperCase(),
      friction: Number.isFinite(Number(row?.friction)) ? Number(row.friction) : null,
      gap: String(row?.gap ?? ''),
      name: String(row?.name || '').toUpperCase(),
      description: String(row?.description || ''),
    }))
    .filter((row) => row.name);
}

function _resolveSupportMapping(restraint, mappings) {
  if (!restraint || !mappings?.length) return null;
  const rawType = String(restraint.rawType || restraint.type || '').toUpperCase();
  const block = String(restraint.supportBlock || _extractSupportBlockCode(rawType)).toUpperCase();
  if (block) {
    const byName = mappings.find((m) => m.name === block);
    if (byName) return byName;
  }

  const inferredKind = _supportKindFromBlock(block, restraint.supportDescription || '')
    || _supportNameFromType(rawType)
    || _supportNameFromDofs(Array.isArray(restraint.dofs) ? restraint.dofs.join(',') : '')
    || _supportNameFromAxisCosines(restraint.axisCosines
      ? `${restraint.axisCosines.x ?? 0}, ${restraint.axisCosines.y ?? 0}, ${restraint.axisCosines.z ?? 0}`
      : '');
  if (!inferredKind) return null;

  return mappings.find((m) => m.supportKind === inferredKind) || null;
}

// ── Stage 2: Universal CSV to PCF Data Table ─────────────────────────────────

export function normalizeToPCF(csvRows, options = {}) {
  const method = options.method || 'default';

  if (method === 'ContEngineMethod') {
    // Apply "Common PCF Builder" logic pattern internally where ContEngineMethod resolves
    return normalizeToPCFWithContinuity(csvRows, options);
  } else if (method === 'Legacy') {
    // Apply legacy engine overrides where explicitly requested to bypass normalizations
    // Currently, normalizeToPCF directly maps properties to flat elements matching legacy rules
  }

  const segments = [];
  let i = 0;

  while (i < csvRows.length) {
    const row = csvRows[i];

    // Determine type heuristics (simplified from normalizer.ts)
    let type = 'PIPE';
    if (row.BEND_PTR > 0) type = 'PIPE'; // Usually leads to a bend
    else if (row.RIGID_PTR > 0) type = row.FLANGE_PTR > 0 ? 'FLANGE' : 'VALVE';
    else if (row.INT_PTR > 0) type = 'TEE';
    else if (row.REDUCER_PTR > 0) type = 'REDUCER';

    // Create base segment
    const baseSegment = {
      FROM_NODE: row.FROM_NODE,
      TO_NODE: row.TO_NODE,
      LINE_NO: row.LINE_NO,
      COMPONENT_TYPE: type,
      DELTA_X: row.DELTA_X,
      DELTA_Y: row.DELTA_Y,
      DELTA_Z: row.DELTA_Z,
      DIAMETER: row.DIAMETER,
      WALL_THICK: row.WALL_THICK,
      BEND_PTR: row.BEND_PTR || undefined,
      RIGID_PTR: row.RIGID_PTR || undefined,
      INT_PTR: row.INT_PTR || undefined,
      T1: row.T1, T2: row.T2, T3: row.T3, T4: row.T4, T5: row.T5, T6: row.T6, T7: row.T7, T8: row.T8, T9: row.T9,
      P1: row.P1, P2: row.P2, P3: row.P3, P4: row.P4, P5: row.P5, P6: row.P6, P7: row.P7, P8: row.P8, P9: row.P9,
      P_HYDRO: row.P_HYDRO,
      CORR_ALLOW: row.CORR_ALLOW,
      INSUL_DENSITY: row.INSUL_DENSITY,
      FLUID_DENSITY: row.FLUID_DENSITY,
      MATERIAL_NAME: row.MATERIAL_NAME
    };

    // Apply Support Tags if Restraint exists
    if (row.RST_TYPE) {
      baseSegment.SUPPORT_TAG = row.RST_TYPE;
    }

    segments.push(baseSegment);

    // Look-ahead for Bends (CAESAR II defines bends over 3 nodes usually)
    if (row.BEND_PTR > 0 && i + 2 < csvRows.length) {
      const r1 = csvRows[i + 1];
      const r2 = csvRows[i + 2];

      // Insert ghost segments
      segments.push({
        ...baseSegment,
        FROM_NODE: r1.FROM_NODE,
        TO_NODE: r1.TO_NODE,
        DELTA_X: r1.DELTA_X, DELTA_Y: r1.DELTA_Y, DELTA_Z: r1.DELTA_Z,
        COMPONENT_TYPE: 'GHOST'
      });
      segments.push({
        ...baseSegment,
        FROM_NODE: r2.FROM_NODE,
        TO_NODE: r2.TO_NODE,
        DELTA_X: r2.DELTA_X, DELTA_Y: r2.DELTA_Y, DELTA_Z: r2.DELTA_Z,
        COMPONENT_TYPE: 'GHOST'
      });

      // Insert the actual composite BEND segment
      segments.push({
        FROM_NODE: r1.FROM_NODE,
        TO_NODE: r2.TO_NODE,
        LINE_NO: baseSegment.LINE_NO,
        COMPONENT_TYPE: 'BEND',
        DELTA_X: r1.DELTA_X + r2.DELTA_X,
        DELTA_Y: r1.DELTA_Y + r2.DELTA_Y,
        DELTA_Z: r1.DELTA_Z + r2.DELTA_Z,
        DIAMETER: baseSegment.DIAMETER,
        WALL_THICK: baseSegment.WALL_THICK,
        CONTROL_NODE: r1.TO_NODE, // Intersect node
        T1: baseSegment.T1, T2: baseSegment.T2, T3: baseSegment.T3, T4: baseSegment.T4, T5: baseSegment.T5, T6: baseSegment.T6, T7: baseSegment.T7, T8: baseSegment.T8, T9: baseSegment.T9,
        P1: baseSegment.P1, P2: baseSegment.P2, P3: baseSegment.P3, P4: baseSegment.P4, P5: baseSegment.P5, P6: baseSegment.P6, P7: baseSegment.P7, P8: baseSegment.P8, P9: baseSegment.P9,
        P_HYDRO: baseSegment.P_HYDRO,
        CORR_ALLOW: baseSegment.CORR_ALLOW,
        INSUL_DENSITY: baseSegment.INSUL_DENSITY,
        FLUID_DENSITY: baseSegment.FLUID_DENSITY,
        MATERIAL_NAME: baseSegment.MATERIAL_NAME
      });

      i += 3; // Skip next two as they were consumed by the bend
    } else {
      i += 1;
    }
  }

  return segments;
}

function _classifyComponent(row) {
  if (row.INT_PTR > 0) return 'TEE';
  if (row.REDUCER_PTR > 0) return 'REDUCER-CONCENTRIC';
  if (row.BEND_PTR > 0) return 'BEND';
  if (row.RIGID_PTR > 0) return row.FLANGE_PTR > 0 ? 'FLANGE' : 'VALVE';
  return 'PIPE';
}

function _supportNameFromType(type = '') {
  const t = String(type).toUpperCase();
  if (/(^|[^A-Z0-9])(RIGID\s+)?ANC(HOR)?([^A-Z0-9]|$)|\bFIXED\b/.test(t)) return 'ANCHOR';
  if (/\bGDE\b|\bGUI\b|GUIDE|SLIDE|SLID/.test(t)) return 'GUIDE';
  if (/\bRST\b|\bREST\b|\+Y\s*(SUPPORT|RESTRAINT)\b|\bY\s*(SUPPORT|RESTRAINT)\b|\+Y\b/.test(t)) return 'REST';
  return null;
}

function _extractSupportBlockCode(text = '') {
  const m = String(text).toUpperCase().match(/\bCA\d+\b/);
  return m ? m[0] : '';
}

function _supportKindFromBlock(blockCode = '', description = '') {
  return resolveKindPure(
    { SKEY: String(blockCode || '').trim(), NAME: String(description || '').trim() },
    { userRules: [], kindMap: {}, defaultKind: null },
  );
  // Returns null when nothing matches — all call sites handle null via || chaining
}

function _supportNameFromDofs(text = '') {
  const dofs = String(text)
    .split(/[,\s]+/)
    .map(v => Number(v))
    .filter(v => Number.isFinite(v))
    .map(v => Math.trunc(v));
  if (!dofs.length) return null;
  const unique = [...new Set(dofs)];
  if (unique.length >= 6) return 'ANCHOR';
  if (unique.length === 1 && unique[0] === 2) return 'REST';
  if (unique.every(v => v === 1 || v === 3) && unique.length >= 1) return 'GUIDE';
  return null;
}

function _supportNameFromAxisCosines(text = '') {
  const parts = String(text)
    .split(/[,\s]+/)
    .map(v => Number(v))
    .filter(v => Number.isFinite(v));
  if (parts.length < 3) return null;
  const x = parts[0];
  const y = parts[1];
  const z = parts[2];
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return null;
  // Restraint semantics follow CAESAR DOF conventions where +Y is gravity-rest.
  // Keep this classification in CAESAR space (do not apply render-axis remap here).
  const verticalness = Math.abs(y) / len;
  if (verticalness > 0.75) return 'REST';
  if (Math.max(Math.abs(x), Math.abs(z)) / len > 0.75) return 'GUIDE';
  return null;
}

function _fmtCoord(v, decimals) {
  return Number(v ?? 0).toFixed(decimals);
}

function _msgDirection(dx, dy, dz) {
  const ax = Math.abs(dx ?? 0);
  const ay = Math.abs(dy ?? 0);
  const az = Math.abs(dz ?? 0);
  if (ax >= ay && ax >= az) return (dx ?? 0) >= 0 ? 'EAST' : 'WEST';
  if (ay >= ax && ay >= az) return (dy ?? 0) >= 0 ? 'NORTH' : 'SOUTH';
  return (dz ?? 0) >= 0 ? 'UP' : 'DOWN';
}

function _coordOrNull(pt) {
  if (!pt) return null;
  return pt;
}

function _coordForPcf(pt) {
  if (!pt) return { x: 0, y: 0, z: 0 };
  return { x: pt.x ?? 0, y: pt.y ?? 0, z: pt.z ?? 0 };
}

export function normalizeToPCFWithContinuity(csvRows, options = {}) {
  if (!Array.isArray(csvRows) || !csvRows.length) return [];

  const nodePos = new Map();
  const first = csvRows[0];
  nodePos.set(first.FROM_NODE, { x: 0, y: 0, z: 0 });

  // Resolve node positions from FROM/TO + deltas using iterative continuity pass.
  // The backward pass (!a && b) handles reversed connections (e.g. 30→20 where 20 is known).
  let progress = true;
  let guard = 0;
  while (progress && guard < csvRows.length * 4) {
    guard += 1;
    progress = false;
    for (const r of csvRows) {
      const a = nodePos.get(r.FROM_NODE);
      const b = nodePos.get(r.TO_NODE);
      const dx = Number(r.DELTA_X || 0);
      const dy = Number(r.DELTA_Y || 0);
      const dz = Number(r.DELTA_Z || 0);
      if (a && !b) {
        nodePos.set(r.TO_NODE, { x: a.x + dx, y: a.y + dy, z: a.z + dz });
        progress = true;
      } else if (!a && b) {
        nodePos.set(r.FROM_NODE, { x: b.x - dx, y: b.y - dy, z: b.z - dz });
        progress = true;
      }
    }
  }

  // Multi-island seeding: find FROM_NODEs that are island roots (never a TO_NODE)
  // and still unresolved after the main pass. Seed each at an offset past existing
  // resolved nodes, then re-run the continuity pass for that island.
  {
    const toNodeSet = new Set(csvRows.map(r => r.TO_NODE));
    const unresolvedRoots = [...new Set(
      csvRows
        .filter(r => !toNodeSet.has(r.FROM_NODE) && !nodePos.has(r.FROM_NODE))
        .map(r => r.FROM_NODE)
    )];

    for (const rootNode of unresolvedRoots) {
      const vals = [...nodePos.values()];
      const maxX = vals.length ? Math.max(...vals.map(p => p.x)) : 0;
      nodePos.set(rootNode, { x: maxX + 3000, y: 0, z: 0 });

      let ip = true;
      let ig = 0;
      while (ip && ig < csvRows.length * 4) {
        ig++;
        ip = false;
        for (const r of csvRows) {
          const a = nodePos.get(r.FROM_NODE);
          const b = nodePos.get(r.TO_NODE);
          const dx = Number(r.DELTA_X || 0);
          const dy = Number(r.DELTA_Y || 0);
          const dz = Number(r.DELTA_Z || 0);
          if (a && !b) { nodePos.set(r.TO_NODE,   { x: a.x+dx, y: a.y+dy, z: a.z+dz }); ip = true; }
          else if (!a && b) { nodePos.set(r.FROM_NODE, { x: b.x-dx, y: b.y-dy, z: b.z-dz }); ip = true; }
        }
      }
    }
  }

  const segments = [];
  const emittedSupports = new Set();
  let seq = 1;
  for (let i = 0; i < csvRows.length; i++) {
    const r = csvRows[i];
    const comp = _classifyComponent(r);
    const bore = Number(r.DIAMETER || 0);

    // Always resolve p1/p2 from the current row for any restraint block below
    const p1 = _coordOrNull(nodePos.get(r.FROM_NODE));
    const p2 = _coordOrNull(nodePos.get(r.TO_NODE));

    // Look-ahead for Bends (CAESAR II defines bends over 3 nodes usually)
    if (r.BEND_PTR > 0 && i + 2 < csvRows.length) {
      const r1 = csvRows[i + 1];
      const r2 = csvRows[i + 2];
      const bp1 = _coordOrNull(nodePos.get(r1.FROM_NODE));
      const bp2 = _coordOrNull(nodePos.get(r2.TO_NODE));
      const cp  = _coordOrNull(nodePos.get(r1.TO_NODE));

      segments.push({
        METHOD: 'ContEngineMethod',
        SEQ_NO: seq++,
        PIPELINE_REFERENCE: r.LINE_NO || '',
        COMPONENT_TYPE: 'BEND',
        REF_NO: `${r.LINE_NO || 'LINE'}_${r.ELEMENTID ?? seq}`,
        FROM_NODE: r1.FROM_NODE,
        TO_NODE: r2.TO_NODE,
        EP1: bp1,
        EP2: bp2,
        CP: cp,
        DELTA_X: Number(r1.DELTA_X || 0) + Number(r2.DELTA_X || 0),
        DELTA_Y: Number(r1.DELTA_Y || 0) + Number(r2.DELTA_Y || 0),
        DELTA_Z: Number(r1.DELTA_Z || 0) + Number(r2.DELTA_Z || 0),
        CONTROL_NODE: r1.TO_NODE,
        DIAMETER: bore,
        WALL_THICK: Number(r.WALL_THICK || 0),
        MATERIAL: r.MATERIAL_NAME || '',
        T1: Number(r.T1 || 0), T2: Number(r.T2 || 0), T3: Number(r.T3 || 0),
        P1: Number(r.P1 || 0), P2: Number(r.P2 || 0), P3: Number(r.P3 || 0),
        P_HYDRO: Number(r.P_HYDRO || 0),
        CORR_ALLOW: Number(r.CORR_ALLOW || 0),
        INSUL_DENSITY: Number(r.INSUL_DENSITY || 0),
        FLUID_DENSITY: Number(r.FLUID_DENSITY || 0),
        RIGID_WEIGHT: Number(r.RGD_WGT || 0),
        SUPPORT_NAME: '', SUPPORT_GUID: '', SUPPORT_COORDS: null,
        SKEY: 'BEBW',
      });
      i += 2; // Consume the extra 2 rows
    } else {
      segments.push({
        METHOD: 'ContEngineMethod',
        SEQ_NO: seq++,
        PIPELINE_REFERENCE: r.LINE_NO || '',
        COMPONENT_TYPE: comp,
        REF_NO: `${r.LINE_NO || 'LINE'}_${r.ELEMENTID ?? seq}`,
        FROM_NODE: r.FROM_NODE,
        TO_NODE: r.TO_NODE,
        EP1: p1,
        EP2: p2,
        CP: comp === 'TEE' ? p2 : null,
        DELTA_X: Number(r.DELTA_X || 0),
        DELTA_Y: Number(r.DELTA_Y || 0),
        DELTA_Z: Number(r.DELTA_Z || 0),
        CONTROL_NODE: 0,
        DIAMETER: bore,
        WALL_THICK: Number(r.WALL_THICK || 0),
        MATERIAL: r.MATERIAL_NAME || '',
        T1: Number(r.T1 || 0), T2: Number(r.T2 || 0), T3: Number(r.T3 || 0),
        P1: Number(r.P1 || 0), P2: Number(r.P2 || 0), P3: Number(r.P3 || 0),
        P_HYDRO: Number(r.P_HYDRO || 0),
        CORR_ALLOW: Number(r.CORR_ALLOW || 0),
        INSUL_DENSITY: Number(r.INSUL_DENSITY || 0),
        FLUID_DENSITY: Number(r.FLUID_DENSITY || 0),
        RIGID_WEIGHT: Number(r.RGD_WGT || 0),
        SUPPORT_NAME: '', SUPPORT_GUID: '', SUPPORT_COORDS: null,
        SKEY: comp === 'FLANGE' ? 'FLWN'
          : comp === 'VALVE' ? 'VBFL'
          : comp === 'TEE' ? 'TEBW'
          : comp.startsWith('REDUCER') ? 'RCBW' : '',
      });
    }

    // Restraints connected by REST_PTR to TO-node are exported as SUPPORT rows.
    if (r.RST_TYPE || r.RST_RAW_TYPE || r.RST_AXIS_COSINES || r.RST_DOFS) {
      const rawSupportType = String(r.RST_TYPE || r.RST_RAW_TYPE || '').trim();
      const supportBlock = String(r.RST_BLOCK || _extractSupportBlockCode(rawSupportType)).toUpperCase();
      const supportDesc = String(r.RST_DESC || '').trim();
      const explicitSupport = /(\bANC(HOR)?\b|\bFIXED\b|\bGDE\b|\bGUI\b|\bGUIDE\b|\bSLIDE\b|\bRST\b|\bREST\b|\+Y\b|\bSTOP\b|\bSPRING\b|\bHANGER\b)/i.test(String(r.RST_TYPE || r.RST_RAW_TYPE || r.RST_DESC || ''))
        || !!supportBlock;
      const supportKind = String(r.RST_KIND || '').toUpperCase()
        || _supportKindFromBlock(supportBlock, supportDesc)
        || _supportNameFromType(rawSupportType)
        || _supportNameFromDofs(r.RST_DOFS || '')
        || _supportNameFromAxisCosines(r.RST_AXIS_COSINES || '');
      const supportName = supportBlock || _extractSupportBlockCode(rawSupportType) || supportKind;
      const hasDofs = !!String(r.RST_DOFS || '').trim();
      const supportNode = Number(r.RST_NODE_NUM || r.TO_NODE || r.FROM_NODE || 0);
      const supportCoords = _coordOrNull(nodePos.get(supportNode))
        || (supportNode === r.FROM_NODE ? p1 : null)
        || (supportNode === r.TO_NODE ? p2 : null)
        || p2
        || p1;
      const supportKey = `${Number(r.REST_PTR || 0)}|${supportNode}|${supportName || ''}|${supportKind || ''}|${r.RST_AXIS_COSINES || ''}`;
      if (!supportKind || (!explicitSupport && !r.RST_AXIS_COSINES && !hasDofs) || !supportCoords || emittedSupports.has(supportKey)) {
        continue;
      }
      emittedSupports.add(supportKey);

      segments.push({
        METHOD: 'ContEngineMethod',
        SEQ_NO: seq++,
        PIPELINE_REFERENCE: r.LINE_NO || '',
        COMPONENT_TYPE: 'SUPPORT',
        REF_NO: `${r.LINE_NO || 'LINE'}_SUP_${supportNode}`,
        FROM_NODE: supportNode,
        TO_NODE: supportNode,
        EP1: null,
        EP2: null,
        DELTA_X: 0,
        DELTA_Y: 0,
        DELTA_Z: 0,
        DIAMETER: 0,
        WALL_THICK: 0,
        MATERIAL: '',
        T1: 0, T2: 0, T3: 0, T4: 0, T5: 0, T6: 0, T7: 0, T8: 0, T9: 0,
        P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0, P7: 0, P8: 0, P9: 0,
        P_HYDRO: 0,
        CORR_ALLOW: 0,
        INSUL_DENSITY: 0,
        FLUID_DENSITY: 0,
        RIGID_WEIGHT: 0,
        SUPPORT_NAME: supportName,
        SUPPORT_KIND: supportKind,
        SUPPORT_TAG: rawSupportType,
        SUPPORT_DESC: supportDesc,
        SUPPORT_FRICTION: r.RST_FRICTION ?? '',
        SUPPORT_GAP: r.RST_GAP ?? '',
        SUPPORT_GUID: `UCI:${supportNode}`,
        SUPPORT_COORDS: supportCoords,
        SUPPORT_DOFS: r.RST_DOFS || '',
        AXIS_COSINES: (() => {
          if (r.RST_AXIS_COSINES) return r.RST_AXIS_COSINES;
          const d = Number(String(r.RST_DOFS || '').split(/[,\s]/)[0]);
          if (d === 1) return '1, 0, 0';
          if (d === 2) return '0, 1, 0';
          if (d === 3) return '0, 0, 1';
          return '';
        })(),
        PIPE_AXIS_COSINES: `${r.DELTA_X || 0}, ${r.DELTA_Y || 0}, ${r.DELTA_Z || 0}`,
        SKEY: '',
      });
    }
  }
  return segments;
}

export function buildPcfFromContinuity(segments, options = {}) {
  const decimals = options.decimals === 1 ? 1 : 4;
  const sourceName = options.sourceName || 'export';
  const pipeline = segments.find(s => s.PIPELINE_REFERENCE)?.PIPELINE_REFERENCE || sourceName;
  const mapping = getPcfMapping();
  const lines = [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
    `PIPELINE-REFERENCE export ${pipeline}`,
    '    PROJECT-IDENTIFIER P1',
    '    AREA A1',
    '',
  ];

  for (const s of segments) {
    if (s.COMPONENT_TYPE === 'SUPPORT') {
      lines.push('MESSAGE-SQUARE');
      lines.push(`    SUPPORT, RefNo:=${s.REF_NO}, SeqNo:${s.SEQ_NO}, ${s.SUPPORT_NAME || 'RST'}, ${s.SUPPORT_GUID || 'UCI:UNKNOWN'}`);
      lines.push('SUPPORT');
      const c = _coordForPcf(s.SUPPORT_COORDS);
      lines.push(`    CO-ORDS    ${_fmtCoord(c.x, decimals)} ${_fmtCoord(c.y, decimals)} ${_fmtCoord(c.z, decimals)} ${_fmtCoord(0, decimals)}`);
      lines.push(`    <SUPPORT_NAME>    ${s.SUPPORT_NAME || 'RST'}`);
      lines.push(`    <SUPPORT_GUID>    ${s.SUPPORT_GUID || 'UCI:UNKNOWN'}`);
      lines.push('');
      continue;
    }

    const len = Math.sqrt((s.DELTA_X ** 2) + (s.DELTA_Y ** 2) + (s.DELTA_Z ** 2));
    lines.push('MESSAGE-SQUARE');
    lines.push(`    ${s.COMPONENT_TYPE}, ${s.MATERIAL || 'CS'}, LENGTH=${Math.round(Math.abs(len))}MM, ${_msgDirection(s.DELTA_X, s.DELTA_Y, s.DELTA_Z)}, RefNo:=${s.REF_NO}, SeqNo:${s.SEQ_NO}`);
    lines.push(s.COMPONENT_TYPE);
    const a = _coordForPcf(s.EP1);
    const b = _coordForPcf(s.EP2);
    lines.push(`    END-POINT    ${_fmtCoord(a.x, decimals)} ${_fmtCoord(a.y, decimals)} ${_fmtCoord(a.z, decimals)} ${_fmtCoord(s.DIAMETER, decimals)}`);
    lines.push(`    END-POINT    ${_fmtCoord(b.x, decimals)} ${_fmtCoord(b.y, decimals)} ${_fmtCoord(b.z, decimals)} ${_fmtCoord(s.DIAMETER, decimals)}`);
    if (s.CP && (s.COMPONENT_TYPE === 'BEND' || s.COMPONENT_TYPE === 'TEE')) {
      const cp = _coordForPcf(s.CP);
      lines.push(`    CENTRE-POINT    ${_fmtCoord(cp.x, decimals)} ${_fmtCoord(cp.y, decimals)} ${_fmtCoord(cp.z, decimals)}`);
    }
    if (s.COMPONENT_TYPE === 'PIPE' && s.PIPELINE_REFERENCE) {
      lines.push(`    PIPELINE-REFERENCE export ${s.PIPELINE_REFERENCE}`);
    }
    if (s.SKEY) lines.push(`    <SKEY>  ${s.SKEY}`);
    if (s.P1 && mapping['P1']) lines.push(`    ${mapping['P1']}    ${Math.round(s.P1 * 100)} KPA`);
    if (s.T1 && mapping['T1']) lines.push(`    ${mapping['T1']}    ${Math.round(s.T1)} C`);

    const materialNumeric = (s.MATERIAL && s.MATERIAL.match(/\d+/)) ? s.MATERIAL.match(/\d+/)[0] : s.MATERIAL;
    if (materialNumeric && mapping['MATERIAL']) lines.push(`    ${mapping['MATERIAL']}    ${materialNumeric}`);

    if (s.WALL_THICK && mapping['WALLTHK']) lines.push(`    ${mapping['WALLTHK']}    ${s.WALL_THICK} MM`);
    if (s.CORR_ALLOW && mapping['CORRALLW']) lines.push(`    ${mapping['CORRALLW']}    ${s.CORR_ALLOW} MM`);
    if (s.INSUL_DENSITY && mapping['INSULDENS']) lines.push(`    ${mapping['INSULDENS']}    ${Math.round(s.INSUL_DENSITY * 1000000)} KG/M3`);
    if (s.RIGID_WEIGHT && s.COMPONENT_TYPE !== 'PIPE' && mapping['WEIGHT']) lines.push(`    ${mapping['WEIGHT']}    ${s.RIGID_WEIGHT} KG`);
    if (s.FLUID_DENSITY && mapping['FLUIDDENS']) lines.push(`    ${mapping['FLUIDDENS']}    ${Math.round(s.FLUID_DENSITY * 1000000)} KG/M3`);
    if (s.P_HYDRO && mapping['PHYDRO']) lines.push(`    ${mapping['PHYDRO']}    ${Math.round(s.P_HYDRO * 100)} KPA`);

    for (let i = 2; i <= 9; i++) {
        if (s[`T${i}`] > 0 && mapping[`T${i}`]) lines.push(`    ${mapping[`T${i}`]}    ${Math.round(s[`T${i}`])} C`);
        if (s[`P${i}`] > 0 && mapping[`P${i}`]) lines.push(`    ${mapping[`P${i}`]}    ${Math.round(s[`P${i}`] * 100)} KPA`);
    }

    lines.push(`    COMPONENT-ATTRIBUTE97    =${s.REF_NO}`);
    lines.push(`    COMPONENT-ATTRIBUTE98    ${s.SEQ_NO}`);
    lines.push('');
  }

  // CRLF is mandatory by spec.
  return lines.join('\r\n');
}

// ── Stage 3: PCF Adapter for Renderer ─────────────────────────────────────────

export function adaptForRenderer(segments, originalParsed) {
  // The IsometricRenderer expects the "original" format with `dx, dy, dz`, `from`, `to`, `od`.
  // Here we map the PCF segments back into a format the renderer can digest without
  // breaking the rest of the application.

  const rendererElements = segments.map(seg => ({
    // Identity mapping
    from: seg.FROM_NODE,
    to: seg.TO_NODE,
    lineNo: seg.LINE_NO,

    // Geometry mapping
    dx: seg.DELTA_X,
    dy: seg.DELTA_Y,
    dz: seg.DELTA_Z,
    od: seg.DIAMETER,
    wall: seg.WALL_THICK,
    fromPos: seg.EP1 || undefined,
    toPos: seg.EP2 || undefined,

    // Additional renderer fields
    T1: seg.T1,
    P1: seg.P1,
    P2: seg.P2,
    material: seg.MATERIAL_NAME || seg.MATERIAL,

    // Component type handling (specifically bends)
    isBend: seg.COMPONENT_TYPE === 'BEND',
    isGhost: seg.COMPONENT_TYPE === 'GHOST',
    controlNode: seg.CONTROL_NODE,

    // Support tags
    support: seg.SUPPORT_TAG ? { type: seg.SUPPORT_TAG } : null
  }));

  return {
    ...originalParsed,
    elements: rendererElements
  };
}
