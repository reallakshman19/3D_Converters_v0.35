const ICONS = Object.freeze({
  navigate: '<path d="M12 2v20M2 12h20"/><path d="m12 2-3 3m3-3 3 3M22 12l-3-3m3 3-3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3"/>',
  relationships: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.4 7.1 10.7 16M16.6 7.1 13.3 16M7.5 6h9"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M10.5 7.5v6m-3-3h6"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6"/>',
  reset: '<path d="M4 7V3m0 0h4M4 3l3.1 3.1A8 8 0 1 1 4.6 15"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><path d="M8 12h8"/>',
  tidy: '<path d="M4 6h7M4 12h11M4 18h15"/><circle cx="15" cy="6" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="23" cy="18" r="2"/>',
  export: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 18v3h14v-3"/>',
  labels: '<path d="M4 5v6l8 8 7-7-8-8H5a1 1 0 0 0-1 1Z"/><circle cx="8" cy="8" r="1"/>',
  normal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v3m0 10v3M4 12h3m10 0h3"/>',
  process: '<path d="M4 6h11m0 0-3-3m3 3-3 3M20 18H9m0 0 3-3m-3 3 3 3"/>',
  geometry: '<path d="M4 19 11 5l9 14H4Z"/><circle cx="11" cy="5" r="1"/><circle cx="4" cy="19" r="1"/><circle cx="20" cy="19" r="1"/>',
  results: '<path d="M4 20V11h4v9H4Zm6 0V5h4v15h-4Zm6 0v-7h4v7h-4Z"/>',
  completeness: '<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-7"/>',
});

function point(value) {
  const x = Number(value?.x); const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
function finiteOffset(value, fallback) {
  const number = Number(value); return Number.isFinite(number) ? number : fallback;
}
function orientedNormal(from, to) {
  let dx = to.x - from.x; let dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return null;
  if (dx < 0 || (Math.abs(dx) <= 1e-12 && dy < 0)) { dx = -dx; dy = -dy; }
  return { nx: -dy / length, ny: dx / length, length };
}
function offsetAnchor(anchor, from, to, options = {}) {
  const normal = orientedNormal(from, to);
  const offset = finiteOffset(options.offset, 16); const side = finiteOffset(options.side, 1) < 0 ? -1 : 1;
  if (!normal) return { x: anchor.x, y: anchor.y - side * offset };
  return { x: anchor.x + side * offset * normal.nx, y: anchor.y + side * offset * normal.ny };
}

/** Presentation-only SVG label placement. It never defines or infers engineering distance. */
export function aivCanvasLineLabelAnchor(fromValue, toValue, options = {}) {
  const from = point(fromValue); const to = point(toValue);
  if (!from || !to) return null;
  return offsetAnchor({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, from, to, options);
}

/** Uses rendered path arclength only to choose a visual label station; engineering path length remains external evidence. */
export function aivCanvasPathLabelAnchor(segmentValues, options = {}) {
  const segments = (segmentValues ?? []).map((item) => {
    const from = point(item?.from); const to = point(item?.to);
    if (!from || !to) return null;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return length > 1e-9 ? { from, to, length } : null;
  }).filter(Boolean);
  if (!segments.length) return null;
  const total = segments.reduce((sum, item) => sum + item.length, 0); const target = total / 2;
  let covered = 0;
  for (const segment of segments) {
    if (covered + segment.length + 1e-12 < target) { covered += segment.length; continue; }
    const t = Math.max(0, Math.min(1, (target - covered) / segment.length));
    const anchor = { x: segment.from.x + (segment.to.x - segment.from.x) * t, y: segment.from.y + (segment.to.y - segment.from.y) * t };
    return offsetAnchor(anchor, segment.from, segment.to, options);
  }
  const last = segments.at(-1);
  return offsetAnchor(last.to, last.from, last.to, options);
}

export function renderAivCanvasControlIcon(name) {
  const body = ICONS[name];
  if (!body) throw new TypeError(`Unknown AIV canvas control icon ${String(name)}`);
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
