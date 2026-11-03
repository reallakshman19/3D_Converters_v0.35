import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { notify } from '../diagnostics/notification-center.js';
import { state, saveStickyState } from '../core/state.js';

const SCHEMA_VERSION = 'rvm-review-tags/v1';
const NAVIS_SCHEMA = 'http://download.autodesk.com/us/navisworks/schemas/nw-exchange-12.0.xsd';

let fallbackIdCounter = 1;

function asText(value) {
  return String(value ?? '');
}

function clean(value) {
  return asText(value).trim();
}

function localName(node) {
  return String(node?.localName || node?.tagName || '').toLowerCase();
}

function directChild(parent, tagName) {
  if (!parent) return null;
  const wanted = tagName.toLowerCase();

  for (const child of Array.from(parent.children || [])) {
    if (localName(child) === wanted) return child;
  }

  return null;
}

function directChildren(parent, tagName) {
  if (!parent) return [];
  const wanted = tagName.toLowerCase();

  return Array.from(parent.children || []).filter(child => localName(child) === wanted);
}

function firstByPath(parent, path) {
  let current = parent;

  for (const part of path.split('/')) {
    current = directChild(current, part);
    if (!current) return null;
  }

  return current;
}

function allByPath(parent, path) {
  const parts = path.split('/');
  let nodes = [parent];

  for (const part of parts) {
    const next = [];

    for (const node of nodes) {
      next.push(...directChildren(node, part));
    }

    nodes = next;
  }

  return nodes;
}

function textAt(parent, path, fallback = '') {
  return firstByPath(parent, path)?.textContent ?? fallback;
}

function parseNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parsePoint3f(pos3f) {
  if (!pos3f) return null;

  const x = parseNumber(pos3f.getAttribute('x'));
  const y = parseNumber(pos3f.getAttribute('y'));
  const z = parseNumber(pos3f.getAttribute('z'));

  if (![x, y, z].every(Number.isFinite)) return null;

  return { x, y, z };
}

function parsePoint2f(pos2f) {
  if (!pos2f) return null;

  const x = parseNumber(pos2f.getAttribute('x'));
  const y = parseNumber(pos2f.getAttribute('y'));

  if (![x, y].every(Number.isFinite)) return null;

  return { x, y };
}

function parseQuaternion(quat) {
  if (!quat) return null;

  const a = parseNumber(quat.getAttribute('a'));
  const b = parseNumber(quat.getAttribute('b'));
  const c = parseNumber(quat.getAttribute('c'));
  const d = parseNumber(quat.getAttribute('d'));

  if (![a, b, c, d].every(Number.isFinite)) return null;

  return { a, b, c, d };
}

function parseColour(colourEl) {
  if (!colourEl) return null;

  const red = parseNumber(colourEl.getAttribute('red'));
  const green = parseNumber(colourEl.getAttribute('green'));
  const blue = parseNumber(colourEl.getAttribute('blue'));

  if (![red, green, blue].every(Number.isFinite)) return null;

  return { red, green, blue };
}

function parseDateElement(commentEl) {
  const dateEl = firstByPath(commentEl, 'createddate/date');
  if (!dateEl) return null;

  return {
    year: parseNumber(dateEl.getAttribute('year')),
    month: parseNumber(dateEl.getAttribute('month')),
    day: parseNumber(dateEl.getAttribute('day')),
    hour: parseNumber(dateEl.getAttribute('hour')),
    minute: parseNumber(dateEl.getAttribute('minute')),
    second: parseNumber(dateEl.getAttribute('second')),
  };
}

function attrsToObject(el) {
  const out = {};
  if (!el) return out;

  for (const attr of Array.from(el.attributes || [])) {
    out[attr.name] = attr.value;
  }

  return out;
}

function setAttrs(el, attrs = {}) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value !== null && value !== undefined && value !== '') {
      el.setAttribute(key, String(value));
    }
  }
}

function makeTextElement(doc, name, value) {
  const el = doc.createElement(name);
  el.textContent = asText(value);
  return el;
}

