/**
 * forces.js — Parse #$ FORCMNT section of CAESAR II neutral file.
 *
 * Format: each force/moment application:
 *   node  fx  fy  fz  mx  my  mz  (load_case_index)
 *
 * Multiple rows may exist per node (different load cases).
 */

export function parseForces(lines, log) {
  const forces = [];
  const dataLines = lines.filter(l => l.trim() && !l.trim().startsWith('*'));

  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/).map(Number);
    if (parts.length < 2 || isNaN(parts[0])) continue;

    const node = Math.round(parts[0]);
    forces.push({
      node,
      fx: parts[1] ?? 0,
      fy: parts[2] ?? 0,
      fz: parts[3] ?? 0,
      mx: parts[4] ?? 0,
      my: parts[5] ?? 0,
      mz: parts[6] ?? 0,
      loadCaseIdx: Math.round(parts[7] ?? 1),
    });
  }

  // Merge rows for same node (combine components — typically one load vector per node)
  const byNode = new Map();
  for (const f of forces) {
    if (!byNode.has(f.node)) byNode.set(f.node, { ...f });
    else {
      // If multiple rows for same node, keep the largest magnitude
      const existing = byNode.get(f.node);
      const existMag = Math.hypot(existing.fx, existing.fy, existing.fz);
      const newMag   = Math.hypot(f.fx, f.fy, f.fz);
      if (newMag > existMag) byNode.set(f.node, { ...f });
    }
  }

  const merged = [...byNode.values()];
  log.push({ level: 'INFO', msg: `FORCMNT: ${merged.length} node(s) with applied loads (Fy dominant: ${merged.filter(f => Math.abs(f.fy) > 0).length})` });
  return merged;
}
