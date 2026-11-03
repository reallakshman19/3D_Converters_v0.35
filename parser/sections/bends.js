/**
 * bends.js — Parse #$ BEND section of CAESAR II neutral file.
 *
 * Format: each bend is described by a block of numeric rows.
 * Key values (approximate positional mapping for CAESAR II v11 neutral):
 *   Col 0: element index (1-based, matches ELEMENTS order)
 *   Col 1: bend radius (same length units as elements)
 *   Col 2: wall thickness (redundant with element data)
 *   Col 3: bend angle (degrees, 0 = not specified, use geometry)
 *   Col 4: SIF in-plane
 *   Col 5: SIF out-plane
 *
 * Multiple rows per bend are common; we capture radius per element index.
 */

export function parseBends(lines, log) {
  const bends = [];
  const dataLines = lines.filter(l => l.trim() && !l.trim().startsWith('*'));

  let i = 0;
  while (i < dataLines.length) {
    const parts = dataLines[i].trim().split(/\s+/).map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const bend = {
        elementIndex: Math.round(parts[0]) - 1, // 0-based element index
        radius: parts[1] || 0,
        wallThick: parts[2] || 0,
        angle: parts[3] || 90, // default 90°
        sifIn: parts[4] || 1,
        sifOut: parts[5] || 1,
      };
      bends.push(bend);
    }
    i++;
  }

  log.push({ level: 'INFO', msg: `BEND: ${bends.length} bend(s) parsed` });
  return bends;
}
