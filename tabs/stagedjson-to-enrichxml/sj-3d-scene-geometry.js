/**
 * Functionality: projects staged component records into explicit 3-D markers
 * and source-owned spans. Inputs: parsed component records. Outputs: nodes and
 * APOS-to-LPOS segments. Fallback: records without coordinates are omitted;
 * supports and zero-length components remain markers only.
 */

import { arrivePosition, bestPosition, distance, leavePosition } from './sj-point-resolver.js';

function sceneNode(record, index, point) {
  return {
    id: `sj-node-${index + 1}`,
    name: record.name || 'UNNAMED',
    type: record.componentType || 'PIPE',
    branch: record.sourceBranchName || record.branchName || '/UNMAPPED',
    bore: record.boreMm,
    rating: record.resolved?.rating || '',
    x: point.x, y: point.y, z: point.z,
    record,
  };
}

function sceneSegment(record, index) {
  if (record.isSupport) return null;
  const start = arrivePosition(record.attrs), end = leavePosition(record.attrs);
  if (!start || !end || distance(start, end) <= 1e-6) return null;
  return {
    id: `sj-segment-${index + 1}`,
    branch: record.sourceBranchName || record.branchName || '/UNMAPPED',
    start, end, record,
  };
}

/** Build source-owned geometry without inventing consecutive-record links. */
export function buildStagedSceneGeometry(records) {
  const nodes = [], segments = [];
  records.forEach((record, index) => {
    const point = bestPosition(record.attrs);
    if (point) nodes.push(sceneNode(record, index, point));
    const segment = sceneSegment(record, index);
    if (segment) segments.push(segment);
  });
  return { nodes, segments };
}
