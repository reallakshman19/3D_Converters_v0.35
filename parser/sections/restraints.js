/**
 * restraints.js — Parse #$ RESTRANT section of CAESAR II neutral file.
 *
 * Format (CAESAR II v11 neutral):
 *   Each restraint block: node, direction_code, stiffness, gap, friction, ...
 *
 * Direction codes (CAESAR II):
 *   1=X, 2=Y, 3=Z, 4=RX, 5=RY, 6=RZ
 *   Multiple rows per node indicate multiple restraint directions.
 *
 * We group rows by node and determine type:
 *   All 6 DOF → Anchor
 *   Y only → +Y (gravity support)
 *   X+Z (no vertical) → Guide
 *   Single dir → Restraint
 */

const DOF_NAME = { 1: 'X', 2: 'Y', 3: 'Z', 4: 'RX', 5: 'RY', 6: 'RZ' };

function classifyType(dofs) {
  const s = new Set(dofs);
  if (s.size >= 6) return 'Anchor';
  if (dofs.includes(2) && dofs.length === 1) return '+Y Support';
  if (dofs.includes(1) && dofs.includes(3) && !dofs.includes(2)) return 'Guide (X+Z)';
  if (dofs.length === 1) return `${DOF_NAME[dofs[0]] || dofs[0]} Restraint`;
  if (s.size >= 3) return 'Anchor';
  return `Guide (${dofs.map(d => DOF_NAME[d] || d).join('+')})`;
}

export function parseRestraints(lines, log) {
  const restraints = [];
  const dataLines = lines.filter(l => l.trim() && !l.trim().startsWith('*'));

  // Accumulate by node
  const byNode = new Map();

  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/).map(Number);
    if (parts.length < 2 || isNaN(parts[0])) continue;

    const node = Math.round(parts[0]);
    const dir = Math.round(parts[1]);
    const stiffness = parts[2] ?? 0;

    if (!byNode.has(node)) byNode.set(node, { node, dofs: [], stiffness: 0, rows: [] });
    const entry = byNode.get(node);
    if (dir > 0) entry.dofs.push(dir);
    entry.stiffness = Math.max(entry.stiffness, stiffness);
    entry.rows.push(parts);
  }

  for (const [, entry] of byNode) {
    entry.type = classifyType(entry.dofs);
    entry.isAnchor = entry.type === 'Anchor';
    restraints.push(entry);
  }

  log.push({ level: 'INFO', msg: `RESTRANT: ${restraints.length} restraint node(s) — ${restraints.filter(r => r.isAnchor).length} anchor(s)` });
  return restraints;
}
