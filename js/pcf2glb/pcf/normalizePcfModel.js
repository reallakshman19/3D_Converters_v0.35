/**
 * normalizePcfModel.js
 * Converts splitPcfBlocks output into a normalized component model.
 * Each component has: id, type, ep1, ep2, coOrds, cp, bp, bore, attributes{}, raw{}.
 */

const GEOMETRY_KEYS = new Set([
  'END-POINT',
  'CO-ORDS',
  'CENTRE-POINT',
  'CENTER-POINT',
  'BRANCH1-POINT',
  'BRANCH-POINT',
  'BRANCH_POINT',
  'BRANCH1_POINT',
]);

function parsePoint(str, includeBore) {
  const parts = String(str || '').trim().split(/\s+/).map(Number);
  if (parts.length < 3 || !parts.slice(0, 3).every(Number.isFinite)) return null;
  const pt = { x: parts[0], y: parts[1], z: parts[2] };
  if (includeBore) pt.bore = Number.isFinite(parts[3]) ? parts[3] : 0;
  return pt;
}

function dist3(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    ((Number(a.x) || 0) - (Number(b.x) || 0)) ** 2 +
    ((Number(a.y) || 0) - (Number(b.y) || 0)) ** 2 +
    ((Number(a.z) || 0) - (Number(b.z) || 0)) ** 2
  );
}

function isBranchComponent(type) {
  const t = String(type || '').toUpperCase();
  return t === 'TEE' || t === 'OLET' || t.includes('TEE') || t.includes('OLET');
}

function chooseMainAndBranch(type, endPoints, explicitBp, cp) {
  const points = Array.isArray(endPoints) ? endPoints.filter(Boolean) : [];
  const branchType = isBranchComponent(type);

  if (!branchType) {
    return {
      ep1: points[0] || null,
      ep2: points[1] || null,
      bp: explicitBp || null,
    };
  }

  if (explicitBp) {
    return {
      ep1: points[0] || null,
      ep2: points[1] || null,
      bp: explicitBp,
    };
  }

  // PCF branch components often use 3 END-POINT rows instead of explicit BRANCH1-POINT.
  // Treat the farthest pair as the main run and the remaining point as the branch.
  if (points.length >= 3) {
    let best = { i: 0, j: 1, d: -1 };

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const d = dist3(points[i], points[j]);
        if (d > best.d) best = { i, j, d };
      }
    }

    const branch = points.find((_, idx) => idx !== best.i && idx !== best.j) || null;

    return {
      ep1: points[best.i] || null,
      ep2: points[best.j] || null,
      bp: branch ? { ...branch, bore: Number.isFinite(Number(branch.bore)) ? Number(branch.bore) : 0 } : null,
    };
  }

  if (String(type || '').toUpperCase().includes('OLET') && cp && points.length >= 1) {
    let branch = points[0];
    let bestD = dist3(cp, branch);

    for (const point of points) {
      const d = dist3(cp, point);
      if (d > bestD) {
        branch = point;
        bestD = d;
      }
    }

    const main = points.filter((point) => point !== branch);

    return {
      ep1: main[0] || points[0] || null,
      ep2: main[1] || points[1] || null,
      bp: branch ? { ...branch, bore: Number.isFinite(Number(branch.bore)) ? Number(branch.bore) : 0 } : null,
    };
  }

  return {
    ep1: points[0] || null,
    ep2: points[1] || null,
    bp: null,
  };
}

