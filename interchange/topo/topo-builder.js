/**
 * topo-builder.js
 * Unified Topo Builder for REV/JSON/XML import into canonical preview.
 *
 * Contract: TopoGraph
 * - nodes: [{ id, position, sourceRefs }]
 * - segments: [{ id, fromNodeId, toNodeId, normalized, rawAttributes, sourceRefs }]
 * - components: [{ id, type, anchorNodeIds, normalized, rawAttributes, sourceRefs }]
 * - anchors: [{ componentId, ep1NodeId, ep2NodeId, cpNodeId, bpNodeId }]
 * - sourceRefs: aggregated source references
 */

import { CanonicalProject } from '../canonical/CanonicalProject.js';
import { CanonicalAssembly } from '../canonical/CanonicalAssembly.js';
import { CanonicalNode } from '../canonical/CanonicalNode.js';
import { CanonicalSegment } from '../canonical/CanonicalSegment.js';
import { CanonicalComponent } from '../canonical/CanonicalComponent.js';
import { FidelityClass } from '../canonical/FidelityClass.js';
import { getConversionConfig } from '../config/conversion-config-store.js';
import { cloneDefaultTopoProfile } from './topo-mapping-profiles.js';
import { getSupportMappingConfig } from '../support/support-mapping-store.js';
import { withAliasedKeys, renderTemplate } from './template-evaluator.js';
import { buildSupportSpecs } from '../support/support-builder.js';

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = toFiniteNumber(value.x);
  const y = toFiniteNumber(value.y);
  const z = toFiniteNumber(value.z);
  if (x === null || y === null || z === null) return null;
  const point = { x, y, z };
  const bore = toFiniteNumber(value.bore);
  if (bore !== null) point.bore = bore;
  return point;
}

function distance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function bucketRegistry(toleranceMm) {
  const tolerance = Math.max(toFiniteNumber(toleranceMm, 0.5), 0.0001);
  const buckets = new Map();
  const nodes = [];
  let counter = 1;

  function toBucket(value) {
    return Math.round(value / tolerance);
  }

  function bucketKey(ix, iy, iz) {
    return `${ix}|${iy}|${iz}`;
  }

  function pointBucket(point) {
    return {
      ix: toBucket(point.x),
      iy: toBucket(point.y),
      iz: toBucket(point.z),
    };
  }

  function nearCandidates(point) {
    const b = pointBucket(point);
    const out = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const key = bucketKey(b.ix + dx, b.iy + dy, b.iz + dz);
          const list = buckets.get(key);
          if (list && list.length) out.push(...list);
        }
      }
    }
    return out;
  }

  function register(point, assemblyId, sourceRef) {
    const candidates = nearCandidates(point);
    let nearest = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const node of candidates) {
      const d = distance(node.position, point);
      if (d <= tolerance && d < nearestDist) {
        nearest = node;
        nearestDist = d;
      }
    }
    if (nearest) {
      if (sourceRef) nearest.sourceRefs.push(sourceRef);
      return nearest;
    }

    const node = new CanonicalNode({
      id: `N-${counter++}`,
      assemblyId,
      position: { x: point.x, y: point.y, z: point.z },
      sourceRefs: sourceRef ? [sourceRef] : [],
      metadata: {},
    });
    const b = pointBucket(point);
    const key = bucketKey(b.ix, b.iy, b.iz);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
    nodes.push(node);
    return node;
  }

  function findNearest(point) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const d = distance(node.position, point);
      if (d < bestDistance) {
        bestDistance = d;
        best = node;
      }
    }
    return best ? { node: best, distance: bestDistance } : null;
  }

  return {
    register,
    all: () => nodes,
    findNearest,
    tolerance,
  };
}

