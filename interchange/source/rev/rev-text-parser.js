/**
 * rev-text-parser.js
 * Lightweight REV parser for Model Exchange topology preview.
 *
 * Parses chunk stream with focus on PRIM box-like geometry and group hierarchy.
 */

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseNumbers(line, expectedCount) {
  const values = String(line || '')
    .trim()
    .split(/\s+/)
    .map((token) => Number(token))
    .filter((n) => Number.isFinite(n));
  if (values.length < expectedCount) {
    throw new Error(`REV numeric row expected ${expectedCount} values, got ${values.length}.`);
  }
  return values.slice(0, expectedCount);
}

function transformPoint(matrix, point) {
  const r0 = matrix[0];
  const r1 = matrix[1];
  const r2 = matrix[2];
  return {
    x: (r0[0] * point.x) + (r0[1] * point.y) + (r0[2] * point.z) + r0[3],
    y: (r1[0] * point.x) + (r1[1] * point.y) + (r1[2] * point.z) + r1[3],
    z: (r2[0] * point.x) + (r2[1] * point.y) + (r2[2] * point.z) + r2[3],
  };
}

function choosePrimaryAxis(dimensions) {
  const axes = [0, 1, 2];
  axes.sort((a, b) => dimensions[b] - dimensions[a]);
  return axes[0];
}

function endpointsFromBox(matrix, bboxMin, bboxMax) {
  const cx = (bboxMin[0] + bboxMax[0]) / 2;
  const cy = (bboxMin[1] + bboxMax[1]) / 2;
  const cz = (bboxMin[2] + bboxMax[2]) / 2;
  const dims = [
    Math.abs(bboxMax[0] - bboxMin[0]),
    Math.abs(bboxMax[1] - bboxMin[1]),
    Math.abs(bboxMax[2] - bboxMin[2]),
  ];
  const primaryAxis = choosePrimaryAxis(dims);

  const pA = { x: cx, y: cy, z: cz };
  const pB = { x: cx, y: cy, z: cz };

  if (primaryAxis === 0) {
    pA.x = bboxMin[0];
    pB.x = bboxMax[0];
  } else if (primaryAxis === 1) {
    pA.y = bboxMin[1];
    pB.y = bboxMax[1];
  } else {
    pA.z = bboxMin[2];
    pB.z = bboxMax[2];
  }

  return {
    ep1: transformPoint(matrix, pA),
    ep2: transformPoint(matrix, pB),
    dims,
    primaryAxis,
    center: transformPoint(matrix, { x: cx, y: cy, z: cz }),
  };
}

function isChunkToken(token) {
  return /^(HEAD|MODL|CNTB|CNTE|PRIM|OBST|INSU|END:)/.test(String(token || '').trim());
}

export function parseRevToTopoInput(revText) {
  const lines = String(revText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const segments = [];
  const supports = [];
  const messages = [];
  const groupStack = [];

  let idx = 0;
  while (idx < lines.length) {
    const chunk = String(lines[idx] || '').trim();
    idx += 1;
    if (!chunk) continue;

    if (chunk === 'HEAD') {
      idx += 4;
      continue;
    }
    if (chunk === 'MODL') {
      idx += 1;
      continue;
    }
    if (chunk === 'CNTB') {
      const group = String(lines[idx] || '').trim();
      idx += 1;
      groupStack.push(group);
      continue;
    }
    if (chunk === 'CNTE') {
      idx += 1;
      if (groupStack.length) groupStack.pop();
      continue;
    }

    if (chunk === 'PRIM' || chunk === 'OBST' || chunk === 'INSU') {
      try {
        const kind = String(lines[idx] || '').trim();
        idx += 1;

        const r0 = parseNumbers(lines[idx], 4); idx += 1;
        const r1 = parseNumbers(lines[idx], 4); idx += 1;
        const r2 = parseNumbers(lines[idx], 4); idx += 1;
        const bboxMin = parseNumbers(lines[idx], 3); idx += 1;
        const bboxMax = parseNumbers(lines[idx], 3); idx += 1;

        // Skip payload/facets until next chunk token.
        while (idx < lines.length && !isChunkToken(lines[idx])) idx += 1;

        const matrix = [r0, r1, r2];
        const geom = endpointsFromBox(matrix, bboxMin, bboxMax);
        const groupPath = groupStack.join('/');
        const isSupport = /PIPESUPP|SUPPORT/i.test(groupPath);

        const rawAttributes = {
          chunk,
          kind,
          groupPath,
          DIM_X: toFiniteNumber(geom.dims[0]),
          DIM_Y: toFiniteNumber(geom.dims[1]),
          DIM_Z: toFiniteNumber(geom.dims[2]),
          SKEY: isSupport ? 'SUPPORT' : 'PIPE',
          ITEM_CODE: kind,
        };

        const item = {
          id: `REV-${segments.length + supports.length + 1}`,
          type: isSupport ? 'SUPPORT' : 'PIPE',
          ep1: geom.ep1,
          ep2: geom.ep2,
          cp: null,
          bp: null,
          supportCoord: geom.center,
          rawAttributes,
          sourceRefs: [{ format: 'REV', sourceId: `PRIM:${segments.length + supports.length + 1}` }],
          path: groupPath,
        };

        if (isSupport) supports.push(item);
        else segments.push(item);
      } catch (error) {
        messages.push({ level: 'WARN', message: `REV primitive parse warning at line ${idx}: ${error.message}` });
      }
      continue;
    }

    if (chunk.startsWith('END:')) break;
  }

  return {
    format: 'REV',
    segments,
    supports,
    annotations: [],
    messages,
  };
}