function appendPoint3f(doc, parent, wrapperName, point) {
  if (!point) return null;

  const wrapper = doc.createElement(wrapperName);
  const pos = doc.createElement('pos3f');

  pos.setAttribute('x', formatNum(point.x));
  pos.setAttribute('y', formatNum(point.y));
  pos.setAttribute('z', formatNum(point.z));

  wrapper.appendChild(pos);
  parent.appendChild(wrapper);

  return wrapper;
}

function appendPoint2f(doc, parent, wrapperName, point) {
  if (!point) return null;

  const wrapper = doc.createElement(wrapperName);
  const pos = doc.createElement('pos2f');

  pos.setAttribute('x', formatNum(point.x));
  pos.setAttribute('y', formatNum(point.y));

  wrapper.appendChild(pos);
  parent.appendChild(wrapper);

  return wrapper;
}

function appendQuaternion(doc, parent, quat) {
  if (!quat) return null;

  const rotation = doc.createElement('rotation');
  const q = doc.createElement('quaternion');

  q.setAttribute('a', formatNum(quat.a));
  q.setAttribute('b', formatNum(quat.b));
  q.setAttribute('c', formatNum(quat.c));
  q.setAttribute('d', formatNum(quat.d));

  rotation.appendChild(q);
  parent.appendChild(rotation);

  return rotation;
}

function appendColour(doc, parent, colour) {
  if (!colour) return null;

  const c = doc.createElement('colour');
  c.setAttribute('red', formatNum(colour.red));
  c.setAttribute('green', formatNum(colour.green));
  c.setAttribute('blue', formatNum(colour.blue));
  parent.appendChild(c);

  return c;
}

function formatNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0000000000';
  return n.toFixed(10);
}

function basename(value) {
  return clean(value).replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
}

function navisModelFilename(bundleId, rootAttrs = {}) {
  const rootName = basename(rootAttrs.filename);
  const bundleName = basename(bundleId);

  if (bundleName) return bundleName;
  if (rootName && !/^tags?\.xml$/i.test(rootName)) return rootName;

  return 'model.rvm';
}

function navisGuid(value) {
  const text = clean(value).replace(/^TAG-/i, '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return text;
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function vectorFromPoints(from, to) {
  if (!from || !to) return null;

  return {
    x: Number(to.x) - Number(from.x),
    y: Number(to.y) - Number(from.y),
    z: Number(to.z) - Number(from.z),
  };
}

function normalizeVector(vector, fallback) {
  const x = Number(vector?.x);
  const y = Number(vector?.y);
  const z = Number(vector?.z);
  const len = Math.sqrt(x * x + y * y + z * z);

  if (!Number.isFinite(len) || len <= 1e-9) return fallback;

  return { x: x / len, y: y / len, z: z / len };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function quaternionFromRotationMatrix(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return { a: (m21 - m12) / s, b: (m02 - m20) / s, c: (m10 - m01) / s, d: 0.25 * s };
  }

  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return { a: 0.25 * s, b: (m01 + m10) / s, c: (m02 + m20) / s, d: (m21 - m12) / s };
  }

  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return { a: (m01 + m10) / s, b: 0.25 * s, c: (m12 + m21) / s, d: (m02 - m20) / s };
  }

  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return { a: (m02 + m20) / s, b: (m12 + m21) / s, c: 0.25 * s, d: (m10 - m01) / s };
}

function cameraRotationFromState(cameraState = {}, navis = {}) {
  if (cameraState.rotationQuaternion) return cameraState.rotationQuaternion;
  if (navis.cameraRotationQuaternion) return navis.cameraRotationQuaternion;

  const position = cameraState.position || navis.cameraPosition || null;
  const forward = normalizeVector(
    cameraState.forward || navis.forward || vectorFromPoints(position, cameraState.target),
    { x: 0, y: 0, z: -1 }
  );
  const up = normalizeVector(navis.upVector || { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 });
  let right = normalizeVector(cross(forward, up), { x: 1, y: 0, z: 0 });
  const correctedUp = normalizeVector(cross(right, forward), { x: 0, y: 0, z: 1 });
  const backward = { x: -forward.x, y: -forward.y, z: -forward.z };

  right = normalizeVector(right, { x: 1, y: 0, z: 0 });

  return quaternionFromRotationMatrix(
    right.x, correctedUp.x, backward.x,
    right.y, correctedUp.y, backward.y,
    right.z, correctedUp.z, backward.z
  );
}

