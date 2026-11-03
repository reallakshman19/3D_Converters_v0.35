function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function numberOrNull(value) {
  const raw = text(value);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n - -1.0101) < 0.001) return null;
  return n;
}

function attrValue(attrs, ...names) {
  for (const name of names) {
    if (attrs[name] != null && text(attrs[name])) return text(attrs[name]);
    const key = Object.keys(attrs).find((candidate) => candidate.toLowerCase() === String(name).toLowerCase());
    if (key && text(attrs[key])) return text(attrs[key]);
  }
  return '';
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

function findFirstBendTag(inner = '') {
  for (const tagName of ['BEND', 'BENDS', 'ELBOW', 'ELBOWS']) {
    const tag = findElements(inner, tagName)[0];
    if (tag) return tag;
  }
  return null;
}

function numericAttr(attrs, names) {
  for (const name of names) {
    const n = numberOrNull(attrValue(attrs, name));
    if (n != null) return n;
  }
  return null;
}

function bendMetadataFromAttrs(attrs = {}, source = '') {
  const radius = numericAttr(attrs, [
    'RADIUS',
    'BEND_RADIUS',
    'BENDRADIUS',
    'BEND_RAD',
    'BENDRAD',
    'CURVE_RADIUS',
    'CURVERADIUS',
    'R',
  ]);
  const angleDeg = numericAttr(attrs, [
    'ANGLE',
    'ANGLE1',
    'ANGLE_1',
    'BEND_ANGLE',
    'BENDANGLE',
    'BEND_ANGLE1',
    'BENDANGLE1',
    'ANG',
    'ANG1',
    'DEG',
    'DEGREES',
  ]);
  const node = attrValue(attrs, 'NODE', 'NODE1', 'BEND_NODE', 'BENDNODE', 'AT_NODE');
  return {
    radius,
    angleDeg,
    node,
    source,
    rawAttrs: attrs,
  };
}

export function applyInputXmlBendMetadata(xmlText, doc) {
  const tags = findElements(xmlText, 'PIPINGELEMENT');
  let bendTagCount = 0;
  let enrichedComponentCount = 0;
  const bySourceIndex = new Map();

  tags.forEach((tag, index) => {
    const bendTag = findFirstBendTag(tag.inner || '');
    if (!bendTag) return;
    bendTagCount += 1;
    bySourceIndex.set(String(index + 1), bendMetadataFromAttrs(bendTag.attrs || {}, `PIPINGELEMENT.${bendTag.tagName}`));
  });

  for (const component of doc?.components || []) {
    const raw = component.rawAttributes || {};
    const metadata = bySourceIndex.get(text(raw.sourceIndex));
    if (!metadata) continue;
    component.rawAttributes = {
      ...raw,
      inputXmlBendMetadataSource: metadata.source,
      inputXmlBendRawAttrs: JSON.stringify(metadata.rawAttrs || {}),
    };
    if (metadata.radius != null) component.rawAttributes.inputXmlBendRadius = String(metadata.radius);
    if (metadata.angleDeg != null) component.rawAttributes.inputXmlBendAngleDeg = String(metadata.angleDeg);
    if (metadata.node) component.rawAttributes.inputXmlBendNode = metadata.node;
    enrichedComponentCount += 1;
  }

  return {
    bendTagCount,
    enrichedComponentCount,
    radiusCount: [...bySourceIndex.values()].filter((item) => item.radius != null).length,
    angleCount: [...bySourceIndex.values()].filter((item) => item.angleDeg != null).length,
  };
}

export function bendMetadataFromComponentRaw(rawAttributes = {}) {
  const direct = bendMetadataFromAttrs(rawAttributes, text(rawAttributes.inputXmlBendMetadataSource || 'component.rawAttributes'));
  return {
    radius: numberOrNull(rawAttributes.inputXmlBendRadius) ?? direct.radius,
    angleDeg: numberOrNull(rawAttributes.inputXmlBendAngleDeg) ?? direct.angleDeg,
    node: text(rawAttributes.inputXmlBendNode || direct.node),
    source: text(rawAttributes.inputXmlBendMetadataSource || direct.source),
    rawAttrs: rawAttributes.inputXmlBendRawAttrs || '',
  };
}