function buildAdjacency(segments) {
  const adj = new Map();
  for (const segment of segments || []) {
    const fromRef = String(segment?.fromRef || '').trim();
    const toRef = String(segment?.toRef || '').trim();
    const dx = toFiniteNumber(segment?.dx);
    const dy = toFiniteNumber(segment?.dy);
    const dz = toFiniteNumber(segment?.dz);
    if (!fromRef || !toRef) continue;
    if (dx === null || dy === null || dz === null) continue;

    if (!adj.has(fromRef)) adj.set(fromRef, []);
    if (!adj.has(toRef)) adj.set(toRef, []);

    adj.get(fromRef).push({ to: toRef, dx, dy, dz });
    adj.get(toRef).push({ to: fromRef, dx: -dx, dy: -dy, dz: -dz });
  }
  return adj;
}

function solveRelativeNodePositions(segments, tolerance, diagnostics) {
  const adjacency = buildAdjacency(segments);
  const solved = new Map();

  for (const startNode of adjacency.keys()) {
    if (solved.has(startNode)) continue;
    solved.set(startNode, { x: 0, y: 0, z: 0 });
    const queue = [startNode];

    while (queue.length) {
      const current = queue.shift();
      const origin = solved.get(current);
      const edges = adjacency.get(current) || [];
      for (const edge of edges) {
        const candidate = {
          x: origin.x + edge.dx,
          y: origin.y + edge.dy,
          z: origin.z + edge.dz,
        };
        if (!solved.has(edge.to)) {
          solved.set(edge.to, candidate);
          queue.push(edge.to);
          continue;
        }
        const previous = solved.get(edge.to);
        if (distance(previous, candidate) > tolerance) {
          diagnostics.warn('TOPO_NODE_MERGE_CONFLICT', 'Node merge conflict detected while solving relative positions.', {
            nodeRef: edge.to,
            previous,
            candidate,
            tolerance,
          });
        }
      }
    }
  }

  return solved;
}

function calcGraphRole(degA, degB) {
  const maxDeg = Math.max(degA, degB);
  const minDeg = Math.min(degA, degB);
  if (maxDeg >= 3 && minDeg <= 1) return 'BRANCH_OFF';
  if (minDeg <= 1) return 'DEADLEG';
  return 'RUN';
}

function computeDerived(ep1, ep2, cp, bp) {
  const dx = ep2.x - ep1.x;
  const dy = ep2.y - ep1.y;
  const dz = ep2.z - ep1.z;
  const length = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
  const derived = { dx, dy, dz, length };
  if (cp) derived.bendCp = { x: cp.x, y: cp.y, z: cp.z };
  if (bp) {
    derived.teeCp = { x: bp.x, y: bp.y, z: bp.z };
    const bdx = bp.x - ep1.x;
    const bdy = bp.y - ep1.y;
    const bdz = bp.z - ep1.z;
    derived.branchLength = Math.sqrt((bdx * bdx) + (bdy * bdy) + (bdz * bdz));
  }
  return derived;
}

function normalizeSeqNo(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}


