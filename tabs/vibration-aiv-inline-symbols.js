const SOURCE_REVISION = '6463b39866f68eb6476bfa41764538eb19f8b9f9';

/**
 * Read-only AIV table glyph subset adapted from the engineering symbol language in:
 * reallaksh19/Advanced_Analysis @ 6463b39866f68eb6476bfa41764538eb19f8b9f9
 * src/workspace/sequential-sketcher/svg-symbol-factory.js
 *
 * These inline SVG glyphs are presentation only. They do not project coordinates,
 * render model geometry, own topology, or provide calculation/design authority.
 */

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function typeKey(type) {
  const value = String(type ?? '').trim().toUpperCase();
  if (value.includes('RELIEF') || value.includes('PSV')) return 'RELIEF_VALVE';
  if (value.includes('VALV')) return 'VALVE';
  if (value.includes('OLET')) return 'OLET';
  if (value.includes('TEE')) return 'TEE';
  if (value.includes('ELBO') || value.includes('BEND')) return 'BEND';
  if (value.includes('FLAN')) return 'FLANGE';
  if (value.includes('ORIF') || value.includes('RESTRICT')) return 'RESTRICTION';
  if (value.includes('REDUC')) return 'REDUCER';
  if (value.includes('PIPE')) return 'PIPE';
  return 'OTHER';
}

function shape(type) {
  if (type === 'PIPE') return '<line x1="3" y1="12" x2="29" y2="12" />';
  if (type === 'BEND') return '<path d="M3 18 H15 Q24 18 24 9 V4" fill="none" />';
  if (type === 'TEE' || type === 'OLET') return '<path d="M3 12 H29 M16 12 V3" fill="none" /><circle cx="16" cy="12" r="2" />';
  if (type === 'VALVE' || type === 'RELIEF_VALVE') {
    const bonnet = type === 'RELIEF_VALVE' ? '<path d="M16 8 V3 M12 3 H20" />' : '<path d="M16 8 V4 M12 4 H20" />';
    return `<path d="M5 7 L16 12 L5 17 Z M27 7 L16 12 L27 17 Z" fill="none" />${bonnet}`;
  }
  if (type === 'FLANGE') return '<path d="M4 12 H11 M21 12 H28 M12 5 V19 M20 5 V19" />';
  if (type === 'RESTRICTION') return '<path d="M3 12 H12 M20 12 H29 M12 5 L20 12 L12 19 Z" fill="none" />';
  if (type === 'REDUCER') return '<path d="M3 7 H12 L21 10 H29 M3 17 H12 L21 14 H29" fill="none" />';
  return '<circle cx="16" cy="12" r="5" fill="none" />';
}

export function renderAivInlineSymbol(input = {}) {
  const key = typeKey(input.type);
  const role = String(input.role ?? 'PROPAGATION_PATH');
  const label = `${input.type || 'Element'} · ${role}`;
  return `<span class="aiv-inline-symbol" data-aiv-symbol-type="${esc(key)}" data-aiv-symbol-role="${esc(role)}" title="${esc(label)}"><svg width="32" height="24" viewBox="0 0 32 24" role="img" aria-label="${esc(label)}"><g class="aiv-inline-symbol-shape">${shape(key)}</g></svg></span>`;
}

export const AIV_INLINE_SYMBOL_LINEAGE = Object.freeze({
  sourceRepository: 'reallaksh19/Advanced_Analysis',
  sourceRevision: SOURCE_REVISION,
  sourcePath: 'src/workspace/sequential-sketcher/svg-symbol-factory.js',
  adaptation: 'INLINE_TABLE_GLYPHS_ONLY',
  geometryAuthority: false,
});
