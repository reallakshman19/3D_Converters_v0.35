/**
 * Functionality: groups unresolved records into structured patterns
 * for the Resolution Override Matrix UI.
 *   Rating     → by piping class (deduplicated from SPRE path)
 *   Wall+Corr  → by piping class + bore (combined tab)
 *   Restraint  → by support kind
 *   Weight     → by component type + bore
 * Parameters: explicit. Outputs: plain objects. Pure.
 */

// ─── Piping class extraction ─────────────────────────────────────

/**
 * Extract the MDB / piping class segment from a full SPRE path.
 * /31441C4r01-AMF1/E90B-150  →  "31441C4r01-AMF1"
 * /HOLD-300#/GKSW-100        →  "HOLD-300#"
 * /MDS/PIPE-REST.6-PMP       →  "MDS"
 */
export function extractPipingClass(spre) {
  const parts = String(spre || '').replace(/^\/+/, '').split('/');
  return parts.length >= 2 ? parts.slice(0, -1).join('/') : (parts[0] || '(unknown)');
}

/** Pick the best SPRE-like attribute from an attrs object. */
function bestSpre(attrs) {
  return attrs?.SPRE || attrs?.ISPE || attrs?.LSTU || '';
}

// ─── Matrix builder ──────────────────────────────────────────────

/**
 * Build override matrix grouped by patterns.
 * @param {EnrichedRecord[]} records
 * @returns {OverrideMatrix}
 */
export function buildOverrideMatrix(records) {
  const pipClass  = new Map(); // cls → { cls, ratingCount, bores: Map(bore → { bore, wallCount, corrCount }) }
  const restraint = new Map(); // kind → PatternRow
  const weight    = new Map(); // "type|bore" → PatternRow

  for (const rec of records) {
    const res   = rec.resolved || {};
    const spre  = bestSpre(rec.attrs);
    const cls   = extractPipingClass(spre);
    const bore  = rec.boreMm || 0;

    const noRating = res.ratingConfidence === 'NONE';
    const noWall   = res.wallConfidence === 'NONE';
    const noCorr   = res.corrConfidence === 'LOW';

    if (noRating || noWall || noCorr) {
      let clsNode = pipClass.get(cls);
      if (!clsNode) {
        clsNode = { cls, ratingCount: 0, bores: new Map() };
        pipClass.set(cls, clsNode);
      }
      if (noRating) clsNode.ratingCount++;

      if (noWall || noCorr) {
        let boreNode = clsNode.bores.get(bore);
        if (!boreNode) {
          boreNode = { bore, wallCount: 0, corrCount: 0 };
          clsNode.bores.set(bore, boreNode);
        }
        if (noWall) boreNode.wallCount++;
        if (noCorr) boreNode.corrCount++;
      }
    }

    // Restraint: group by support kind token
    if (rec.isSupport && res.restraint?.confidence === 'NONE') {
      const kind = rec.attrs?.SUPPORT_KIND || rec.supportKind || '(blank)';
      const row = restraint.get(kind) || { key: kind, count: 0, sample: kind };
      row.count++;
      restraint.set(kind, row);
    }

    // Weight: group by component type + bore
    if (res.weightConfidence === 'NONE' && isRigidType(rec.componentType)) {
      const key = `${rec.componentType}|${bore}`;
      const row = weight.get(key) || { key, count: 0, type: rec.componentType, boreMm: bore };
      row.count++;
      weight.set(key, row);
    }
  }

  return {
    pipClass:  [...pipClass.values()].sort((a, b) => a.cls.localeCompare(b.cls)),
    restraint: sortBy(restraint),
    weight:    sortBy(weight),
  };
}

// ─── Config patcher ──────────────────────────────────────────────

/**
 * Apply user overrides to a config, returning a new config.
 * Stores class-level and class+bore-level override maps.
 */
export function applyOverridesToConfig(baseConfig, overrides = {}) {
  const cfg = JSON.parse(JSON.stringify(baseConfig));

  // Rating: { "31441C4r01-AMF1": 300, ... }
  if (overrides.rating) {
    cfg.classRatingOverrides = {};
    for (const [cls, val] of Object.entries(overrides.rating)) {
      if (val !== '' && Number.isFinite(Number(val))) {
        cfg.classRatingOverrides[cls] = Number(val);
      }
    }
  }

  // Wall: { "31441C4r01-AMF1||50": "Sch 40", ... }
  if (overrides.wall) {
    cfg.classWallOverrides = {};
    for (const [key, val] of Object.entries(overrides.wall)) {
      if (val) cfg.classWallOverrides[key] = val;
    }
  }

  // Corrosion: { "31441C4r01-AMF1||50": 1.5, ... }
  if (overrides.corr) {
    cfg.classCorrOverrides = {};
    for (const [key, val] of Object.entries(overrides.corr)) {
      if (val !== '' && Number.isFinite(Number(val))) {
        cfg.classCorrOverrides[key] = Number(val);
      }
    }
  }

  // Restraint: { kind → typeCode }
  if (overrides.restraint) {
    cfg.restraintKindOverrides = { ...(cfg.restraintKindOverrides || {}), ...overrides.restraint };
  }

  // Weight: { "type|bore" → kg }
  if (overrides.weight) {
    cfg.weightKgOverrides = { ...(cfg.weightKgOverrides || {}), ...overrides.weight };
  }

  return cfg;
}

// ─── Helpers ─────────────────────────────────────────────────────

function sortBy(map) {
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function isRigidType(t) {
  return ['VALV', 'FLAN', 'GASK'].includes(String(t || '').toUpperCase());
}
