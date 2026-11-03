import { CanonicalProject } from '../../canonical/CanonicalProject.js';
import { CanonicalAssembly } from '../../canonical/CanonicalAssembly.js';
import { CanonicalNode } from '../../canonical/CanonicalNode.js';
import { CanonicalSegment } from '../../canonical/CanonicalSegment.js';
import { CanonicalComponent } from '../../canonical/CanonicalComponent.js';
import { CanonicalSupport } from '../../canonical/CanonicalSupport.js';
import { CanonicalAnnotation } from '../../canonical/CanonicalAnnotation.js';
import { FidelityClass } from '../../canonical/FidelityClass.js';
import { resolveKindPure } from '../../../support/SupportKindResolver.js';
import { getConversionConfig } from '../../config/conversion-config-store.js';
import { parsePcfText } from '../../../js/pcf2glb/pcf/parsePcfText.js';
import { normalizePcfModel } from '../../../js/pcf2glb/pcf/normalizePcfModel.js';

const ANNOTATION_TYPES = new Set(['MESSAGE-CIRCLE', 'MESSAGE-SQUARE']);
const SUPPORT_TYPES = new Set(['SUPPORT']);

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPoint(pointLike) {
  if (!pointLike || typeof pointLike !== 'object') return null;
  const x = toFiniteNumber(pointLike.x);
  const y = toFiniteNumber(pointLike.y);
  const z = toFiniteNumber(pointLike.z);
  if (x === null || y === null || z === null) return null;
  const point = { x, y, z };
  const bore = toFiniteNumber(pointLike.bore);
  if (bore !== null) point.bore = bore;
  return point;
}

function distance(pointA, pointB) {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  const dz = pointA.z - pointB.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function distanceSq(pointA, pointB) {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  const dz = pointA.z - pointB.z;
  return (dx * dx) + (dy * dy) + (dz * dz);
}

function pickFirstValue(raw = {}, keys = [], fallback = '') {
  for (const key of keys) {
    const value = raw?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return fallback;
}

function pickRefNo(raw, index, idConfig) {
  const direct = pickFirstValue(raw, ['CA97', 'COMPONENT-ATTRIBUTE97', 'REF-NO', 'REFNO'], '');
  if (direct) return direct;
  const prefix = String(idConfig?.refPrefix || 'PCFX-');
  return `${prefix}REF-${index + 1}`;
}

function pickSeqNo(raw, index, idConfig) {
  const directRaw = pickFirstValue(raw, ['CA98', 'COMPONENT-ATTRIBUTE98', 'SEQ-NO', 'SEQNO'], '');
  const direct = Number(directRaw);
  if (Number.isFinite(direct)) return direct;
  const seqStart = toFiniteNumber(idConfig?.seqStart, 10);
  const seqStep = toFiniteNumber(idConfig?.seqStep, 10);
  return seqStart + (index * seqStep);
}

function buildDerivedSegmentData(ep1, ep2, config) {
  const dx = ep2.x - ep1.x;
  const dy = ep2.y - ep1.y;
  const dz = ep2.z - ep1.z;
  const length = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
  return {
    dx,
    dy,
    dz,
    length,
    provenance: {
      formulaId: 'SEGMENT_VECTOR_V1',
      inputs: ['ep1', 'ep2'],
      tolerance: toFiniteNumber(config?.topology?.positionConflictWarnMm, 0.01),
      qualityFlag: 'SOURCE_ENDPOINTS',
      version: String(config?.derivation?.provenanceVersion || 'v1'),
    },
  };
}

function buildDerivedComponentData(componentType, ep1, ep2, cp, bp, config) {
  const derived = buildDerivedSegmentData(ep1, ep2, config);
  if (cp) {
    derived.bendCp = { x: cp.x, y: cp.y, z: cp.z };
    derived.bendCpSource = 'SOURCE';
  } else if (componentType === 'BEND' || componentType === 'ELBOW') {
    derived.bendCp = {
      x: (ep1.x + ep2.x) / 2,
      y: (ep1.y + ep2.y) / 2,
      z: (ep1.z + ep2.z) / 2,
    };
    derived.bendCpSource = 'GEOMETRIC_FALLBACK';
  }
  if (bp) {
    derived.teeCp = { x: bp.x, y: bp.y, z: bp.z };
    derived.branchLength = Math.sqrt(
      ((bp.x - ep1.x) ** 2) +
      ((bp.y - ep1.y) ** 2) +
      ((bp.z - ep1.z) ** 2)
    );
  }
  return derived;
}

function buildNodeRegistry(toleranceMm) {
  const bucketSize = Math.max(toFiniteNumber(toleranceMm, 0.5), 0.0001);
  const nodeById = new Map();
  const bucketMap = new Map();
  let nodeCounter = 1;

  function bucketCoord(value) {
    return Math.round(value / bucketSize);
  }

  function bucketKeyFromCoords(ix, iy, iz) {
    return `${ix}|${iy}|${iz}`;
  }

  function bucketKey(point) {
    return bucketKeyFromCoords(bucketCoord(point.x), bucketCoord(point.y), bucketCoord(point.z));
  }

  function getBucket(ix, iy, iz) {
    return bucketMap.get(bucketKeyFromCoords(ix, iy, iz)) || [];
  }

  function addToBucket(point, node) {
    const key = bucketKey(point);
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key).push(node);
  }

  function findExisting(point) {
    const ix = bucketCoord(point.x);
    const iy = bucketCoord(point.y);
    const iz = bucketCoord(point.z);
    let bestNode = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const maxDistanceSq = bucketSize * bucketSize;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const candidates = getBucket(ix + dx, iy + dy, iz + dz);
          for (const node of candidates) {
            const candidateDistanceSq = distanceSq(point, node.position);
            if (candidateDistanceSq <= maxDistanceSq && candidateDistanceSq < bestDistanceSq) {
              bestDistanceSq = candidateDistanceSq;
              bestNode = node;
            }
          }
        }
      }
    }
    return bestNode;
  }

  function register({ point, assemblyId, sourceRef }) {
    const existing = findExisting(point);
    if (existing) return existing;

    const node = new CanonicalNode({
      id: `N-${nodeCounter++}`,
      assemblyId,
      position: { x: point.x, y: point.y, z: point.z },
      sourceRefs: sourceRef ? [sourceRef] : [],
      metadata: {
        pointKey: `${point.x}|${point.y}|${point.z}`,
      },
    });
    node.connectedSegmentIds = [];
    node.branchDegree = 0;
    nodeById.set(node.id, node);
    addToBucket(point, node);
    return node;
  }

  function allNodes() {
    return Array.from(nodeById.values());
  }

  function findNearest(point) {
    let bestNode = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodeById.values()) {
      const nodeDistance = distance(point, node.position);
      if (nodeDistance < bestDistance) {
        bestDistance = nodeDistance;
        bestNode = node;
      }
    }
    return bestNode ? { node: bestNode, distance: bestDistance } : null;
  }

  return {
    register,
    allNodes,
    findNearest,
  };
}

