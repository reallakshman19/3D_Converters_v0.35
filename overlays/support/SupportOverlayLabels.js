export const SUPPORT_OVERLAY_LABEL_SCHEMA = 'support-overlay-labels/v1';

export function shouldShowSupportOverlayLabel(settings = {}) {
  return settings?.labels === true;
}

export function formatSupportOverlayLabel(record = {}, symbol = {}) {
  const tag = sanitizeLabelToken(record.supportNo || record.tag || record.nodeId || 'SUPPORT');
  const family = sanitizeLabelToken(record.kind || symbol.family || symbol.resolvedFamily || 'UNKNOWN');
  return `${tag} ${family}`.trim().slice(0, 96);
}

export function createSupportOverlayLabelObject({
  CSS2DObject,
  documentRef = globalThis.document,
  THREE,
  record,
  symbol,
  origin,
  glyphSize = 20,
  schema,
  sourceKind,
  sourceFile,
} = {}) {
  if (!CSS2DObject || !documentRef?.createElement || !origin) return null;

  const element = documentRef.createElement('div');
  element.className = 'non-primitive-support-overlay-label';
  element.textContent = formatSupportOverlayLabel(record, symbol);
  element.dataset.overlayKind = 'support';
  element.dataset.sourceKind = String(sourceKind || '');
  element.dataset.supportKind = String(record?.kind || '');
  element.dataset.supportTag = String(record?.tag || '');
  element.style.cssText = [
    'font: 600 11px/1.2 system-ui, -apple-system, Segoe UI, sans-serif',
    'color: #eaffea',
    'background: rgba(8, 17, 28, 0.72)',
    'border: 1px solid rgba(96, 200, 100, 0.65)',
    'border-radius: 4px',
    'padding: 2px 5px',
    'white-space: nowrap',
    'pointer-events: none',
    'text-shadow: 0 1px 2px rgba(0,0,0,0.8)',
  ].join(';');

  const label = new CSS2DObject(element);
  label.name = `NON_PRIMITIVE_SUPPORT_LABEL_${safeName(record?.tag)}_${safeName(record?.kind)}`;
  const offset = Number(glyphSize) > 0 ? Number(glyphSize) * 0.85 : 16;
  if (THREE?.Vector3 && label.position?.copy) {
    label.position.copy(origin.clone().add(new THREE.Vector3(0, offset, 0)));
  } else if (label.position?.set) {
    label.position.set(0, offset, 0);
  }
  label.userData = {
    schema,
    labelSchema: SUPPORT_OVERLAY_LABEL_SCHEMA,
    nonPrimitiveSupportOverlay: true,
    supportOverlayOnly: true,
    supportOverlayLabel: true,
    supportKind: record?.kind,
    supportTag: record?.tag,
    sourceKind,
    sourceFile,
    pickable: false,
    selectable: false,
  };
  return label;
}

function sanitizeLabelToken(value) {
  const text = String(value || '')
    .replace(/\bRVM\s+(?:CYLINDER|BOX|PYRAMID|SPHERE|PRIM)\b/gi, '')
    .replace(/\bINPUTXML-\d+-(?:GUIDE|REST|LINESTOP|LIMIT|LIM)\b/gi, '')
    .replace(/[^A-Za-z0-9_.:/#-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return text || 'SUPPORT';
}

function safeName(value) {
  return String(value || 'SUPPORT').replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 80);
}
