import { SourceFileRecord } from '../SourceFileRecord.js';
import { SourceDialectInfo } from '../SourceDialectInfo.js';
import { buildCanonicalProjectFromTopoSource } from '../../topo/topo-builder.js';
import { cloneDefaultTopoProfile } from '../../topo/topo-mapping-profiles.js';

const CAESAR_XML_UNUSED_SENTINEL = -1.0101;

function attrNum(node, key, fallback = null) {
  if (!node || !node.getAttribute) return fallback;
  const raw = node.getAttribute(key);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function attrNumFirst(node, keys, fallback = null) {
  for (const key of keys) {
    const value = attrNum(node, key, null);
    if (value !== null) return value;
  }
  return fallback;
}

function normalizeCaesarDelta(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value - CAESAR_XML_UNUSED_SENTINEL) < 0.001 ? 0 : value;
}

function attrDelta(node, key) {
  return normalizeCaesarDelta(attrNum(node, key, 0));
}

function normalizeNodeRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  return Number.isInteger(numeric) ? String(numeric) : String(numeric);
}

function directChildByTagName(node, tagName) {
  const expected = String(tagName || '').toUpperCase();
  for (const child of Array.from(node?.children || [])) {
    if (String(child.tagName || '').toUpperCase() === expected) return child;
  }
  return null;
}

function parseCaesarXmlToTopoInput(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const model = doc.querySelector('PIPINGMODEL');
  const segments = [];
  const supports = [];
  const messages = [];

  const byNearNode = new Map();
  [...doc.querySelectorAll('BEND')].forEach((bNode) => {
    const nearNode = normalizeNodeRef(
      bNode.getAttribute('NEAR_NODE') || bNode.getAttribute('NODE') || bNode.getAttribute('NODE1') || '',
    );
    if (!nearNode) return;
    byNearNode.set(nearNode, {
      radius: attrNum(bNode, 'RADIUS', null),
    });
  });

  [...doc.querySelectorAll('PIPINGELEMENT')].forEach((elNode, index) => {
    const fromRef = normalizeNodeRef(elNode.getAttribute('FROM_NODE') || '');
    const toRef = normalizeNodeRef(elNode.getAttribute('TO_NODE') || '');
    if (!fromRef || !toRef) {
      messages.push({ level: 'WARN', message: `PIPINGELEMENT index ${index} skipped (missing FROM_NODE/TO_NODE).` });
      return;
    }

    const dx = attrDelta(elNode, 'DELTA_X');
    const dy = attrDelta(elNode, 'DELTA_Y');
    const dz = attrDelta(elNode, 'DELTA_Z');
    const od = attrNumFirst(elNode, ['OD', 'DIAMETER'], null);
    const wall = attrNumFirst(elNode, ['WALL_THICKNESS', 'WALL_THICK'], null);
    const lineNo = elNode.getAttribute('LINE_NO') || elNode.getAttribute('LINE-NO') || '';

    const bendNode = directChildByTagName(elNode, 'BEND');
    const bend = bendNode ? { radius: attrNum(bendNode, 'RADIUS', null) } : (byNearNode.get(fromRef) || byNearNode.get(toRef) || null);
    const type = bend ? 'BEND' : 'PIPE';

    const rawAttributes = {
      INDEX: index,
      FROM_NODE: fromRef,
      TO_NODE: toRef,
      DELTA_X: dx,
      DELTA_Y: dy,
      DELTA_Z: dz,
      OD: od,
      WALL_THICKNESS: wall,
      LINE_NO: lineNo,
      SKEY: type,
      MATERIAL: elNode.getAttribute('MATNAME') || '',
      NAME: elNode.getAttribute('NAME') || '',
      P1: attrNum(elNode, 'P1', null),
      T1: attrNum(elNode, 'T1', null),
      CORR_THK: attrNum(elNode, 'CORR_THK', null),
      BEND_RADIUS: bend?.radius ?? null,
    };

    segments.push({
      id: `XML-ELEMENT-${index + 1}`,
      type,
      fromRef,
      toRef,
      dx,
      dy,
      dz,
      ep1: null,
      ep2: null,
      cp: null,
      bp: null,
      supportCoord: null,
      rawAttributes,
      sourceRefs: [{ format: 'XML', sourceId: `PIPINGELEMENT:${index + 1}` }],
      path: lineNo || `XML-LINE-${index + 1}`,
    });
  });

  [...doc.querySelectorAll('RESTRAINT')].forEach((rNode, index) => {
    const nodeRef = normalizeNodeRef(rNode.getAttribute('NODE') || '');
    const rawType = String(rNode.getAttribute('TYPE') || rNode.getAttribute('RESTRAINT_TYPE') || '').trim();
    const supportName = String(rNode.getAttribute('SUPPORT_NAME') || '').trim();
    const lineNo = String(rNode.getAttribute('LINE_NO') || '').trim();
    const x = attrNum(rNode, 'X', null);
    const y = attrNum(rNode, 'Y', null);
    const z = attrNum(rNode, 'Z', null);

    supports.push({
      id: `XML-SUPPORT-${index + 1}`,
      type: 'SUPPORT',
      fromRef: nodeRef,
      toRef: '',
      ep1: null,
      ep2: null,
      cp: null,
      bp: null,
      supportCoord: (x !== null && y !== null && z !== null) ? { x, y, z } : null,
      rawAttributes: {
        NODE: nodeRef,
        TYPE: rawType,
        SUPPORT_NAME: supportName,
        LINE_NO: lineNo,
        SKEY: supportName || rawType || 'SUPPORT',
        SUPPORT_DIRECTION: rawType,
        XCOSINE: attrNum(rNode, 'XCOSINE', 0),
        YCOSINE: attrNum(rNode, 'YCOSINE', 0),
        ZCOSINE: attrNum(rNode, 'ZCOSINE', 0),
      },
      sourceRefs: [{ format: 'XML', sourceId: `RESTRAINT:${index + 1}` }],
      path: supportName || rawType || 'SUPPORT',
    });
  });

  return {
    format: 'XML',
    segments,
    supports,
    annotations: [],
    messages,
    meta: {
      jobName: model?.getAttribute('JOBNAME') || '',
      northX: attrNum(model, 'NORTH_X', null),
      northY: attrNum(model, 'NORTH_Y', null),
      northZ: attrNum(model, 'NORTH_Z', null),
    },
  };
}

