/**
 * stp-support-parser.js
 * Parse STEP text into linear structural members for canvas rendering.
 *
 * Supported entities:
 * - CARTESIAN_POINT + POLYLINE
 * - CARTESIAN_POINT + DIRECTION + VECTOR + LINE
 *
 * Output is a list of members with explicit start/end coordinates.
 */

function _toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function _parseTriple(rawText) {
  const values = String(rawText || '').split(',').map((token) => _toFiniteNumber(token.trim()));
  if (values.length < 3 || values[0] === null || values[1] === null || values[2] === null) return null;
  return { x: values[0], y: values[1], z: values[2] };
}

function _decodeStepString(text) {
  return String(text || '').replace(/''/g, '\'');
}

function _kindFromLabel(label) {
  const token = String(label || '').split(':')[0].trim().toUpperCase();
  if (token === 'RST') return 'REST';
  if (token === 'GDE' || token === 'GUID') return 'GUIDE';
  if (token === 'STP' || token === 'STOP') return 'LINESTOP';
  if (token === 'ANC') return 'ANCHOR';
  if (token === 'SPR') return 'SPRING';
  if (['REST', 'GUIDE', 'LINESTOP', 'LIMIT', 'ANCHOR', 'SPRING'].includes(token)) return token;
  return '';
}

function _parsePointLine(line) {
  const match = String(line || '').match(/^#(\d+)\s*=\s*CARTESIAN_POINT\s*\(\s*'(?:''|[^'])*'\s*,\s*\(([^)]*)\)\s*\)\s*;/i);
  if (!match) return null;
  const point = _parseTriple(match[2]);
  if (!point) return null;
  return { id: Number(match[1]), point };
}

function _parseDirectionLine(line) {
  const match = String(line || '').match(/^#(\d+)\s*=\s*DIRECTION\s*\(\s*'(?:''|[^'])*'\s*,\s*\(([^)]*)\)\s*\)\s*;/i);
  if (!match) return null;
  const direction = _parseTriple(match[2]);
  if (!direction) return null;
  return { id: Number(match[1]), direction };
}

function _parseVectorLine(line) {
  const match = String(line || '').match(/^#(\d+)\s*=\s*VECTOR\s*\(\s*'(?:''|[^'])*'\s*,\s*#(\d+)\s*,\s*([^)]+)\)\s*;/i);
  if (!match) return null;
  const directionId = Number(match[2]);
  const magnitude = _toFiniteNumber(match[3].trim());
  if (!Number.isFinite(directionId) || magnitude === null) return null;
  return { id: Number(match[1]), directionId, magnitude };
}

function _parsePolylineLine(line) {
  const match = String(line || '').match(/^#(\d+)\s*=\s*POLYLINE\s*\(\s*'((?:''|[^'])*)'\s*,\s*\(([^)]*)\)\s*\)\s*;/i);
  if (!match) return null;
  const pointIds = String(match[3] || '')
    .split(',')
    .map((token) => {
      const normalized = token.trim().replace(/^#/, '');
      const id = Number(normalized);
      return Number.isFinite(id) ? id : null;
    })
    .filter((id) => id !== null);
  if (pointIds.length < 2) return null;
  return {
    id: Number(match[1]),
    name: _decodeStepString(match[2]),
    pointIds,
  };
}

function _parseLineEntity(line) {
  const match = String(line || '').match(/^#(\d+)\s*=\s*LINE\s*\(\s*'((?:''|[^'])*)'\s*,\s*#(\d+)\s*,\s*#(\d+)\s*\)\s*;/i);
  if (!match) return null;
  return {
    id: Number(match[1]),
    name: _decodeStepString(match[2]),
    startPointId: Number(match[3]),
    vectorId: Number(match[4]),
  };
}

function _buildMemberFromVectorLine(lineEntity, pointsById, vectorsById, directionsById) {
  const start = pointsById.get(lineEntity.startPointId);
  if (!start) return null;
  const vector = vectorsById.get(lineEntity.vectorId);
  if (!vector) return null;
  const direction = directionsById.get(vector.directionId);
  if (!direction) return null;

  const length = Math.sqrt((direction.x * direction.x) + (direction.y * direction.y) + (direction.z * direction.z));
  if (length < 1e-9) return null;

  const unit = {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };

  return {
    sourceEntityType: 'LINE',
    sourceEntityId: lineEntity.id,
    label: lineEntity.name || `LINE-${lineEntity.id}`,
    kind: _kindFromLabel(lineEntity.name),
    start: { x: start.x, y: start.y, z: start.z },
    end: {
      x: start.x + (unit.x * vector.magnitude),
      y: start.y + (unit.y * vector.magnitude),
      z: start.z + (unit.z * vector.magnitude),
    },
  };
}

function _buildMembersFromPolyline(polyline, pointsById) {
  const members = [];
  for (let index = 0; index + 1 < polyline.pointIds.length; index += 1) {
    const start = pointsById.get(polyline.pointIds[index]);
    const end = pointsById.get(polyline.pointIds[index + 1]);
    if (!start || !end) continue;
    const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-6) continue;
    members.push({
      sourceEntityType: 'POLYLINE',
      sourceEntityId: polyline.id,
      label: polyline.name || `POLYLINE-${polyline.id}`,
      kind: _kindFromLabel(polyline.name),
      segmentIndex: index,
      start: { x: start.x, y: start.y, z: start.z },
      end: { x: end.x, y: end.y, z: end.z },
    });
  }
  return members;
}

/**
 * Parse STEP text into linear members for rendering.
 * @param {string} stepText
 * @returns {{members: object[], stats: object}}
 */
export function parseStpSupportMembers(stepText) {
  const text = String(stepText || '');
  const lines = text.split(/\r?\n/);

  const pointsById = new Map();
  const directionsById = new Map();
  const vectorsById = new Map();
  const polylines = [];
  const lineEntities = [];

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line.startsWith('#')) continue;

    const point = _parsePointLine(line);
    if (point) {
      pointsById.set(point.id, point.point);
      continue;
    }

    const direction = _parseDirectionLine(line);
    if (direction) {
      directionsById.set(direction.id, direction.direction);
      continue;
    }

    const vector = _parseVectorLine(line);
    if (vector) {
      vectorsById.set(vector.id, { directionId: vector.directionId, magnitude: vector.magnitude });
      continue;
    }

    const polyline = _parsePolylineLine(line);
    if (polyline) {
      polylines.push(polyline);
      continue;
    }

    const lineEntity = _parseLineEntity(line);
    if (lineEntity) lineEntities.push(lineEntity);
  }

  const members = [];
  let skipped = 0;

  for (const polyline of polylines) {
    const segments = _buildMembersFromPolyline(polyline, pointsById);
    if (!segments.length) {
      skipped += 1;
      continue;
    }
    members.push(...segments);
  }

  for (const lineEntity of lineEntities) {
    const member = _buildMemberFromVectorLine(lineEntity, pointsById, vectorsById, directionsById);
    if (!member) {
      skipped += 1;
      continue;
    }
    members.push(member);
  }

  if (!members.length) {
    throw new Error('STEP parsing produced no linear members. Expected POLYLINE or LINE entities with coordinate references.');
  }

  return {
    members,
    stats: {
      pointCount: pointsById.size,
      polylineCount: polylines.length,
      lineCount: lineEntities.length,
      memberCount: members.length,
      skippedEntityCount: skipped,
    },
  };
}
