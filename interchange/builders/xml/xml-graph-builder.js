import { CanonicalAssembly } from '../../canonical/CanonicalAssembly.js';
import { CanonicalNode } from '../../canonical/CanonicalNode.js';
import { CanonicalSegment } from '../../canonical/CanonicalSegment.js';
import { CanonicalComponent } from '../../canonical/CanonicalComponent.js';
import { CanonicalProject } from '../../canonical/CanonicalProject.js';
import { CanonicalDiagnostics } from '../../canonical/CanonicalDiagnostics.js';
import { FidelityClass } from '../../canonical/FidelityClass.js';
import { buildXmlSupports } from './xml-support-builder.js';
import { buildXmlAnnotations } from './xml-annotation-builder.js';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function dist(a, b) {
  const dx = num(a.x) - num(b.x);
  const dy = num(a.y) - num(b.y);
  const dz = num(a.z) - num(b.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function buildAdjacency(elements = []) {
  const adj = new Map();
  for (const el of elements) {
    const from = String(el.from);
    const to = String(el.to);
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.has(to)) adj.set(to, []);
    adj.get(from).push({ next: to, el, sign: +1 });
    adj.get(to).push({ next: from, el, sign: -1 });
  }
  return adj;
}

function connectedComponents(elements = []) {
  const adj = buildAdjacency(elements);
  const visited = new Set();
  const comps = [];
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const queue = [node];
    visited.add(node);
    const nodeIds = [];
    while (queue.length) {
      const cur = queue.shift();
      nodeIds.push(cur);
      for (const entry of adj.get(cur) || []) {
        if (!visited.has(entry.next)) {
          visited.add(entry.next);
          queue.push(entry.next);
        }
      }
    }
    const nodeIdSet = new Set(nodeIds);
    const compEls = elements.filter((el) => nodeIdSet.has(String(el.from)) || nodeIdSet.has(String(el.to)));
    comps.push({ root: nodeIds[0], nodeIds, nodeIdSet, elements: compEls });
  }
  return comps;
}

function solveComponent(component, diagnostics) {
  const positions = new Map();
  const adj = buildAdjacency(component.elements);
  const queue = [component.root];
  positions.set(component.root, { x: 0, y: 0, z: 0 });
  while (queue.length) {
    const cur = queue.shift();
    const origin = positions.get(cur);
    for (const entry of adj.get(cur) || []) {
      const dx = num(entry.el.dx);
      const dy = num(entry.el.dy);
      const dz = num(entry.el.dz);
      const candidate = entry.sign > 0
        ? { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz }
        : { x: origin.x - dx, y: origin.y - dy, z: origin.z - dz };
      if (!positions.has(entry.next)) {
        positions.set(entry.next, candidate);
        queue.push(entry.next);
      } else {
        const prev = positions.get(entry.next);
        if (dist(prev, candidate) > 0.01) {
          diagnostics.warn('XML_NODE_POSITION_CONFLICT', 'Node position conflict detected while solving XML graph.', {
            node: entry.next,
            prev,
            candidate,
            elementIndex: entry.el.index,
          });
        }
      }
    }
  }
  return positions;
}

function classifyGraphRole(degreeA, degreeB) {
  const maxDeg = Math.max(degreeA, degreeB);
  const minDeg = Math.min(degreeA, degreeB);
  if (maxDeg >= 3) return minDeg <= 1 ? 'BRANCH_OFF' : 'RUN';
  if (degreeA === 1 || degreeB === 1) return 'DEADLEG';
  return 'RUN';
}

function calcDegrees(elements = []) {
  const degrees = new Map();
  for (const el of elements) {
    const a = String(el.from); const b = String(el.to);
    degrees.set(a, (degrees.get(a) || 0) + 1);
    degrees.set(b, (degrees.get(b) || 0) + 1);
  }
  return degrees;
}