function appendDefaultClipplaneset(doc, viewEl) {
  const clipplaneset = doc.createElement('clipplaneset');
  setAttrs(clipplaneset, { linked: '0', current: '0', mode: 'planes', enabled: '0' });

  for (const wrapperName of ['range', 'box']) {
    const wrapper = doc.createElement(wrapperName);
    const box3f = doc.createElement('box3f');
    const min = doc.createElement('min');
    const max = doc.createElement('max');
    const minPos = doc.createElement('pos3f');
    const maxPos = doc.createElement('pos3f');

    setAttrs(minPos, { x: formatNum(1), y: formatNum(1), z: formatNum(1) });
    setAttrs(maxPos, { x: formatNum(0), y: formatNum(0), z: formatNum(0) });

    min.appendChild(minPos);
    max.appendChild(maxPos);
    box3f.appendChild(min);
    box3f.appendChild(max);
    wrapper.appendChild(box3f);
    clipplaneset.appendChild(wrapper);

    if (wrapperName === 'range') {
      const clipplanes = doc.createElement('clipplanes');
      for (const alignment of ['top', 'bottom', 'front', 'back', 'left', 'right']) {
        const clipplane = doc.createElement('clipplane');
        const plane = doc.createElement('plane');
        const vec = doc.createElement('vec3f');

        setAttrs(clipplane, { state: 'default', distance: formatNum(0), alignment });
        setAttrs(plane, { distance: formatNum(0) });
        setAttrs(vec, { x: formatNum(0), y: formatNum(1), z: formatNum(0) });

        plane.appendChild(vec);
        clipplane.appendChild(plane);
        clipplanes.appendChild(clipplane);
      }
      clipplaneset.appendChild(clipplanes);
    }
  }

  const boxRotation = doc.createElement('box-rotation');
  appendQuaternion(doc, boxRotation, { a: 0, b: 0, c: 0, d: 1 });
  clipplaneset.appendChild(boxRotation);
  viewEl.appendChild(clipplaneset);
}

