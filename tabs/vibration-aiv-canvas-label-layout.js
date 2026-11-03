export const AIV_CANVAS_SEMANTIC_LEVEL = Object.freeze({ DETAILED: 'DETAILED', COMPACT: 'COMPACT', OVERVIEW: 'OVERVIEW' });

function finite(value, fallback = 0) {
  const number = Number(value); return Number.isFinite(number) ? number : fallback;
}
function rect(value = {}) {
  const left = finite(value.left); const top = finite(value.top); const width = Math.max(0, finite(value.width)); const height = Math.max(0, finite(value.height));
  return { left, top, right: left + width, bottom: top + height, width, height };
}
function shifted(value, dx, dy) {
  const source = rect(value); return { ...source, left: source.left + dx, right: source.right + dx, top: source.top + dy, bottom: source.bottom + dy };
}
function overlapArea(aValue, bValue, gap = 4) {
  const a = rect(aValue); const b = rect(bValue);
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= -gap || height <= -gap) return 0;
  return Math.max(0, width + gap) * Math.max(0, height + gap);
}
function candidates(step) {
  return [[0, 0], [0, -step], [0, step], [step, 0], [-step, 0],
    [step, -step], [-step, -step], [step, step], [-step, step],
    [0, -step * 2], [0, step * 2], [step * 2, 0], [-step * 2, 0]];
}
function score(candidate, obstacles, accepted, gap) {
  return [...obstacles, ...accepted].reduce((sum, item) => sum + overlapArea(candidate, item, gap), 0);
}

export function aivCanvasSemanticLevel(zoomValue) {
  const zoom = finite(zoomValue, 1);
  if (zoom < 0.55) return AIV_CANVAS_SEMANTIC_LEVEL.OVERVIEW;
  if (zoom < 0.85) return AIV_CANVAS_SEMANTIC_LEVEL.COMPACT;
  return AIV_CANVAS_SEMANTIC_LEVEL.DETAILED;
}

export function resolveAivCanvasLabelPlacements(items = [], obstacles = [], options = {}) {
  const step = Math.max(8, finite(options.step, 18)); const gap = Math.max(0, finite(options.gap, 4));
  const ordered = [...items].sort((a, b) => finite(b.priority) - finite(a.priority) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
  const accepted = []; const results = new Map(); const choices = candidates(step);
  for (const item of ordered) {
    const base = rect(item.rect); let best = null;
    for (const [dx, dy] of choices) {
      const candidate = shifted(base, dx, dy); const value = score(candidate, obstacles, accepted, gap);
      if (!best || value < best.score - 1e-9 || (Math.abs(value - best.score) <= 1e-9 && Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy))) {
        best = { dx, dy, score: value, rect: candidate };
      }
      if (value === 0) break;
    }
    accepted.push(best.rect); results.set(String(item.id), Object.freeze({ dx: best.dx, dy: best.dy, crowded: best.score > 0 }));
  }
  return Object.freeze(items.map((item) => Object.freeze({ id: String(item.id), ...(results.get(String(item.id)) ?? { dx: 0, dy: 0, crowded: false }) })));
}
