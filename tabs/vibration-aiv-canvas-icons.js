const NODE_GLYPHS = Object.freeze({
  RELIEF_VALVE: '<circle r="24" class="aiv-canvas-node-shape"></circle><path d="M-12 5 L0 -9 L12 5 Z M0 -9 V-18 M-7 11 H7" class="aiv-canvas-node-detail"></path>',
  CONTROL_VALVE: '<circle r="24" class="aiv-canvas-node-shape"></circle><path d="M-13 -8 L0 0 L-13 8 Z M13 -8 L0 0 L13 8 Z M0 -1 V-15 M-7 -15 H7" class="aiv-canvas-node-detail"></path>',
  RESTRICTION_ORIFICE: '<circle r="24" class="aiv-canvas-node-shape"></circle><path d="M-15 0 H-5 M5 0 H15 M-5 -14 V14 M5 -14 V14" class="aiv-canvas-node-detail"></path>',
  PRESSURE_REDUCING_DEVICE: '<circle r="24" class="aiv-canvas-node-shape"></circle><path d="M-13 0 L0 -11 L13 0 L0 11 Z M-8 0 H8 M4 -4 L8 0 L4 4" class="aiv-canvas-node-detail"></path>',
  UNKNOWN_SOURCE: '<circle r="24" class="aiv-canvas-node-shape"></circle><text class="aiv-canvas-node-glyph-text" text-anchor="middle" y="6">?</text>',
  WELDOLET: '<rect x="-22" y="-22" width="44" height="44" rx="6" class="aiv-canvas-node-shape"></rect><path d="M-15 7 H15 M0 7 V-13 M-7 -13 H7" class="aiv-canvas-node-detail"></path>',
  WELDED_TEE: '<rect x="-22" y="-22" width="44" height="44" rx="6" class="aiv-canvas-node-shape"></rect><path d="M-15 -9 H15 M0 -9 V15" class="aiv-canvas-node-detail"></path>',
  WELDED_SUPPORT: '<rect x="-22" y="-22" width="44" height="44" rx="6" class="aiv-canvas-node-shape"></rect><path d="M-14 -4 H14 M-9 -4 V11 M9 -4 V11 M-15 11 H15" class="aiv-canvas-node-detail"></path>',
  OTHER_WELDED_DISCONTINUITY: '<rect x="-22" y="-22" width="44" height="44" rx="6" class="aiv-canvas-node-shape"></rect><path d="M-12 -12 L12 12 M12 -12 L-12 12" class="aiv-canvas-node-detail"></path>',
  UNKNOWN_ASSESSMENT: '<rect x="-22" y="-22" width="44" height="44" rx="6" class="aiv-canvas-node-shape"></rect><text class="aiv-canvas-node-glyph-text" text-anchor="middle" y="6">?</text>',
  PIPE_PATH: '<rect x="-24" y="-9" width="48" height="18" rx="9" class="aiv-canvas-node-shape"></rect><path d="M-17 0 H17" class="aiv-canvas-node-detail"></path>',
  JUNCTION: '<circle r="15" class="aiv-canvas-node-shape"></circle><path d="M-22 0 H22 M0 0 V-22" class="aiv-canvas-node-detail"></path>',
  CONNECTION_NODE: '<circle r="10" class="aiv-canvas-node-shape"></circle><circle r="3" class="aiv-canvas-node-detail"></circle>',
  OFF_PAGE: '<path d="M-25 -15 H10 L25 0 L10 15 H-25 Z" class="aiv-canvas-node-shape"></path><path d="M-13 0 H12 M7 -5 L12 0 L7 5" class="aiv-canvas-node-detail"></path>',
  BOUNDARY: '<rect x="-27" y="-20" width="54" height="40" rx="12" class="aiv-canvas-node-shape"></rect><path d="M-16 0 H16" class="aiv-canvas-node-detail"></path>',
});

const STATUS = Object.freeze({
  ACTIVE: { symbol: '●', label: 'Active source' },
  CLOSED: { symbol: '×', label: 'Closed source' },
  SONIC: { symbol: 'S', label: 'Sonic' },
  NON_SONIC: { symbol: 'N', label: 'Non-sonic' },
  TRIMMED: { symbol: 'T', label: 'Low-noise trim applied' },
  APPLICABLE: { symbol: '✓', label: 'Applicable relationship' },
  NOT_APPLICABLE: { symbol: '—', label: 'Not-applicable relationship' },
  UNRESOLVED: { symbol: '?', label: 'Unresolved' },
  ASSUMPTION: { symbol: 'A', label: 'Assumption present' },
  WARNING: { symbol: '!', label: 'Warning' },
  INPUT_INCOMPLETE: { symbol: '…', label: 'Input incomplete' },
  RESULT_AVAILABLE: { symbol: 'R', label: 'Screening result available' },
  TRACE_AVAILABLE: { symbol: 'P', label: 'Provenance / trace available' },
});

function glyphKey(node = {}) {
  const key = String(node.iconType ?? '').trim();
  if (NODE_GLYPHS[key]) return key;
  if (node.nodeKind === 'SOURCE') return 'UNKNOWN_SOURCE';
  if (node.nodeKind === 'ASSESSMENT') return 'UNKNOWN_ASSESSMENT';
  if (node.nodeKind === 'BOUNDARY') return 'BOUNDARY';
  return 'PIPE_PATH';
}

export function renderAivCanvasNodeGlyph(node = {}) {
  const key = glyphKey(node);
  return `<g class="aiv-canvas-engineering-glyph" data-aiv-icon-type="${key}"><title>${key}</title>${NODE_GLYPHS[key]}</g>`;
}

export function renderAivCanvasStatusGlyphs(statusGlyphs = []) {
  const unique = [...new Set(statusGlyphs)].filter((key) => STATUS[key]).slice(0, 7);
  return unique.map((key, index) => {
    const item = STATUS[key];
    const x = -30 + index * 10;
    return `<g class="aiv-canvas-status-glyph is-${key.toLowerCase()}" data-aiv-status-glyph="${key}" transform="translate(${x} -31)"><title>${item.label}</title><circle r="5"></circle><text text-anchor="middle" y="3">${item.symbol}</text></g>`;
  }).join('');
}