function normalizeBlock(block, log, idx) {
  const comp = {
    id: `comp_${idx}`,
    type: block.type,
    raw: block.rawAttrs,     // raw key-value pairs from splitPcfBlocks
    attributes: {},          // clean non-geometry attributes (excludes END-POINT/CO-ORDS etc.)
    ep1: null,
    ep2: null,
    coOrds: null,            // support placement coordinate — separate from pipe endpoints
    cp: null,                // CENTRE-POINT (elbows, bends)
    bp: null,                // BRANCH1-POINT (tees, olets)
    bore: 0,
  };

  const endPoints = [];

  // Skip block.lines[0] — it is the type keyword itself
  for (const line of block.lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('END-POINT')) {
      const pt = parsePoint(trimmed.replace(/^END-POINT\s*/, ''), true);
      if (pt) endPoints.push(pt);

    } else if (trimmed.startsWith('CO-ORDS')) {
      // Support placement — NOT a pipe endpoint
      const pt = parsePoint(trimmed.replace(/^CO-ORDS\s*/, ''), true);
      if (pt) comp.coOrds = pt;

    } else if (/^(CENTRE-POINT|CENTER-POINT)\b/.test(trimmed)) {
      const pt = parsePoint(trimmed.replace(/^(CENTRE-POINT|CENTER-POINT)\s*/, ''), false);
      if (pt) comp.cp = { x: pt.x, y: pt.y, z: pt.z };

    } else if (/^(BRANCH1-POINT|BRANCH-POINT|BRANCH_POINT|BRANCH1_POINT)\b/.test(trimmed)) {
      const pt = parsePoint(trimmed.replace(/^(BRANCH1-POINT|BRANCH-POINT|BRANCH_POINT|BRANCH1_POINT)\s*/, ''), true);
      if (pt) comp.bp = { x: pt.x, y: pt.y, z: pt.z, bore: pt.bore || 0 };

    } else {
      // Attribute line — support both plain keys and angle-bracket keys like <SUPPORT_NAME>
      const kv = trimmed.match(/^(<[^>]+>|[A-Z][A-Z0-9_\-]*)\s+(.*)/);
      if (kv) {
        comp.attributes[kv[1]] = kv[2].trim();
      } else {
        const single = trimmed.match(/^(<[^>]+>|[A-Z][A-Z0-9_\-]*)$/);
        if (single) comp.attributes[single[1]] = '';
      }
    }
  }

  const branchGeom = chooseMainAndBranch(block.type, endPoints, comp.bp, comp.cp);
  comp.ep1 = branchGeom.ep1;
  comp.ep2 = branchGeom.ep2;
  comp.bp = branchGeom.bp;
  comp.bore = (comp.ep1 && Number.isFinite(comp.ep1.bore)) ? comp.ep1.bore : 0;

  // MESSAGE-CIRCLE: circleCoord from CO-ORDS, text from TEXT attribute
  if (block.type === 'MESSAGE-CIRCLE') {
    const co = comp.coOrds;
    comp.circleCoord = co ? { x: co.x, y: co.y, z: co.z } : null;
    comp.circleText = comp.attributes['TEXT'] || '';
  }

  // MESSAGE-SQUARE: annotation text is the first non-blank content line
  if (block.type === 'MESSAGE-SQUARE') {
    const textLine = block.lines.slice(1).find(l => l.trim());
    if (textLine) comp.squareText = textLine.trim();
  }

  return comp;
}

export function normalizePcfModel(parsed, log) {
  const components = [];

  parsed.blocks.forEach((block, idx) => {
    const comp = normalizeBlock(block, log, idx);
    if (comp) components.push(comp);
  });

  // Post-process MESSAGE-SQUARE: assign squarePos from the next real component's ep1
  for (let i = 0; i < components.length; i++) {
    if (components[i].type === 'MESSAGE-SQUARE' && components[i].squareText) {
      for (let j = i + 1; j < components.length; j++) {
        const next = components[j];
        if (next.type !== 'MESSAGE-SQUARE' && next.type !== 'MESSAGE-CIRCLE') {
          const pt = next.ep1 || next.ep2 || next.coOrds;
          if (pt) components[i].squarePos = { x: pt.x, y: pt.y, z: pt.z };
          break;
        }
      }
    }
  }

  return {
    meta: parsed.meta,
    components,
  };
}
