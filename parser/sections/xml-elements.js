/**
 * xml-elements.js — Parse CAESARII XML format (used by SAMPLE2.ACCDB, RELIEF-FLANGED.ACCDB).
 *
 * XML format attributes on <PIPINGELEMENT>:
 *   FROM_NODE, TO_NODE, DELTA_X, DELTA_Y, DELTA_Z
 *   DIAMETER, WALL_THICK, INSUL_THICK, CORR_ALLOW
 *   TEMP_EXP_C1 (T1), TEMP_EXP_C2 (T2)
 *   PRESSURE1 (P1), HYDRO_PRESSURE
 *   MODULUS (E_cold), HOT_MOD1 (E_hot)
 *   POISSONS, PIPE_DENSITY, FLUID_DENSITY
 *   MATERIAL_NAME, MATERIAL_NUM
 *
 * IMPORTANT — Property inheritance:
 *   CAESAR II only writes an attribute when it *changes* from the previous element.
 *   Absent attributes must carry forward from the previous element, not default to 0.
 *
 * Sentinel value: -1.0101 means "not set / use default"
 */

import { pipeLength } from '../../utils/formatter.js';
import { debugSupport } from '../../debug/support-debug.js';

function _axisBucket(axis) {
  if (!axis) return 'none';
  const x = Math.abs(Number(axis.x || 0));
  const y = Math.abs(Number(axis.y || 0));
  const z = Math.abs(Number(axis.z || 0));
  if (y >= x && y >= z) return 'Y';
  if (x >= y && x >= z) return 'X';
  if (z >= x && z >= y) return 'Z';
  return 'mixed';
}

const SENTINEL = -1.0101;
const isSentinel = v => Math.abs(v - SENTINEL) < 0.001;

/** Read a numeric attribute; return null if absent or sentinel (caller handles inheritance). */
const attrNum = (el, name) => {
  const raw = el.getAttribute(name);
  if (raw === null) return null;
  const n = parseFloat(raw);
  return (isNaN(n) || isSentinel(n)) ? null : n;
};

/** Read a string attribute; return null if absent or empty. */
const attrStr = (el, name) => {
  const raw = el.getAttribute(name);
  return (raw === null || raw === '') ? null : raw;
};

/** Resolve: use element's own value if present, otherwise carry forward from prev, otherwise use hardcoded fallback. */
const resolve = (own, prev, fallback) => own !== null ? own : (prev !== undefined && prev !== null ? prev : fallback);
const resolveStr = (own, prev, fallback) => own !== null ? own : (prev !== undefined && prev !== null ? prev : fallback);