function classifyGraphRole(fromDegree, toDegree) {
  const maxDegree = Math.max(fromDegree || 0, toDegree || 0);
  const minDegree = Math.min(fromDegree || 0, toDegree || 0);
  if (maxDegree >= 3 && minDegree <= 1) return 'BRANCH_OFF';
  if (minDegree <= 1) return 'DEADLEG';
  return 'RUN';
}

function resolveNormalizedModel(parsed, sourceRecord) {
  if (Array.isArray(parsed?.components)) return parsed;
  const rawText = String(parsed?.rawText || sourceRecord?.rawText || '');
  const parsedText = parsePcfText(rawText, null);
  return normalizePcfModel(parsedText, null);
}

export function buildPcfCanonicalProject({ sourceRecord, parsed }) {
  const config = getConversionConfig();
  const model = resolveNormalizedModel(parsed, sourceRecord);
  const components = Array.isArray(model?.components) ? model.components : [];
  const fieldMapping = config?.fieldMapping || {};
  const pipelineRefKeys = Array.isArray(fieldMapping.pipelineRefKeys) ? fieldMapping.pipelineRefKeys : ['PIPELINE-REFERENCE'];
  const lineNoKeys = Array.isArray(fieldMapping.lineNoKeys) ? fieldMapping.lineNoKeys : ['LINE-NO'];
  const sKeyKey = String(fieldMapping.skeyKey || 'SKEY');
  const supportAnchorTolerance = toFiniteNumber(config?.topology?.supportAnchorToleranceMm, 0.5);

  const project = new CanonicalProject({
    id: `project-${sourceRecord?.id || Date.now()}`,
    name: sourceRecord?.name || 'PCF Project',
    metadata: {
      format: 'PCF',
      dialect: sourceRecord?.dialect || 'GENERIC_PCF',
      sourceName: sourceRecord?.name || '',
      units: config?.profile?.units || 'mm',
    },
  });
  project.addSourceFile(sourceRecord);

  const assembly = new CanonicalAssembly({
    id: 'ASM-1',
    name: sourceRecord?.name ? `${sourceRecord.name} Assembly` : 'Assembly 1',
    placement: { x: 0, y: 0, z: 0 },
    sourceRefs: [{ format: 'PCF', sourceId: sourceRecord?.id || 'pcf-source' }],
  });

  const nodeRegistry = buildNodeRegistry(config?.topology?.nodeMergeToleranceMm);
  project.nodes = [];
  project.segments = [];
  project.components = [];
  project.supports = [];
  project.annotations = [];

  let segmentCounter = 1;
  let componentCounter = 1;
  let supportCounter = 1;
  let annotationCounter = 1;

  for (let index = 0; index < components.length; index++) {
    const component = components[index];
    const type = String(component?.type || '').trim().toUpperCase();
    const rawAttributes = {
      ...(component?.raw || {}),
      ...(component?.attributes || {}),
    };

    const ep1 = toPoint(component?.ep1);
    const ep2 = toPoint(component?.ep2);
    const cp = toPoint(component?.cp);
    const bp = toPoint(component?.bp);
    const coOrds = toPoint(component?.coOrds);

    const pipelineRef = pickFirstValue(rawAttributes, pipelineRefKeys, '');
    const lineNoKey = pickFirstValue(rawAttributes, lineNoKeys, pipelineRef);
    const sKey = pickFirstValue(rawAttributes, [sKeyKey, 'SKEY'], '');
    const refNo = pickRefNo(rawAttributes, index, config?.idGeneration);
    const seqNo = pickSeqNo(rawAttributes, index, config?.idGeneration);

    if (SUPPORT_TYPES.has(type)) {
      const supportPoint = coOrds || ep1 || ep2;
      const nearest = supportPoint ? nodeRegistry.findNearest(supportPoint) : null;
      const hasHost = !!nearest?.node;
      const supportDirection = pickFirstValue(rawAttributes, ['DIRECTION', 'SUPPORT-DIRECTION', '<DIRECTION>'], 'UNKNOWN');
      const supportCode = pickFirstValue(rawAttributes, [sKeyKey, 'SUPPORT-TYPE', 'ITEM-CODE'], '');
      const supportKind = resolveKindPure(
        { ...rawAttributes, SKEY: supportCode },
        { userRules: [], kindMap: {}, defaultKind: 'REST' },
      );
      const support = new CanonicalSupport({
        id: `SUP-${supportCounter++}`,
        assemblyId: assembly.id,
        hostRefType: hasHost ? 'NODE' : 'INFERRED',
        hostRef: hasHost ? nearest.node.id : null,
        hostRefConfidence: hasHost
          ? Math.max(0, 1 - (nearest.distance / Math.max(supportAnchorTolerance, 0.0001)))
          : 0,
        rawAttributes,
        derivedAttributes: {},
        normalized: {
          supportCoord: supportPoint ? { x: supportPoint.x, y: supportPoint.y, z: supportPoint.z } : null,
          supportDirection,
          supportCode,
          supportKind,
          lineNoKey,
          pipelineRef,
          sKey,
          refNo,
          seqNo,
        },
        sourceRefs: [{ format: 'PCF', sourceId: `BLOCK:${index + 1}` }],
        fidelity: FidelityClass.RECONSTRUCTED,
      });
      project.supports.push(support);
      assembly.supportIds.push(support.id);
      continue;
    }

    if (ANNOTATION_TYPES.has(type)) {
      const annotationPoint =
        toPoint(component?.circleCoord) ||
        toPoint(component?.squarePos) ||
        coOrds ||
        ep1 ||
        ep2;
      const nearest = annotationPoint ? nodeRegistry.findNearest(annotationPoint) : null;
      const annotationText = String(
        component?.circleText ||
        component?.squareText ||
        rawAttributes?.TEXT ||
        ''
      );
      const annotation = new CanonicalAnnotation({
        id: `ANN-${annotationCounter++}`,
        assemblyId: assembly.id,
        annotationType: type,
        anchorType: nearest?.node ? 'NODE' : 'INFERRED',
        anchorRef: nearest?.node?.id || null,
        anchorConfidence: nearest?.node
          ? Math.max(0, 1 - (nearest.distance / Math.max(supportAnchorTolerance, 0.0001)))
          : 0,
        rawAttributes,
        derivedAttributes: {},
        normalized: {
          anchorPoint: annotationPoint ? { x: annotationPoint.x, y: annotationPoint.y, z: annotationPoint.z } : null,
          lineNoKey,
          pipelineRef,
          sKey,
          refNo,
          seqNo,
        },
        text: annotationText,
        sourceRefs: [{ format: 'PCF', sourceId: `BLOCK:${index + 1}` }],
        fidelity: FidelityClass.RECONSTRUCTED,
      });
      project.annotations.push(annotation);
      assembly.annotationIds.push(annotation.id);
      continue;
    }

    if (!ep1 || !ep2) {
      project.diagnostics.warn(
        'PCF_COMPONENT_WITHOUT_ENDPOINTS',
        `Component "${type || 'UNKNOWN'}" has no END-POINT pair and was skipped for graph construction.`,
        { index, id: component?.id || null }
      );
      continue;
    }

    const fromNode = nodeRegistry.register({
      point: ep1,
      assemblyId: assembly.id,
      sourceRef: { format: 'PCF', sourceId: `BLOCK:${index + 1}:EP1` },
    });
    const toNode = nodeRegistry.register({
      point: ep2,
      assemblyId: assembly.id,
      sourceRef: { format: 'PCF', sourceId: `BLOCK:${index + 1}:EP2` },
    });

    const segment = new CanonicalSegment({
      id: `SEG-${segmentCounter++}`,
      assemblyId: assembly.id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      graphRole: 'RUN',
      nominalBore: toFiniteNumber(ep1?.bore),
      rawAttributes,
      derivedAttributes: buildDerivedSegmentData(ep1, ep2, config),
      normalized: {
        componentType: type || 'PIPE',
        lineNoKey,
        pipelineRef,
        sKey,
        refNo,
        seqNo,
      },
      lineRef: lineNoKey || pipelineRef || '',
      sourceRefs: [{ format: 'PCF', sourceId: `BLOCK:${index + 1}` }],
      fidelity: FidelityClass.NORMALIZED_LOSSLESS,
      metadata: {
        sourceComponentId: component?.id || null,
      },
    });

    project.segments.push(segment);
    assembly.segmentIds.push(segment.id);

    const canonicalComponent = new CanonicalComponent({
      id: `CMP-${componentCounter++}`,
      assemblyId: assembly.id,
      type: type || 'PIPE',
      anchorNodeIds: [fromNode.id, toNode.id],
      hostSegmentIds: [segment.id],
      rawAttributes,
      derivedAttributes: buildDerivedComponentData(type, ep1, ep2, cp, bp, config),
      normalized: {
        lineNoKey,
        pipelineRef,
        sKey,
        refNo,
        seqNo,
        ep1: { x: ep1.x, y: ep1.y, z: ep1.z },
        ep2: { x: ep2.x, y: ep2.y, z: ep2.z },
        cp: cp ? { x: cp.x, y: cp.y, z: cp.z } : null,
        bp: bp ? { x: bp.x, y: bp.y, z: bp.z } : null,
      },
      sourceRefs: [{ format: 'PCF', sourceId: `BLOCK:${index + 1}` }],
      fidelity: FidelityClass.NORMALIZED_LOSSLESS,
    });

    project.components.push(canonicalComponent);
    assembly.componentIds.push(canonicalComponent.id);
  }

  project.nodes = nodeRegistry.allNodes();
  for (const node of project.nodes) {
    node.connectedSegmentIds = [];
  }
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
  for (const segment of project.segments) {
    const from = nodeById.get(segment.fromNodeId);
    const to = nodeById.get(segment.toNodeId);
    if (from) from.connectedSegmentIds.push(segment.id);
    if (to) to.connectedSegmentIds.push(segment.id);
  }
  const degreeByNode = new Map(project.nodes.map((node) => [node.id, node.connectedSegmentIds.length]));
  for (const node of project.nodes) {
    node.branchDegree = degreeByNode.get(node.id) || 0;
  }
  for (const segment of project.segments) {
    const fromDegree = degreeByNode.get(segment.fromNodeId) || 0;
    const toDegree = degreeByNode.get(segment.toNodeId) || 0;
    segment.graphRole = classifyGraphRole(fromDegree, toDegree);
  }

  for (const node of project.nodes) {
    assembly.nodeIds.push(node.id);
  }
  project.addAssembly(assembly);

  project.metadata.summary = {
    assemblies: project.assemblies.length,
    nodes: project.nodes.length,
    segments: project.segments.length,
    components: project.components.length,
    supports: project.supports.length,
    annotations: project.annotations.length,
  };

  project.diagnostics.info('PCF_CANONICAL_BUILD_COMPLETE', 'PCF source mapped to canonical project.', {
    componentCount: components.length,
    summary: project.metadata.summary,
  });

  if (project.segments.length === 0) {
    project.diagnostics.warn('PCF_NO_SEGMENTS', 'No PCF segments were constructed from the source input.', {
      sourceName: sourceRecord?.name || '',
    });
  }

  return project;
}