function deepMerge(left, right) {
  if (!left || typeof left !== 'object' || Array.isArray(left)) return right ?? left;
  if (!right || typeof right !== 'object' || Array.isArray(right)) return right ?? left;
  const out = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const current = out[key];
    if (current && typeof current === 'object' && !Array.isArray(current) && value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function resolveFormatProfile(format, profileOverride) {
  const base = cloneDefaultTopoProfile(format);
  const cfg = getSupportMappingConfig();
  const cfgProfile = cfg?.formats?.[String(format || '').toUpperCase()]?.topoMappingProfile || {};
  const withCfg = deepMerge(base, cfgProfile);
  if (!profileOverride || typeof profileOverride !== 'object') return withCfg;
  return deepMerge(withCfg, profileOverride);
}
function applyComponentMapping(format, profile, source, raw, index) {
  const context = {
    source: {
      id: source?.id,
      index,
      type: source?.type,
      path: source?.path,
    },
    raw,
    geometry: {
      ep1: source?.ep1,
      ep2: source?.ep2,
      cp: source?.cp,
      bp: source?.bp,
      supportCoord: source?.supportCoord,
    },
  };

  const componentProfile = profile?.component || {};
  const id = renderTemplate(componentProfile.idTemplate || '{{source.id || source.index}}', context);
  const refNo = renderTemplate(componentProfile.refNoTemplate || '{{source.id || source.index}}', context);
  const seqNoRaw = renderTemplate(componentProfile.seqNoTemplate || '{{source.index}}', context);
  const pipelineRef = renderTemplate(componentProfile.pipelineRefTemplate || '{{raw.PIPELINE_REFERENCE || ""}}', context);
  const lineNoKey = renderTemplate(componentProfile.lineNoKeyTemplate || '{{raw.LINE_NO || raw.PIPELINE_REFERENCE || ""}}', context);
  const sKey = renderTemplate(componentProfile.sKeyTemplate || '{{raw.SKEY || source.type || "PIPE"}}', context);

  return {
    id,
    refNo,
    seqNo: normalizeSeqNo(seqNoRaw, (index + 1) * 10),
    pipelineRef,
    lineNoKey,
    sKey,
    format,
  };
}

function buildSourceRefs(segment, index, format) {
  if (Array.isArray(segment?.sourceRefs) && segment.sourceRefs.length) return segment.sourceRefs;
  return [{ format, sourceId: `ITEM:${index + 1}` }];
}

export function buildCanonicalProjectFromTopoSource({
  sourceRecord,
  topoInput,
  format,
  profileOverride,
}) {
  const conversionConfig = getConversionConfig();
  const profile = resolveFormatProfile(format, profileOverride);
  const tolerance = Math.max(toFiniteNumber(conversionConfig?.topology?.nodeMergeToleranceMm, 0.5), 0.0001);

  const project = new CanonicalProject({
    id: `project-${sourceRecord?.id || Date.now()}`,
    name: sourceRecord?.name || 'Topo Project',
    metadata: {
      format: String(format || '').toUpperCase(),
      dialect: sourceRecord?.dialect || 'TOPO',
      sourceName: sourceRecord?.name || '',
      units: conversionConfig?.profile?.units || 'mm',
    },
  });
  project.addSourceFile(sourceRecord);

  const assembly = new CanonicalAssembly({
    id: 'ASM-1',
    name: sourceRecord?.name ? `${sourceRecord.name} Assembly` : 'Assembly 1',
    placement: { x: 0, y: 0, z: 0 },
    sourceRefs: [{ format: String(format || '').toUpperCase(), sourceId: sourceRecord?.id || 'source' }],
  });

  project.nodes = [];
  project.segments = [];
  project.components = [];
  project.supports = [];
  project.annotations = [];

  const topoGraph = {
    nodes: [],
    segments: [],
    components: [],
    anchors: [],
    sourceRefs: [],
  };

  const segments = Array.isArray(topoInput?.segments) ? topoInput.segments : [];
  const supports = Array.isArray(topoInput?.supports) ? topoInput.supports : [];
  const annotations = Array.isArray(topoInput?.annotations) ? topoInput.annotations : [];

  const solvedRefs = solveRelativeNodePositions(segments, tolerance, project.diagnostics);
  const nodeRegistry = bucketRegistry(tolerance);

  const degreesByNodeId = new Map();
  const registerDegree = (nodeId) => degreesByNodeId.set(nodeId, (degreesByNodeId.get(nodeId) || 0) + 1);

  let segmentCounter = 1;
  let componentCounter = 1;

  for (let index = 0; index < segments.length; index += 1) {
    const sourceSegment = segments[index];
    const raw = withAliasedKeys(sourceSegment?.rawAttributes || {});
    const typeUpper = String(sourceSegment?.type || 'PIPE').toUpperCase();
    const isTeeType = typeUpper === 'TEE';
    const isOletType = typeUpper === 'OLET' || typeUpper === 'WELDOLET' || typeUpper === 'SOCKOLET';

    // Extract cp/bp early — they influence ep1/ep2 resolution for TEE and OLET types.
    const cp = toPoint(sourceSegment?.cp);
    const bp = toPoint(sourceSegment?.bp);

    let ep1 = toPoint(sourceSegment?.ep1);
    let ep2 = toPoint(sourceSegment?.ep2);

    if (!ep1 && sourceSegment?.fromRef) {
      ep1 = toPoint(solvedRefs.get(String(sourceSegment.fromRef)));
    }
    if (!ep2 && sourceSegment?.toRef) {
      ep2 = toPoint(solvedRefs.get(String(sourceSegment.toRef)));
    }

    // For OLET types, cp (header tap onto the header pipe) and bp (branch outlet) are
    // the semantic connectivity endpoints. Override ep1/ep2 so the topology graph uses
    // the correct junction points rather than generic PCF end-point fields.
    if (isOletType) {
      if (cp) ep1 = { x: cp.x, y: cp.y, z: cp.z };
      if (bp) ep2 = { x: bp.x, y: bp.y, z: bp.z };
    }

    if (!ep1 || !ep2) {
      project.diagnostics.warn('TOPO_COMPONENT_MISSING_ENDPOINTS', 'Segment skipped because endpoints could not be resolved.', {
        sourceId: sourceSegment?.id || null,
        fromRef: sourceSegment?.fromRef || null,
        toRef: sourceSegment?.toRef || null,
      });
      continue;
    }

    const sourceRefs = buildSourceRefs(sourceSegment, index, String(format || '').toUpperCase());
    const map = applyComponentMapping(format, profile, sourceSegment, raw, index);

    const fromNode = nodeRegistry.register(ep1, assembly.id, sourceRefs[0]);
    const toNode = nodeRegistry.register(ep2, assembly.id, sourceRefs[0]);
    registerDegree(fromNode.id);
    registerDegree(toNode.id);

    // For TEE components, bp is the third connection port (branch outlet).
    // Register it as an independent topology node so branch pipes can connect to it.
    let bpNode = null;
    if (isTeeType) {
      if (bp) {
        bpNode = nodeRegistry.register(bp, assembly.id, sourceRefs[0]);
        registerDegree(bpNode.id);
      } else {
        project.diagnostics.warn('TOPO_TEE_BRANCH_MISSING',
          'TEE component has no branch point (bp); branch connectivity cannot be established.',
          { sourceId: sourceSegment?.id || null });
      }
    }

    const derived = computeDerived(ep1, ep2, cp, bp);

    const segment = new CanonicalSegment({
      id: `SEG-${segmentCounter}`,
      assemblyId: assembly.id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      graphRole: 'RUN',
      nominalBore: toFiniteNumber(ep1?.bore),
      rawAttributes: raw,
      derivedAttributes: derived,
      normalized: {
        componentType: typeUpper,
        lineNoKey: map.lineNoKey,
        pipelineRef: map.pipelineRef,
        sKey: map.sKey,
        refNo: map.refNo,
        seqNo: map.seqNo,
      },
      lineRef: map.lineNoKey || map.pipelineRef || '',
      sourceRefs,
      fidelity: FidelityClass.NORMALIZED_LOSSLESS,
      metadata: {
        topologicalId: sourceSegment?.id || `segment-${index + 1}`,
      },
    });
    project.segments.push(segment);
    assembly.segmentIds.push(segment.id);

    const anchorNodeIds = [fromNode.id, toNode.id];
    if (bpNode) anchorNodeIds.push(bpNode.id);

    const component = new CanonicalComponent({
      id: `CMP-${componentCounter}`,
      assemblyId: assembly.id,
      type: typeUpper,
      anchorNodeIds,
      hostSegmentIds: [segment.id],
      rawAttributes: raw,
      derivedAttributes: derived,
      normalized: {
        id: map.id,
        lineNoKey: map.lineNoKey,
        pipelineRef: map.pipelineRef,
        sKey: map.sKey,
        refNo: map.refNo,
        seqNo: map.seqNo,
        ep1,
        ep2,
        cp: cp || null,
        bp: bp || null,
      },
      sourceRefs,
      fidelity: FidelityClass.NORMALIZED_LOSSLESS,
    });
    project.components.push(component);
    assembly.componentIds.push(component.id);

    topoGraph.segments.push({
      id: segment.id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      normalized: segment.normalized,
      rawAttributes: raw,
      sourceRefs,
    });
    topoGraph.components.push({
      id: component.id,
      type: component.type,
      anchorNodeIds: component.anchorNodeIds,
      normalized: component.normalized,
      rawAttributes: raw,
      sourceRefs,
    });
    topoGraph.anchors.push({
      componentId: component.id,
      ep1NodeId: fromNode.id,
      ep2NodeId: toNode.id,
      // For OLET: fromNode is at the cp (header-tap) position after the override above.
      // For TEE: bpNode is the registered branch node.
      cpNodeId: isOletType && cp ? fromNode.id : null,
      bpNodeId: bpNode ? bpNode.id : null,
    });
    topoGraph.sourceRefs.push(...sourceRefs);

    segmentCounter += 1;
    componentCounter += 1;
  }

  const nodes = nodeRegistry.all();
  for (const node of nodes) {
    node.connectedSegmentIds = [];
    node.branchDegree = degreesByNodeId.get(node.id) || 0;
    project.nodes.push(node);
    assembly.nodeIds.push(node.id);
    topoGraph.nodes.push({
      id: node.id,
      position: node.position,
      sourceRefs: node.sourceRefs,
    });
  }

  const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
  for (const segment of project.segments) {
    const from = nodeById.get(segment.fromNodeId);
    const to = nodeById.get(segment.toNodeId);
    if (from) from.connectedSegmentIds.push(segment.id);
    if (to) to.connectedSegmentIds.push(segment.id);
  }

  for (const node of project.nodes) {
    node.branchDegree = node.connectedSegmentIds.length;
  }

  for (const segment of project.segments) {
    const a = nodeById.get(segment.fromNodeId)?.branchDegree || 0;
    const b = nodeById.get(segment.toNodeId)?.branchDegree || 0;
    segment.graphRole = calcGraphRole(a, b);
  }

  const supportCandidates = [
    ...(supports || []),
    ...segments
      .filter((item) => String(item?.type || '').toUpperCase() === 'SUPPORT')
      .map((item, index) => ({
        ...item,
        id: item?.id || `segment-support-${index + 1}`,
      })),
  ];

  const supportBuild = buildSupportSpecs({
    format,
    supportCandidates,
    nodes: project.nodes,
    assemblyId: assembly.id,
    projectDiagnostics: project.diagnostics,
  });

  for (const support of supportBuild.supports) {
    project.supports.push(support);
    assembly.supportIds.push(support.id);
  }

  for (const annotation of annotations) {
    project.annotations.push(annotation);
    if (annotation?.id) assembly.annotationIds.push(annotation.id);
  }

  project.addAssembly(assembly);

  project.metadata.topoGraph = {
    nodeCount: topoGraph.nodes.length,
    segmentCount: topoGraph.segments.length,
    componentCount: topoGraph.components.length,
    anchorCount: topoGraph.anchors.length,
    sourceRefCount: topoGraph.sourceRefs.length,
  };
  project.metadata.supportSpecs = supportBuild.specs;
  project.metadata.summary = {
    assemblies: project.assemblies.length,
    nodes: project.nodes.length,
    segments: project.segments.length,
    components: project.components.length,
    supports: project.supports.length,
    annotations: project.annotations.length,
  };

  project.diagnostics.info('TOPO_BUILD_COMPLETE', 'Topo graph mapped to canonical preview project.', {
    format: String(format || '').toUpperCase(),
    summary: project.metadata.summary,
  });

  return {
    project,
    topoGraph,
    supportSpecs: supportBuild.specs,
  };
}

