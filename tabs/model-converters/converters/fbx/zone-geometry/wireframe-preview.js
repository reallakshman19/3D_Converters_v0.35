import { transformPoint } from '../transform-policy.js';
import { compareDecimalId, compareOccurrenceId } from './compare.js';

export const FBX_ZONE_WIREFRAME_ADAPTER = 'FbxZoneGeometryWireframePreview.v1';
export const FBX_ZONE_WIREFRAME_SEGMENT_LIMIT = 250000;

function viewFor(selection, role, Type) {
  const item = selection?.buffers.find((buffer) => buffer.role === role);
  const bytes = item?.buffer?.bytes;
  if (!(bytes instanceof ArrayBuffer)) throw new TypeError(`Missing ${role} topology buffer.`);
  return new Type(bytes);
}

function topology(selection) {
  return {
    points: viewFor(selection, 'control-points-mm', Float64Array),
    offsets: viewFor(selection, 'polygon-offsets', Uint32Array),
    indices: viewFor(selection, 'polygon-vertex-indices', Uint32Array),
  };
}

function edgeCount(offsets) {
  let count = 0;
  for (let polygon = 0; polygon + 1 < offsets.length; polygon += 1) {
    const size = offsets[polygon + 1] - offsets[polygon];
    count += size === 2 ? 1 : size >= 3 ? size : 0;
  }
  return count;
}

function selectedItems(scope, selections) {
  const byGeometry = new Map(selections.map((item) => [item.geometry.geometryObjectId, item]));
  const items = [];
  const occurrences = [...scope.selectedOccurrences].sort((left, right) => (
    compareOccurrenceId(left.sourceOccurrenceId, right.sourceOccurrenceId)
  ));
  for (const occurrence of occurrences) {
    const ids = [...new Set(occurrence.geometryObjectIds)]
      .filter((id) => byGeometry.has(id)).sort(compareDecimalId);
    for (const geometryId of ids) items.push({ occurrence, selection: byGeometry.get(geometryId) });
  }
  return items;
}

function pointAt(points, index, matrix) {
  const offset = index * 3;
  const point = transformPoint(matrix, [points[offset], points[offset + 1], points[offset + 2]]);
  return { x: point[0], y: point[1], z: point[2] };
}

function emitEdge(context, leftIndex, rightIndex) {
  const ordinal = context.ordinal;
  context.ordinal += 1;
  if (ordinal % context.stride !== 0 || context.members.length >= context.limit) return;
  context.members.push({
    start: pointAt(context.points, leftIndex, context.matrix),
    end: pointAt(context.points, rightIndex, context.matrix),
  });
}

function emitTopologyEdges(item, context) {
  const current = topology(item.selection);
  context.points = current.points;
  context.matrix = item.occurrence.geometryMatrixMm;
  for (let polygon = 0; polygon + 1 < current.offsets.length; polygon += 1) {
    const start = current.offsets[polygon], end = current.offsets[polygon + 1], size = end - start;
    if (size === 2) emitEdge(context, current.indices[start], current.indices[start + 1]);
    else if (size >= 3) for (let index = start; index < end; index += 1) {
      const next = index + 1 < end ? index + 1 : start;
      emitEdge(context, current.indices[index], current.indices[next]);
    }
  }
}

export function buildFbxZoneWireframeData({
  scope, selections, maxSegments = FBX_ZONE_WIREFRAME_SEGMENT_LIMIT,
}) {
  if (!Number.isSafeInteger(maxSegments) || maxSegments < 1) {
    throw new TypeError('FBX zone wireframe maxSegments must be a positive integer.');
  }
  const items = selectedItems(scope, selections);
  const sourceSegmentCount = items.reduce((sum, item) => (
    sum + edgeCount(topology(item.selection).offsets)
  ), 0);
  const stride = Math.max(1, Math.ceil(sourceSegmentCount / maxSegments));
  const context = { limit: maxSegments, matrix: null, members: [], ordinal: 0, points: null, stride };
  for (const item of items) emitTopologyEdges(item, context);
  return Object.freeze({
    adapter: FBX_ZONE_WIREFRAME_ADAPTER,
    members: Object.freeze(context.members),
    sourceSegmentCount,
    displayedSegmentCount: context.members.length,
    segmentStride: stride,
    truncated: context.members.length < sourceSegmentCount,
  });
}

function countText(displayed, source) {
  return displayed === source ? `${displayed}` : `${displayed} of ${source}`;
}

export function buildFbxZoneWireframeMetaText(project, wireframe) {
  const source = project?.previewSourceName || 'FBX source graph';
  const zone = project?.selectedZoneLabel || 'Selected zone';
  const zones = Array.isArray(project?.previewZones) ? project.previewZones.length : 0;
  const points = Number(project?.displayedPointCount ?? project?.points?.length ?? 0);
  const segments = countText(wireframe.displayedSegmentCount, wireframe.sourceSegmentCount);
  return `Preview source: ${source} | adapter: ${wireframe.adapter} | zone: ${zone} | zones: ${zones} | points: ${points} | segments: ${segments} | nodes: 0 | supports: 0 | annotations: 0`;
}