export class CaesarXmlImportAdapter {
  static detect(xmlText) {
    return /<\s*PIPINGMODEL\b/i.test(xmlText || '') || /<\s*PIPINGELEMENT\b/i.test(xmlText || '');
  }

  static detectConfidence(input) {
    const text = input?.text || '';
    const name = input?.name || '';
    if (this.detect(text)) {
      return /\.xml$/i.test(name) ? 0.96 : 0.86;
    }
    return 0;
  }

  async import({ id = '', name = 'input.xml', text = '' } = {}) {
    const parsedTopo = parseCaesarXmlToTopoInput(text);
    const dialectInfo = new SourceDialectInfo({
      format: 'XML',
      dialect: 'CAESAR_XML',
      units: 'SOURCE_DEFINED',
      axisConvention: 'Y_UP',
      metadata: parsedTopo.meta,
    });

    const sourceRecord = new SourceFileRecord({
      id: id || `xml-${Date.now()}`,
      name,
      format: 'XML',
      dialect: dialectInfo.dialect,
      rawText: text,
      metadata: { ...parsedTopo.meta, dialectInfo },
    });

    for (const msg of parsedTopo.messages || []) {
      sourceRecord.addMessage(msg.level || 'INFO', msg.message || '', msg.details || {});
    }

    const { project, topoGraph, supportSpecs } = buildCanonicalProjectFromTopoSource({
      sourceRecord,
      topoInput: parsedTopo,
      format: 'XML',
      profileOverride: cloneDefaultTopoProfile('XML'),
    });

    sourceRecord.addMessage('INFO', 'CAESAR XML source mapped through Topo Builder.', {
      elements: parsedTopo.segments.length,
      supports: parsedTopo.supports.length,
      topo: {
        nodes: topoGraph.nodes.length,
        segments: topoGraph.segments.length,
      },
      supportSpecs: supportSpecs.length,
    });

    return {
      sourceRecord,
      parsed: {
        topoInput: parsedTopo,
        topoGraph,
        supportSpecs,
      },
      project,
      diagnostics: {
        source: sourceRecord.messages,
        canonical: project?.diagnostics?.messages || [],
      },
    };
  }
}