export function parseXmlElements(rawText, log) {
  const elements   = [];
  const nodes      = {};
  const bends      = [];
  const restraints = [];
  const forces     = [];
  const rigids     = [];
  const meta       = {};

  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(rawText, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error(parseError.textContent.slice(0, 120));
  } catch (e) {
    log.push({ level: 'ERROR', msg: `XML parse failed: ${e.message}` });
    return { elements, nodes, bends, restraints, forces, rigids };
  }

  // Model metadata
  let north = { x: 0, y: 0, z: -1 };
  const model = doc.querySelector('PIPINGMODEL');
  if (model) {
    const jobName = model.getAttribute('JOBNAME') ?? '—';
    const numElt  = model.getAttribute('NUMELT') ?? '?';
    meta.jobName = jobName;
    meta.numElt = Number(numElt || 0);
    meta.northX = attrNum(model, 'NORTH_X');
    meta.northY = attrNum(model, 'NORTH_Y');
    meta.northZ = attrNum(model, 'NORTH_Z');
    
    if (meta.northX !== null && meta.northY !== null && meta.northZ !== null) {
      north = { x: meta.northX, y: meta.northY, z: meta.northZ };
    }
    
    log.push({ level: 'INFO', msg: `XML PIPINGMODEL: JOBNAME="${jobName}" | NUMELT=${numElt}` });
  }

  // Collect all PIPINGELEMENT nodes
  const elNodes = [...doc.querySelectorAll('PIPINGELEMENT')];
  if (!elNodes.length) {
    log.push({ level: 'WARN', msg: 'XML: no <PIPINGELEMENT> found' });
    return { elements, nodes, bends, restraints, forces, rigids };
  }

  // Set origin for first node
  const firstFrom = Math.round(parseFloat(elNodes[0].getAttribute('FROM_NODE') ?? 0));
  nodes[firstFrom] = { x: 0, y: 0, z: 0 };

  // ── Property carry-forward state ──────────────────────────────────────────
  // CAESAR II omits attributes that haven't changed since the previous element.
  // We track the last seen value for every inheritable property.
  let prev = {
    od:      null,
    wall:    null,
    insul:   null,
    corrosion: null,
    T1: null, T2: null, T3: null, T4: null, T5: null, T6: null, T7: null, T8: null, T9: null,
    P1: null, P2: null, P3: null, P4: null, P5: null, P6: null, P7: null, P8: null, P9: null,
    Phyd:    null,
    E_cold:  null,
    E_hot:   null,
    poisson: null,
    density: null,
    insulDensity: null,
    fluidDensity: null,
    matName: null,
  };
  const xmlRestraintByNode = new Map();
  const upsertXmlRestraint = (patch) => {
    const node = Number(patch?.node || 0);
    if (!Number.isFinite(node) || node <= 0) return;
    const existing = xmlRestraintByNode.get(node);
    const patchDofs = Array.isArray(patch?.dofs)
      ? [...new Set(patch.dofs.map((d) => Number(d)).filter((d) => Number.isFinite(d)).map((d) => Math.trunc(d)))]
      : [];

    debugSupport({
      stage: 'xml-parse',
      sourceId: `xml-restraint-${node}`,
      nodeId: node,
      rawType: String(patch?.rawType || patch?.type || ''),
      supportBlock: String(patch?.supportBlock || ''),
      typeCode: patch?.typeCode ?? '',
      dofs: patchDofs,
      axisCosines: patch?.axisCosines || null,
      axisBucket: _axisBucket(patch?.axisCosines),
    });

    if (!existing) {
      xmlRestraintByNode.set(node, {
        ptr: 0,
        node,
        type: String(patch?.type || 'Restraint (XML)'),
        rawType: String(patch?.rawType || patch?.type || 'Restraint (XML)'),
        supportBlock: String(patch?.supportBlock || ''),
        supportDescription: String(patch?.supportDescription || ''),
        isAnchor: !!patch?.isAnchor,
        dofs: patchDofs,
        stiffness: Number.isFinite(Number(patch?.stiffness)) ? Number(patch.stiffness) : 1e13,
        axisCosines: patch?.axisCosines || null,
        friction: Number.isFinite(Number(patch?.friction)) ? Number(patch.friction) : null,
        gap: Number.isFinite(Number(patch?.gap)) ? Number(patch.gap) : null,
        guid: String(patch?.guid || ''),
        typeCode: Number.isFinite(Number(patch?.typeCode)) ? Number(patch.typeCode) : null,
      });
      return;
    }
    if (patch?.type && /^Restraint \(XML\)$/i.test(existing.type)) existing.type = String(patch.type);
    if (patch?.rawType && /^Restraint \(XML\)$/i.test(existing.rawType)) existing.rawType = String(patch.rawType);
    if (patch?.supportBlock && !existing.supportBlock) existing.supportBlock = String(patch.supportBlock);
    if (patch?.supportDescription && !existing.supportDescription) existing.supportDescription = String(patch.supportDescription);
    if (patch?.axisCosines && !existing.axisCosines) existing.axisCosines = patch.axisCosines;
    if (!existing.guid && patch?.guid) existing.guid = String(patch.guid);
    if (existing.typeCode == null && Number.isFinite(Number(patch?.typeCode))) {
      existing.typeCode = Number(patch.typeCode);
    }
    if (patchDofs.length) {
      existing.dofs = [...new Set([...(existing.dofs || []), ...patchDofs])].sort((a, b) => a - b);
    }
    existing.isAnchor = existing.isAnchor || !!patch?.isAnchor;
  };

  elNodes.forEach((el, idx) => {
    // ── Geometry (always explicit per-element) ────────────────────────────
    const from = Math.round(parseFloat(el.getAttribute('FROM_NODE') ?? 0));
    const to   = Math.round(parseFloat(el.getAttribute('TO_NODE')   ?? 0));
    const dx   = parseFloat(el.getAttribute('DELTA_X') ?? 0) || 0;
    const dy   = parseFloat(el.getAttribute('DELTA_Y') ?? 0) || 0;
    const dz   = parseFloat(el.getAttribute('DELTA_Z') ?? 0) || 0;

    // ── Inheritable properties (carry forward when absent) ────────────────
    const ownOd      = attrNum(el, 'DIAMETER');
    const ownWall    = attrNum(el, 'WALL_THICK');
    const ownInsul   = attrNum(el, 'INSUL_THICK');
    const ownCorr    = attrNum(el, 'CORR_ALLOW');

    const ownT = [null];
    const ownP = [null];
    const resT = [null];
    const resP = [null];

    for (let j = 1; j <= 9; j++) {
       ownT[j] = attrNum(el, `TEMP_EXP_C${j}`);
       resT[j] = resolve(ownT[j], prev[`T${j}`], 0);

       ownP[j] = attrNum(el, `PRESSURE${j}`);
       resP[j] = resolve(ownP[j], prev[`P${j}`], 0);
    }

    const ownPhyd    = attrNum(el, 'HYDRO_PRESSURE');
    const ownEcold   = attrNum(el, 'MODULUS');
    const ownEhot    = attrNum(el, 'HOT_MOD1');
    const ownPoisson = attrNum(el, 'POISSONS');
    const ownDensity = attrNum(el, 'PIPE_DENSITY');
    const ownInsulDensity = attrNum(el, 'INSUL_DENSITY');
    const ownFluidDensity = attrNum(el, 'FLUID_DENSITY');
    const ownMat     = attrStr(el, 'MATERIAL_NAME');

    const od      = resolve(ownOd,      prev.od,      0);
    const wall    = resolve(ownWall,    prev.wall,    0);
    const insul   = resolve(ownInsul,   prev.insul,   0);
    const corrosion= resolve(ownCorr,   prev.corrosion, 0);
    const Phyd    = resolve(ownPhyd,    prev.Phyd,    0);
    const E_cold  = resolve(ownEcold,   prev.E_cold,  203390.7);
    const E_hot   = resolve(ownEhot,    prev.E_hot,   178960.6);
    const poisson = resolve(ownPoisson, prev.poisson, 0.292);
    const density = resolve(ownDensity, prev.density, 7.833e-3);
    const insulDensity = resolve(ownInsulDensity, prev.insulDensity, 0);
    const fluidDensity = resolve(ownFluidDensity, prev.fluidDensity, 0);
    const matName = resolveStr(ownMat,  prev.matName, 'CS');

    // Update carry-forward state
    prev = {
      od, wall, insul, corrosion,
      T1: resT[1], T2: resT[2], T3: resT[3], T4: resT[4], T5: resT[5], T6: resT[6], T7: resT[7], T8: resT[8], T9: resT[9],
      P1: resP[1], P2: resP[2], P3: resP[3], P4: resP[4], P5: resP[5], P6: resP[6], P7: resP[7], P8: resP[8], P9: resP[9],
      Phyd, E_cold, E_hot, poisson, density, insulDensity, fluidDensity, matName
    };

    // ── Node positions ────────────────────────────────────────────────────
    if (!nodes[from]) nodes[from] = { x: 0, y: 0, z: 0 };
    const origin = nodes[from];
    const toPos  = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
    if (!nodes[to]) nodes[to] = toPos;

    const len = pipeLength(dx, dy, dz);

    const ownName = attrStr(el, 'NAME');
    const ownLineNo = attrStr(el, 'LINE_NO') || attrStr(el, 'LINE-NO') || attrStr(el, 'LINE_NO_KEY') || attrStr(el, 'LINE-NO-KEY');
    const element = {
      index: idx, from, to, dx, dy, dz,
      od, wall, insul, corrosion,
      T1: resT[1], T2: resT[2], T3: resT[3], T4: resT[4], T5: resT[5], T6: resT[6], T7: resT[7], T8: resT[8], T9: resT[9],
      P1: resP[1], P2: resP[2], P3: resP[3], P4: resP[4], P5: resP[5], P6: resP[6], P7: resP[7], P8: resP[8], P9: resP[9],
      P_hydro: Phyd,
      E_cold, E_hot, density, insulDensity, fluidDensity, poisson,
      material: matName,
      name: ownName || '',
      lineNo: ownLineNo || '',
      length: len,
      fromPos: { ...origin },
      toPos:   { ...toPos },
      hasBend: false,
    };
    elements.push(element);

    // Parse child RIGID elements
    [...el.querySelectorAll('RIGID')].forEach(rig => {
      const w = parseFloat(rig.getAttribute('WEIGHT') ?? 0);
      if (w > 0) {
        const rPtr = rigids.length + 1;
        rigids.push({ id: rPtr, ptr: rPtr, node: from, mass: w, weight: w, type: rig.getAttribute('TYPE') ?? 'Rigid' });
        element.rigidPtr = rPtr;
      }
    });

    // Parse child DISPLACEMENTS (restraints)
    [...el.querySelectorAll('DISPLACEMENTS')].forEach(disp => {
      const nodeNum = Math.round(parseFloat(disp.getAttribute('NODE_NUM') ?? from));
      if (nodeNum > 0) {
        upsertXmlRestraint({
          node: nodeNum,
          type: 'Fixed (XML)',
          rawType: 'Fixed (XML)',
          supportDescription: 'Fixed (XML)',
          isAnchor: true,
          dofs: [1, 2, 3, 4, 5, 6],
          stiffness: 1e13,
        });
      }
    });
  });

  // ── Bends ────────────────────────────────────────────────────────────────
  [...doc.querySelectorAll('BEND')].forEach((bend) => {
    const nearNode = Math.round(parseFloat(bend.getAttribute('NEAR_NODE') ?? 0));
    const radius   = parseFloat(bend.getAttribute('BEND_RADIUS') ?? 0);
    // Bind the bend to the element that approaches it (terminates at nearNode).
    // If none exists (e.g., node 0 is the nearNode), fallback to the one starting from it.
    let elIdx = elements.findIndex(e => e.to === nearNode);
    if (elIdx < 0) {
      elIdx = elements.findIndex(e => e.from === nearNode);
    }
    
    if (elIdx >= 0) {
      elements[elIdx].hasBend = true;
      const bPtr = bends.length + 1;
      bends.push({ ptr: bPtr, elementIndex: elIdx, radius, nearNode });
      elements[elIdx].bendPtr = bPtr;
    }
  });

  // ── Restraints ───────────────────────────────────────────────────────────
  [...doc.querySelectorAll('RESTRAINT')].forEach(r => {
    const nodeRaw = attrNum(r, 'NODE');
    const node = Math.round(Number(nodeRaw || 0));
    if (!Number.isFinite(node) || node <= 0) return;

    const rawTypeToken = String(attrStr(r, 'RESTRAINT_TYPE') || attrStr(r, 'TYPE') || '').trim();
    const tag = String(attrStr(r, 'TAG') || '').trim();
    const guid = String(attrStr(r, 'GUID') || '').trim();
    const sourceText = [rawTypeToken, tag].filter(Boolean).join(' ').trim();
    const supportBlockMatch = sourceText.toUpperCase().match(/\bCA\d+\b/);
    const supportBlock = supportBlockMatch ? supportBlockMatch[0] : '';
    const type = tag || (rawTypeToken ? `Type ${rawTypeToken}` : 'Restraint (XML)');
    const rawType = sourceText || type;

    const x = attrNum(r, 'XCOSINE');
    const y = attrNum(r, 'YCOSINE');
    const z = attrNum(r, 'ZCOSINE');
    const axisCosines = (x !== null && y !== null && z !== null)
      ? { x, y, z }
      : null;

    const isAnchor = /\bANCHOR\b|\bFIX(ED)?\b/.test(rawType.toUpperCase());
    const dofs = [];
    const typeCode = Number(rawTypeToken);
    if (isAnchor) {
      dofs.push(1, 2, 3, 4, 5, 6);
    } else if (Number.isFinite(typeCode) && typeCode >= 1 && typeCode <= 6) {
      dofs.push(Math.trunc(typeCode));
    } else if (axisCosines) {
      const ax = Math.abs(axisCosines.x);
      const ay = Math.abs(axisCosines.y);
      const az = Math.abs(axisCosines.z);
      if (ay >= ax && ay >= az) dofs.push(2);
      else if (ax >= ay && ax >= az) dofs.push(1);
      else dofs.push(3);
    }

    upsertXmlRestraint({
      node,
      type,
      rawType,
      supportBlock,
      supportDescription: tag || rawTypeToken || '',
      isAnchor,
      dofs,
      stiffness: 1e13,
      axisCosines,
      friction: attrNum(r, 'FRIC_COEF'),
      gap: attrNum(r, 'GAP'),
      guid,
      typeCode: Number.isFinite(typeCode) ? typeCode : null,
    });
  });

  const restraintPtrByNode = new Map();
  const orderedRestraints = [...xmlRestraintByNode.values()].sort((a, b) => a.node - b.node);
  for (const item of orderedRestraints) {
    const ptr = restraints.length + 1;
    const entry = {
      ...item,
      ptr,
      dofs: Array.isArray(item.dofs) ? item.dofs : [],
    };
    restraints.push(entry);
    restraintPtrByNode.set(item.node, ptr);
  }
  if (restraintPtrByNode.size) {
    elements.forEach((el) => {
      if (Number.isFinite(Number(el.restPtr)) && Number(el.restPtr) > 0) return;
      const ptr = restraintPtrByNode.get(el.to) || restraintPtrByNode.get(el.from) || 0;
      if (ptr > 0) el.restPtr = ptr;
    });
  }

  // ── Summary log ──────────────────────────────────────────────────────────
  log.push({ level: 'INFO', msg: `XML ELEMENTS: ${elements.length} element(s) → ${Object.keys(nodes).length} node(s)` });
  if (bends.length)      log.push({ level: 'INFO', msg: `XML BEND: ${bends.length} bend(s)` });
  if (restraints.length) log.push({ level: 'INFO', msg: `XML RESTRAINT: ${restraints.length} restraint node(s)` });
  if (rigids.length) {
    const maxMass = Math.max(...rigids.map(r => r.mass));
    log.push({ level: 'INFO', msg: `XML RIGID: ${rigids.length} rigid element(s) — max mass ${maxMass.toFixed(1)} kg` });
  }

  // Count how many elements had to inherit each key property (diagnostic)
  const inherited = elements.filter((e, i) => {
    const el = doc.querySelectorAll('PIPINGELEMENT')[i];
    return el && el.getAttribute('DIAMETER') === null;
  }).length;
  if (inherited > 0) {
    log.push({ level: 'INFO', msg: `XML ELEMENTS: ${inherited} element(s) inherited DIAMETER from previous (CAESAR II property carry-forward)` });
  }

  if (elements.length > 0) {
    const uniqueODs = [...new Set(elements.map(e => e.od.toFixed(1)))].filter(v => parseFloat(v) > 0);
    log.push({ level: 'INFO', msg: `XML ELEMENTS: OD sizes → ${uniqueODs.join(', ')} mm` });
    const mats = [...new Set(elements.map(e => e.material || 'CS'))];
    log.push({ level: 'INFO', msg: `XML ELEMENTS: Materials → ${mats.join(', ')}` });
  }

  return { elements, nodes, bends, restraints, forces, rigids, meta, format: 'XML', north };
}