function createFallbackId(prefix = 'TAG') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${fallbackIdCounter++}`;
}

function serializeElement(el) {
  if (!el) return '';
  return new XMLSerializer().serializeToString(el);
}

function importXmlElement(doc, xmlString) {
  if (!xmlString) return null;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(xmlString, 'application/xml');
  const parseError = parsed.querySelector('parsererror');

  if (parseError || !parsed.documentElement) return null;

  return doc.importNode(parsed.documentElement, true);
}

function buildCommentsMap(viewEl) {
  const map = new Map();
  const commentsEl = directChild(viewEl, 'comments');

  for (const commentEl of directChildren(commentsEl, 'comment')) {
    const id = commentEl.getAttribute('id') || '';
    if (id) map.set(id, commentEl);
  }

  return map;
}

function parseBox3f(box3f) {
  if (!box3f) return null;

  const min = parsePoint3f(firstByPath(box3f, 'min/pos3f'));
  const max = parsePoint3f(firstByPath(box3f, 'max/pos3f'));

  if (!min && !max) return null;

  return { min, max };
}

function appendBox3f(doc, parent, wrapperName, box) {
  if (!box) return null;

  const wrapper = doc.createElement(wrapperName);
  const box3f = doc.createElement('box3f');

  if (box.min) {
    const min = doc.createElement('min');
    appendPoint3f(doc, min, 'ignored', box.min);
    const ignored = directChild(min, 'ignored');
    if (ignored) {
      const pos = directChild(ignored, 'pos3f');
      ignored.remove();
      if (pos) min.appendChild(pos);
    }
    box3f.appendChild(min);
  }

  if (box.max) {
    const max = doc.createElement('max');
    appendPoint3f(doc, max, 'ignored', box.max);
    const ignored = directChild(max, 'ignored');
    if (ignored) {
      const pos = directChild(ignored, 'pos3f');
      ignored.remove();
      if (pos) max.appendChild(pos);
    }
    box3f.appendChild(max);
  }

  wrapper.appendChild(box3f);
  parent.appendChild(wrapper);

  return wrapper;
}

function inferSeverityFromColour(colour) {
  if (!colour) return 'info';

  if (colour.red >= 0.75 && colour.green < 0.25 && colour.blue < 0.25) return 'high';
  if (colour.red >= 0.75 && colour.green >= 0.5) return 'warning';

  return 'info';
}

function normalizeTagInput(config = {}, bundleId, identityMap) {
  const id = config.id || createFallbackId('TAG');

  const tag = {
    id,
    bundleId,
    canonicalObjectId: config.canonicalObjectId || '',
    sourceObjectId: config.sourceObjectId || '',
    anchorType: config.anchorType || 'object',
    text: config.text || '',
    severity: config.severity || 'info',
    viewStateRef: config.viewStateRef || '',
    status: config.status || 'active',
    worldPosition: config.worldPosition || null,
    cameraState: config.cameraState || null,
    navis: config.navis || null,
  };

  if (!tag.sourceObjectId && tag.canonicalObjectId) {
    const entry = identityMap?.lookupByCanonical?.(tag.canonicalObjectId);
    if (entry) tag.sourceObjectId = entry.sourceObjectId;
  }

  if (!tag.canonicalObjectId && tag.sourceObjectId) {
    const entry = identityMap?.lookupBySource?.(tag.sourceObjectId);
    if (entry) tag.canonicalObjectId = entry.canonicalObjectId;
  }

  return tag;
}

function resolveTagStatus(tag, identityMap) {
  if (!identityMap) return 'active';

  if (tag.canonicalObjectId) {
    return identityMap.lookupByCanonical?.(tag.canonicalObjectId) ? 'active' : 'unresolved';
  }

  if (tag.sourceObjectId) {
    return identityMap.lookupBySource?.(tag.sourceObjectId) ? 'active' : 'unresolved';
  }

  return 'active';
}

function parseNavisCamera(viewpointEl) {
  const cameraEl = firstByPath(viewpointEl, 'camera');
  if (!cameraEl) return null;

  const position = parsePoint3f(firstByPath(cameraEl, 'position/pos3f'));
  const rotationQuaternion = parseQuaternion(firstByPath(cameraEl, 'rotation/quaternion'));
  const forward = parsePoint3f(firstByPath(cameraEl, 'forward/vec3f'));

  const tx = parseNumber(cameraEl.getAttribute('target_x'));
  const ty = parseNumber(cameraEl.getAttribute('target_y'));
  const tz = parseNumber(cameraEl.getAttribute('target_z'));

  const cameraState = {
    position,
    target: null,
    rotationQuaternion,
    forward,
    navisCameraAttrs: attrsToObject(cameraEl),
  };

  if ([tx, ty, tz].every(Number.isFinite)) {
    cameraState.target = { x: tx, y: ty, z: tz };
  } else if (position && forward) {
    cameraState.target = {
      x: position.x + forward.x,
      y: position.y + forward.y,
      z: position.z + forward.z,
    };
  }

  return cameraState;
}

function buildNavisMetadata(root, viewEl, rltagEl, commentEl, viewpointEl) {
  const cameraEl = firstByPath(viewpointEl, 'camera');
  const viewerEl = firstByPath(viewpointEl, 'viewer');
  const upEl = firstByPath(viewpointEl, 'up/vec3f');
  const clipplanesetEl = directChild(viewEl, 'clipplaneset');

  const colour = parseColour(directChild(rltagEl, 'colour'));
  const pos1 = parsePoint2f(firstByPath(rltagEl, 'pos1/pos2f'));
  const pos2 = parsePoint2f(firstByPath(rltagEl, 'pos2/pos2f'));
  const pos3d = parsePoint3f(firstByPath(rltagEl, 'pos3d/pos3f'));
  const bounds = parseBox3f(firstByPath(rltagEl, 'bounds/box3f'));

  return {
    format: 'navisworks-exchange-12.0',
    rootAttrs: attrsToObject(root),
    viewAttrs: attrsToObject(viewEl),
    viewpointAttrs: attrsToObject(viewpointEl),
    cameraAttrs: attrsToObject(cameraEl),
    cameraPosition: parsePoint3f(firstByPath(cameraEl, 'position/pos3f')),
    cameraRotationQuaternion: parseQuaternion(firstByPath(cameraEl, 'rotation/quaternion')),
    upVector: parsePoint3f(upEl),
    viewerAttrs: attrsToObject(viewerEl),
    clipplanesetXml: serializeElement(clipplanesetEl),

    comment: commentEl
      ? {
          id: commentEl.getAttribute('id') || '',
          status: commentEl.getAttribute('status') || 'new',
          user: textAt(commentEl, 'user', ''),
          body: textAt(commentEl, 'body', ''),
          createdDate: parseDateElement(commentEl),
        }
      : null,

    redline: {
      attrs: attrsToObject(rltagEl),
      colour,
      pos1,
      pos2,
      pos3d,
      bounds,
    },
  };
}

function parseLegacyReviewTags(root, store) {
  const schemaVersion = root.getAttribute('schemaVersion');

  if (schemaVersion && schemaVersion !== SCHEMA_VERSION) {
    notify({
      type: 'warning',
      message: `XML schema version mismatch. Expected ${SCHEMA_VERSION}, got ${schemaVersion}`,
    });
  }

  const xmlBundleId = root.getAttribute('bundleId');
  if (xmlBundleId && store.bundleId && xmlBundleId !== store.bundleId) {
    notify({
      type: 'warning',
      message: `Imported tags bundleId (${xmlBundleId}) does not match current bundle (${store.bundleId}).`,
    });
  }

  const importedTags = [];

  for (const tagEl of Array.from(root.querySelectorAll('Tag'))) {
    const id = tagEl.getAttribute('id') || createFallbackId('TAG');
    const canonicalObjectId = clean(textAt(tagEl, 'CanonicalObjectId'));
    const sourceObjectId = clean(textAt(tagEl, 'SourceObjectId'));
    const anchorType = clean(textAt(tagEl, 'AnchorType')) || 'object';
    const text = textAt(tagEl, 'Text');
    const severity = clean(textAt(tagEl, 'Severity')) || 'info';
    const viewStateRef = clean(textAt(tagEl, 'ViewStateRef'));

    let worldPosition = null;
    const wpEl = directChild(tagEl, 'WorldPosition');
    if (wpEl) {
      worldPosition = {
        x: parseNumber(wpEl.getAttribute('x')),
        y: parseNumber(wpEl.getAttribute('y')),
        z: parseNumber(wpEl.getAttribute('z')),
      };
    }

    let cameraState = null;
    const camEl = directChild(tagEl, 'CameraState');
    if (camEl) {
      const posEl = directChild(camEl, 'Position');
      const tgtEl = directChild(camEl, 'Target');

      if (posEl && tgtEl) {
        cameraState = {
          position: {
            x: parseNumber(posEl.getAttribute('x')),
            y: parseNumber(posEl.getAttribute('y')),
            z: parseNumber(posEl.getAttribute('z')),
          },
          target: {
            x: parseNumber(tgtEl.getAttribute('x')),
            y: parseNumber(tgtEl.getAttribute('y')),
            z: parseNumber(tgtEl.getAttribute('z')),
          },
        };
      }
    }

    const tag = normalizeTagInput(
      {
        id,
        bundleId: xmlBundleId || store.bundleId,
        canonicalObjectId,
        sourceObjectId,
        anchorType,
        text,
        severity,
        viewStateRef,
        worldPosition,
        cameraState,
      },
      xmlBundleId || store.bundleId,
      store.identityMap
    );

    tag.status = resolveTagStatus(tag, store.identityMap);

    if (tag.status === 'unresolved' && (tag.canonicalObjectId || tag.sourceObjectId)) {
      notify({
        type: 'warning',
        message: `Imported tag ${id} references unresolved object ID.`,
      });
    }

    store.tags.set(tag.id, tag);
    importedTags.push(tag);
    emit(RuntimeEvents.RVM_TAG_CREATED, { tag });
  }

  return importedTags;
}

function parseNavisExchange(root, store) {
  const importedTags = [];
  const viewElements = allByPath(root, 'viewpoints/view');

  for (let viewIndex = 0; viewIndex < viewElements.length; viewIndex++) {
    const viewEl = viewElements[viewIndex];
    const viewGuid = viewEl.getAttribute('guid') || '';
    const viewName = viewEl.getAttribute('name') || '';
    const viewpointEl = directChild(viewEl, 'viewpoint');
    const commentsById = buildCommentsMap(viewEl);
    const rltags = allByPath(viewEl, 'redlines/rltag');

    for (let tagIndex = 0; tagIndex < rltags.length; tagIndex++) {
      const rltagEl = rltags[tagIndex];
      const commentId = rltagEl.getAttribute('commentid') || rltagEl.getAttribute('id') || '';
      const commentEl = commentsById.get(commentId) || null;

      const navis = buildNavisMetadata(root, viewEl, rltagEl, commentEl, viewpointEl);
      const worldPosition = navis.redline.pos3d || null;
      const cameraState = parseNavisCamera(viewpointEl);

      const rltagId = rltagEl.getAttribute('id') || String(tagIndex + 1);
      const id = (
        rltagEl.getAttribute('tagid') ||
        rltagEl.getAttribute('guid') ||
        (rltags.length === 1 && viewGuid ? viewGuid : `${viewGuid || `NAVIS-VIEW-${viewIndex + 1}`}:RL-${rltagId}`)
      );

      const canonicalObjectId = rltagEl.getAttribute('canonicalObjectId') || '';
      const sourceObjectId = rltagEl.getAttribute('sourceObjectId') || '';
      const xmlBundleId = rltagEl.getAttribute('bundleId') || store.bundleId;
      const text =
        rltagEl.getAttribute('text') ||
        navis.comment?.body ||
        viewName ||
        `Navis Tag ${viewIndex + 1}.${tagIndex + 1}`;

      const severity =
        rltagEl.getAttribute('severity') ||
        inferSeverityFromColour(navis.redline.colour);

      if (xmlBundleId && store.bundleId && xmlBundleId !== store.bundleId) {
        notify({
          type: 'warning',
          message: `Imported tags bundleId (${xmlBundleId}) does not match current bundle (${store.bundleId}).`,
        });
      }

      const tag = normalizeTagInput(
        {
          id,
          bundleId: xmlBundleId,
          canonicalObjectId,
          sourceObjectId,
          anchorType: 'navis-redline-tag',
          text,
          severity,
          worldPosition,
          cameraState,
          navis,
        },
        xmlBundleId,
        store.identityMap
      );

      tag.status = resolveTagStatus(tag, store.identityMap);

      if (tag.status === 'unresolved' && (tag.canonicalObjectId || tag.sourceObjectId)) {
        notify({
          type: 'warning',
          message: `Imported tag ${id} references unresolved object ID.`,
        });
      }

      store.tags.set(tag.id, tag);
      importedTags.push(tag);
      emit(RuntimeEvents.RVM_TAG_CREATED, { tag });
    }
  }

  return importedTags;
}

function appendCamera(doc, viewpointEl, tag) {
  const navis = tag.navis || {};
  const cameraState = tag.cameraState || {};
  const cameraAttrs = {
    projection: 'persp',
    near: '0.1',
    far: '1000',
    aspect: '1.3333333333',
    height: '0.7853980000',
    ...(navis.cameraAttrs || {}),
  };

  const cameraEl = doc.createElement('camera');
  setAttrs(cameraEl, {
    projection: cameraAttrs.projection,
    near: cameraAttrs.near,
    far: cameraAttrs.far,
    aspect: cameraAttrs.aspect,
    height: cameraAttrs.height,
  });

  const position =
    cameraState.position ||
    navis.cameraPosition ||
    { x: 0, y: 0, z: 0 };

  appendPoint3f(doc, cameraEl, 'position', position);

  const rotation =
    cameraRotationFromState(cameraState, navis) ||
    { a: 0, b: 0, c: 0, d: 1 };

  appendQuaternion(doc, cameraEl, rotation);

  viewpointEl.appendChild(cameraEl);
}

function appendViewer(doc, viewpointEl, tag) {
  const attrs = {
    radius: '0.3000000000',
    height: '1.8000000000',
    actual_height: '1.8000000000',
    eye_height: '0.1500000000',
    avatar: 'construction_worker',
    camera_mode: 'first',
    first_to_third_angle: '0.0000000000',
    first_to_third_distance: '3.0000000000',
    first_to_third_param: '1.0000000000',
    first_to_third_correction: '1',
    collision_detection: '0',
    auto_crouch: '0',
    gravity: '0',
    gravity_value: '9.8000000000',
    terminal_velocity: '50.0000000000',
    ...(tag.navis?.viewerAttrs || {}),
  };

  const viewerEl = doc.createElement('viewer');
  setAttrs(viewerEl, attrs);
  viewpointEl.appendChild(viewerEl);
}

function appendUp(doc, viewpointEl, tag) {
  const up = tag.navis?.upVector || { x: 0, y: 0, z: 1 };

  const upEl = doc.createElement('up');
  const vec = doc.createElement('vec3f');
  vec.setAttribute('x', formatNum(up.x));
  vec.setAttribute('y', formatNum(up.y));
  vec.setAttribute('z', formatNum(up.z));
  upEl.appendChild(vec);
  viewpointEl.appendChild(upEl);
}

function appendViewpoint(doc, viewEl, tag) {
  const navis = tag.navis || {};
  const viewpointEl = doc.createElement('viewpoint');

  setAttrs(viewpointEl, {
    tool: 'none',
    render: 'shaded',
    lighting: 'headlight',
    focal: '1.0000000000',
    linear: '1.0000000000',
    angular: '0.7853981634',
    ...(navis.viewpointAttrs || {}),
  });

  appendCamera(doc, viewpointEl, tag);
  appendViewer(doc, viewpointEl, tag);
  appendUp(doc, viewpointEl, tag);

  viewEl.appendChild(viewpointEl);
}

function appendComment(doc, viewEl, tag, commentId) {
  const commentsEl = doc.createElement('comments');
  const commentEl = doc.createElement('comment');

  const navisComment = tag.navis?.comment || {};
  const date = navisComment.createdDate || null;

  commentEl.setAttribute('id', String(commentId));
  commentEl.setAttribute('status', navisComment.status || 'new');

  commentEl.appendChild(makeTextElement(doc, 'user', navisComment.user || 'PCF_GLB_Viewer_Conv'));
  commentEl.appendChild(makeTextElement(doc, 'body', tag.text || navisComment.body || ''));

  const createddate = doc.createElement('createddate');
  const dateEl = doc.createElement('date');

  const d = new Date();
  dateEl.setAttribute('year', String(date?.year || d.getFullYear()));
  dateEl.setAttribute('month', String(date?.month || d.getMonth() + 1));
  dateEl.setAttribute('day', String(date?.day || d.getDate()));
  dateEl.setAttribute('hour', String(date?.hour ?? d.getHours()));
  dateEl.setAttribute('minute', String(date?.minute ?? d.getMinutes()));
  dateEl.setAttribute('second', String(date?.second ?? d.getSeconds()));

  createddate.appendChild(dateEl);
  commentEl.appendChild(createddate);

  commentsEl.appendChild(commentEl);
  viewEl.appendChild(commentsEl);
}

function appendRedline(doc, viewEl, tag, commentId) {
  const redlinesEl = doc.createElement('redlines');
  const rltagEl = doc.createElement('rltag');
  const navisRedline = tag.navis?.redline || {};
  const sourceAttrs = navisRedline.attrs || {};

  setAttrs(rltagEl, {
    thickness: '3',
    pattern: '65535',
    ...(sourceAttrs.thickness ? { thickness: sourceAttrs.thickness } : {}),
    ...(sourceAttrs.pattern ? { pattern: sourceAttrs.pattern } : {}),
    id: String(commentId),
    commentid: String(commentId),
  });

  appendColour(doc, rltagEl, navisRedline.colour || { red: 1, green: 0, blue: 0 });
  appendPoint2f(doc, rltagEl, 'pos1', navisRedline.pos1 || { x: 0, y: 0 });
  appendPoint2f(doc, rltagEl, 'pos2', navisRedline.pos2 || { x: 0, y: 0 });

  redlinesEl.appendChild(rltagEl);
  viewEl.appendChild(redlinesEl);
}

function appendOptionalNavisFragments(doc, viewEl, tag) {
  const clipplanesetXml = tag.navis?.clipplanesetXml;
  const clipplaneset = importXmlElement(doc, clipplanesetXml);

  if (clipplaneset) {
    viewEl.appendChild(clipplaneset);
    return;
  }

  appendDefaultClipplaneset(doc, viewEl);
}

export class RvmTagXmlStore {
  constructor(identityMap, activeBundleId) {
    this.identityMap = identityMap;
    this.bundleId = activeBundleId;
    this.tags = new Map();

    if (!state.rvm) state.rvm = {};

    if (Array.isArray(state.rvm.tags)) {
      for (const t of state.rvm.tags) {
        if (!this.bundleId || t.bundleId === this.bundleId) {
          this.tags.set(t.id, t);
        }
      }
    }
  }

  createTag(config) {
    const tag = normalizeTagInput(config, this.bundleId, this.identityMap);

    this.tags.set(tag.id, tag);
    this._persist();
    emit(RuntimeEvents.RVM_TAG_CREATED, { tag });

    return tag;
  }

  deleteTag(id) {
    if (!this.tags.has(id)) return false;

    const tag = this.tags.get(id);
    this.tags.delete(id);
    this._persist();
    emit(RuntimeEvents.RVM_TAG_DELETED, { id, tag });

    return true;
  }

  getTag(id) {
    return this.tags.get(id) || null;
  }

  getAllTags() {
    return Array.from(this.tags.values());
  }

  _persist() {
    if (!state.rvm) state.rvm = {};

    const existing = Array.isArray(state.rvm.tags) ? state.rvm.tags : [];
    const others = existing.filter(t => this.bundleId && t.bundleId !== this.bundleId);

    state.rvm.tags = [...others, ...this.getAllTags()];
    saveStickyState();
  }

  exportToXml() {
    const doc = document.implementation.createDocument(null, 'exchange');
    const root = doc.documentElement;

    const firstNavis = this.getAllTags().find(t => t.navis?.rootAttrs)?.navis;

    root.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
    root.setAttribute('xsi:noNamespaceSchemaLocation', NAVIS_SCHEMA);
    root.setAttribute('units', firstNavis?.rootAttrs?.units || 'm');
    root.setAttribute('filename', navisModelFilename(this.bundleId, firstNavis?.rootAttrs));

    if (firstNavis?.rootAttrs?.filepath) {
      root.setAttribute('filepath', firstNavis.rootAttrs.filepath);
    }

    const viewpointsEl = doc.createElement('viewpoints');
    root.appendChild(viewpointsEl);

    let commentCounter = 1;

    let viewCounter = 1;

    for (const tag of this.tags.values()) {
      const navis = tag.navis || {};
      const viewEl = doc.createElement('view');

      setAttrs(viewEl, {
        name: `Tag View ${viewCounter++}`,
        guid: navisGuid(navis.viewAttrs?.guid || tag.id),
      });

      appendViewpoint(doc, viewEl, tag);
      appendOptionalNavisFragments(doc, viewEl, tag);

      const commentId = navis.comment?.id || navis.redline?.attrs?.commentid || String(commentCounter++);
      appendComment(doc, viewEl, tag, commentId);
      appendRedline(doc, viewEl, tag, commentId);

      viewpointsEl.appendChild(viewEl);
    }

    const serializer = new XMLSerializer();
    return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(doc)}`;
  }

  importFromXml(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const parseError = doc.querySelector('parsererror');

    if (parseError) {
      throw new Error(`XML Parse Error: ${parseError.textContent}`);
    }

    const root = doc.documentElement;
    if (!root) throw new Error('XML Parse Error: missing document element.');

    let importedTags = [];

    if (localName(root) === 'reviewtags') {
      importedTags = parseLegacyReviewTags(root, this);
    } else if (localName(root) === 'exchange') {
      importedTags = parseNavisExchange(root, this);
    } else {
      throw new Error('Invalid root element. Expected <ReviewTags> or <exchange>.');
    }

    this._persist();

    return importedTags;
  }
}