export function buildXmlCanonicalProject({ sourceRecord, parsed }) {
  const project = new CanonicalProject({
    id: `project-${sourceRecord.id}`,
    name: sourceRecord.metadata?.jobName || sourceRecord.name || 'XML Project',
    metadata: {
      format: 'XML',
      dialect: sourceRecord.dialect,
      sourceName: sourceRecord.name,
    },
  });
  project.addSourceFile(sourceRecord);

  const diagnostics = project.diagnostics;
  const elements = Array.isArray(parsed?.elements) ? parsed.elements : [];
  const components = connectedComponents(elements);
  const degrees = calcDegrees(elements);
  diagnostics.info('XML_COMPONENT_COUNT', `Detected ${components.length} connected assembly component(s).`, { count: components.length });

  let assemblyCounter = 1;
  let globalNodeCounter = 1;
  let globalSegmentCounter = 1;
  let globalComponentCounter = 1;

  components.forEach((comp, index) => {
    const assembly = new CanonicalAssembly({
      id: `ASM-${assemblyCounter++}`,
      name: `Assembly ${index + 1}`,
      placement: { x: index * 4000, y: 0, z: 0 },
      sourceRefs: [{ format: 'XML', sourceId: `ASSEMBLY:${comp.root}` }],
    });

    const solved = solveComponent(comp, diagnostics);
    const nodeIdMap = new Map();
    for (const nodeRef of comp.nodeIds) {
      const p = solved.get(nodeRef) || { x: 0, y: 0, z: 0 };
      const node = new CanonicalNode({
        id: `N-${globalNodeCounter++}`,
        assemblyId: assembly.id,
        position: { x: p.x + assembly.placement.x, y: p.y, z: p.z },
        sourceRefs: [{ format: 'XML', sourceId: `NODE:${nodeRef}` }],
        metadata: { sourceNodeRef: nodeRef },
      });
      node.branchDegree = degrees.get(String(nodeRef)) || 0;
      nodeIdMap.set(String(nodeRef), node.id);
      assembly.nodeIds.push(node.id);
      if (!project.nodes) project.nodes = [];
      project.nodes.push(node);
    }

    for (const el of comp.elements) {
      const aId = nodeIdMap.get(String(el.from));
      const bId = nodeIdMap.get(String(el.to));
      const graphRole = classifyGraphRole(degrees.get(String(el.from)) || 0, degrees.get(String(el.to)) || 0);
      const lengthMm = Math.sqrt((num(el.dx) ** 2) + (num(el.dy) ** 2) + (num(el.dz) ** 2));
      const seg = new CanonicalSegment({
        id: `S-${globalSegmentCounter++}`,
        assemblyId: assembly.id,
        fromNodeId: aId,
        toNodeId: bId,
        graphRole,
        od: el.od ?? null,
        wall: el.wall ?? null,
        material: el.material || '',
        lineRef: el.lineNo || '',
        rawAttributes: { ...el },
        derivedAttributes: {},
        normalized: {
          type: el.hasBend ? 'BEND_RUN' : 'STRAIGHT_RUN',
          lineRef: el.lineNo || '',
        },
        sourceRefs: [{ format: 'XML', sourceId: `ELEMENT:${el.index}` }],
        fidelity: FidelityClass.NORMALIZED_LOSSLESS,
        metadata: { lengthMm },
      });
      assembly.segmentIds.push(seg.id);
      if (!project.segments) project.segments = [];
      project.segments.push(seg);

      if (el.hasBend) {
        const component = new CanonicalComponent({
          id: `C-${globalComponentCounter++}`,
          assemblyId: assembly.id,
          type: 'BEND',
          anchorNodeIds: [aId, bId],
          rawAttributes: { ...el },
          derivedAttributes: {},
          normalized: { centerPoint: el.bend?.centrePoint || null },
          sourceRefs: [{ format: 'XML', sourceId: `BEND:${el.index}` }],
          fidelity: FidelityClass.RECONSTRUCTED,
        });
        assembly.componentIds.push(component.id);
        if (!project.components) project.components = [];
        project.components.push(component);
      }
    }

    const supports = buildXmlSupports({
      assemblyId: assembly.id,
      xmlRestraints: parsed?.restraints || [],
      nodeIndex: new Map(comp.nodeIds.map((ref) => [String(ref), nodeIdMap.get(String(ref))])),
    });
    supports.forEach((support) => {
      assembly.supportIds.push(support.id);
      if (!project.supports) project.supports = [];
      project.supports.push(support);
    });

    const assemblyNodes = (project.nodes || []).filter((n) => n.assemblyId === assembly.id);
    const assemblySegments = (project.segments || []).filter((s) => s.assemblyId === assembly.id);
    const annotations = buildXmlAnnotations({
      assemblyId: assembly.id,
      nodes: assemblyNodes,
      segments: assemblySegments,
      modelName: sourceRecord.metadata?.jobName || sourceRecord.name || 'XML',
    });
    annotations.forEach((ann) => {
      assembly.annotationIds.push(ann.id);
      if (!project.annotations) project.annotations = [];
      project.annotations.push(ann);
    });

    project.addAssembly(assembly);
  });

  project.metadata.summary = {
    assemblies: project.assemblies.length,
    nodes: (project.nodes || []).length,
    segments: (project.segments || []).length,
    supports: (project.supports || []).length,
    annotations: (project.annotations || []).length,
  };

  return project;
}
