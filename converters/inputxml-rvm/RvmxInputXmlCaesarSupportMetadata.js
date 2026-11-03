import { ANCHOR_ROLES, COMPONENT_TYPES, CONFIDENCE_LEVELS, PORT_ROLES } from './RvmxUxmlConstants.js';
import { createUxmlAnchor, createUxmlComponent, createUxmlPort, createUxmlSupport } from './RvmxUxmlTypes.js';
import { caesarSupportLabel, classifyCaesarRestraint, isValidCaesarSupportAttrs } from './RvmxCaesarRestraintClassifier.js';

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function pad(num) {
  return String(num).padStart(3, '0');
}

function parseAttrs(attrText = '') {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = re.exec(attrText))) attrs[match[1]] = match[3] ?? match[4] ?? '';
  return attrs;
}

function findElements(xmlText, tagName) {
  const tag = String(tagName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const results = [];
  const stack = [];
  const token = new RegExp(`<\\s*(\\/)?\\s*(?:[\\w.-]+:)?${tag}\\b([^>]*?)(\\/)?\\s*>`, 'gi');
  let match;
  while ((match = token.exec(String(xmlText || '')))) {
    const isClosing = !!match[1];
    const rawAttrs = text(match[2] || '');
    const isSelfClosing = !!match[3] || rawAttrs.endsWith('/');
    if (isClosing) {
      const open = stack.pop();
      if (!open) continue;
      results.push({ tagName, attrs: parseAttrs(open.attrs), inner: xmlText.slice(open.end, match.index), raw: xmlText.slice(open.start, token.lastIndex) });
      continue;
    }
    if (isSelfClosing) {
      results.push({ tagName, attrs: parseAttrs(rawAttrs.replace(/\/$/, '')), inner: '', raw: match[0] });
      continue;
    }
    stack.push({ start: match.index, end: token.lastIndex, attrs: rawAttrs });
  }
  return results;
}

function findSupportTags(inner = '') {
  const tagNames = ['RESTRAINT', 'RESTRAINTS', 'RESTRANT', 'RESTRANTS', 'HANGER', 'HANGERS', 'SPRINGHANGER', 'SPRING_HANGER', 'SUPPORT', 'SUPPORTS'];
  const out = [];
  const seen = new Set();
  for (const tagName of tagNames) {
    for (const tag of findElements(inner, tagName)) {
      if (seen.has(tag.raw)) continue;
      seen.add(tag.raw);
      if (!isValidCaesarSupportAttrs(tag.attrs || {}, tagName)) continue;
      out.push(tag);
    }
  }
  return out;
}

function anchorByRole(doc, componentId, role) {
  return (doc.anchors || []).find((anchor) => anchor.componentId === componentId && anchor.role === role) || null;
}

function supportPointFor(parent, attrs, doc) {
  const node = text(attrs.NODE ?? attrs.AT_NODE ?? attrs.SUPPORT_NODE ?? attrs.RESTRAINT_NODE ?? attrs.HANGER_NODE);
  const fromNode = text(parent?.rawAttributes?.FROM_NODE ?? parent?.rawAttributes?.FROMNODE ?? parent?.rawAttributes?.FROM);
  const toNode = text(parent?.rawAttributes?.TO_NODE ?? parent?.rawAttributes?.TONODE ?? parent?.rawAttributes?.TO);
  const ep1 = anchorByRole(doc, parent.id, ANCHOR_ROLES.EP1)?.point || null;
  const ep2 = anchorByRole(doc, parent.id, ANCHOR_ROLES.EP2)?.point || null;
  if (node && node === fromNode && ep1) return ep1;
  if (node && node === toNode && ep2) return ep2;
  return ep2 || ep1 || null;
}

function existingSupportComponent(doc, parentId, ordinal) {
  return (doc.components || []).find((component) => (
    component.normalizedType === COMPONENT_TYPES.SUPPORT &&
    component.rawAttributes?.parentComponentId === parentId &&
    String(component.rawAttributes?.caesarSupportOrdinal || '') === String(ordinal)
  )) || (ordinal === 1 ? (doc.components || []).find((component) => (
    component.normalizedType === COMPONENT_TYPES.SUPPORT &&
    component.rawAttributes?.parentComponentId === parentId
  )) : null);
}

function upsertSupport(doc, parent, tag, ordinal, sourceId) {
  const attrs = tag.attrs || {};
  const kind = classifyCaesarRestraint(attrs, { tagName: tag.tagName });
  const label = caesarSupportLabel(attrs, { tagName: tag.tagName });
  const point = supportPointFor(parent, attrs, doc);
  if (!point) return false;

  let component = existingSupportComponent(doc, parent.id, ordinal);
  const componentId = component?.id || `${parent.id}-SUP-${pad(ordinal)}`;
  const rawAttributes = {
    ...attrs,
    sourceTagName: `PIPINGELEMENT.${tag.tagName}`,
    parentComponentId: parent.id,
    parentSourceIndex: text(parent.rawAttributes?.sourceIndex),
    pipelineRef: text(parent.pipelineRef),
    caesarSupportOrdinal: String(ordinal),
    caesarSupportKind: kind,
    caesarSupportLabel: label,
    caesarRestraintTypeCode: text(attrs.TYPE ?? attrs.RESTRAINT_TYPE ?? attrs.CAESAR_TYPE),
    caesarXCosine: text(attrs.XCOSINE ?? attrs.X_COSINE ?? attrs.XCOS ?? attrs.X),
    caesarYCosine: text(attrs.YCOSINE ?? attrs.Y_COSINE ?? attrs.YCOS ?? attrs.Y),
    caesarZCosine: text(attrs.ZCOSINE ?? attrs.Z_COSINE ?? attrs.ZCOS ?? attrs.Z),
    caesarGap: text(attrs.GAP ?? attrs.GAP1 ?? attrs.GAP2),
    caesarStiffness: text(attrs.STIFFNESS ?? attrs.K ?? attrs.STIF),
    caesarCNode: text(attrs.CNODE ?? attrs.C_NODE ?? attrs.C_NODE_NUMBER),
  };

  if (!component) {
    component = createUxmlComponent({
      id: componentId,
      sourceRefs: [sourceId],
      type: COMPONENT_TYPES.SUPPORT,
      normalizedType: COMPONENT_TYPES.SUPPORT,
      pipelineRef: text(parent.pipelineRef),
      lineKey: text(parent.lineKey || parent.pipelineRef),
      pipelineId: text(parent.pipelineId),
      refNo: text(parent.refNo),
      seqNo: `${text(parent.seqNo || parent.rawAttributes?.sourceIndex)}-SUP-${ordinal}`,
      name: label,
      bore: parent.bore,
      skey: kind,
      rawAttributes,
      confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
    });
    doc.components.push(component);
  } else {
    component.name = label;
    component.skey = kind;
    component.rawAttributes = { ...(component.rawAttributes || {}), ...rawAttributes };
  }

  const anchorId = `IX-A-${component.id}-${ANCHOR_ROLES.SUPPORT_POINT}`;
  if (!(doc.anchors || []).some((anchor) => anchor.id === anchorId)) {
    doc.anchors.push(createUxmlAnchor({
      id: anchorId,
      componentId: component.id,
      role: ANCHOR_ROLES.SUPPORT_POINT,
      point,
      sourceField: `PIPINGELEMENT.${tag.tagName}:NODE`,
      confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
    }));
    component.anchorIds.push(anchorId);
  }

  const portId = `IX-P-${component.id}-${PORT_ROLES.SUPPORT_POINT}`;
  if (!(doc.ports || []).some((port) => port.id === portId)) {
    doc.ports.push(createUxmlPort({
      id: portId,
      componentId: component.id,
      anchorId,
      role: PORT_ROLES.SUPPORT_POINT,
      point,
      bore: component.bore,
      connectsTo: 'SEGMENT',
      maxDegree: 1,
    }));
    component.portIds.push(portId);
  }

  const supportId = `IX-SUP-${component.id}`;
  let support = (doc.supports || []).find((item) => item.id === supportId || item.componentId === component.id);
  if (!support) {
    support = createUxmlSupport({ id: supportId, componentId: component.id, supportAnchorId: anchorId });
    doc.supports.push(support);
  }
  support.type = kind;
  support.skey = kind;
  support.supportAnchorId = anchorId;
  support.restraints = [{ kind, rawAttributes, sourceTagName: tag.tagName }];
  component.supportId = support.id;
  return true;
}

export function applyInputXmlCaesarSupportMetadata(xmlText, doc, options = {}) {
  const elements = findElements(xmlText, 'PIPINGELEMENT');
  const parentsBySourceIndex = new Map((doc.components || [])
    .filter((component) => upper(component.normalizedType) !== COMPONENT_TYPES.SUPPORT)
    .map((component) => [text(component.rawAttributes?.sourceIndex), component]));

  let supportTagCount = 0;
  let expandedSupportCount = 0;
  const kindCounts = {};

  elements.forEach((element, index) => {
    const parent = parentsBySourceIndex.get(String(index + 1));
    if (!parent) return;
    const supportTags = findSupportTags(element.inner || '');
    supportTagCount += supportTags.length;
    supportTags.forEach((tag, tagIndex) => {
      const kind = classifyCaesarRestraint(tag.attrs || {}, { tagName: tag.tagName });
      if (upsertSupport(doc, parent, tag, tagIndex + 1, options.sourceId || 'inputxml-glb')) {
        expandedSupportCount += 1;
        kindCounts[kind] = (kindCounts[kind] || 0) + 1;
      }
    });
  });

  return { supportTagCount, expandedSupportCount, kindCounts };
}
