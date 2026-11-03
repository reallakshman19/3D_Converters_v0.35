/**
 * validator.js — Input validation gates for CAESAR II neutral file parsing.
 *
 * Gates (in order):
 * 1. File type: extension must be .accdb or .ACCDB
 * 2. Encoding: must be readable as text (no binary null bytes)
 * 3. Section presence: at least #$ ELEMENTS must exist
 * 4. Node uniqueness: warn on duplicate from/to pairs
 * 5. Geometry: OD > 0, wall < OD/2, length > 0
 * 6. Physical ranges: T1 in [-273, 1500], P1 >= 0, density > 0
 * 7. Connectivity: BFS from first node — all nodes reachable
 * 8. Branch detection: non-sequential node refs → mark as branch
 */

/**
 * Validate file metadata (before parsing).
 * @param {string} fileName
 * @param {string} rawText
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateFile(fileName, rawText) {
  const errors = [];
  const warnings = [];

  // Gate 1: File type
  if (!/\.(accdb|xml|pdf)$/i.test(fileName)) {
    errors.push(`File type: expected .accdb, .xml, or .pdf extension, got "${fileName}"`);
  }

  // Gate 2: Encoding — detect binary null bytes (skip for PDF as they might naturally contain some if not clean parsed, though parser usually receives text)
  if (rawText.includes('\u0000') && !/\.pdf$/i.test(fileName)) {
    errors.push('File encoding: binary data detected — this does not appear to be a CAESAR II neutral text file');
  }

  // Note: section-presence checks (#$ ELEMENTS, VERSION, etc.) are format-specific
  // and run after format detection in caesar-parser.js, not here.

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate parsed element data.
 * @param {object[]} elements
 * @param {object} nodes  node_id -> {x,y,z}
 * @returns {{errors: object[], warnings: object[]}}
 */
export function validateElements(elements, nodes) {
  const errors = [];
  const warnings = [];

  // Gate 4: Node uniqueness (from/to pair uniqueness)
  const pairSet = new Set();
  for (const el of elements) {
    const key = `${el.from}-${el.to}`;
    if (pairSet.has(key)) {
      warnings.push({ level: 'WARN', msg: `Duplicate element pair: ${el.from}→${el.to} at index ${el.index}` });
    }
    pairSet.add(key);
  }

  for (const el of elements) {
    // Gate 5: Geometry sanity
    if (el.od <= 0) {
      errors.push({ level: 'ERROR', msg: `Element ${el.from}→${el.to}: OD = ${el.od} (must be > 0) — DIAMETER attribute absent and no previous element to inherit from`, elementIndex: el.index });
    }
    if (el.wall > 0 && el.wall >= el.od / 2) {
      errors.push({ level: 'ERROR', msg: `Element ${el.from}→${el.to}: wall thickness ${el.wall} ≥ OD/2 (${el.od / 2})`, elementIndex: el.index });
    }
    if (el.length < 0.1) {
      warnings.push({ level: 'WARN', msg: `Element ${el.from}→${el.to}: zero-length element (${el.length.toFixed(1)} mm)`, elementIndex: el.index });
    }

    // Gate 6: Physical ranges
    if (el.T1 !== 0 && (el.T1 < -273 || el.T1 > 1500)) {
      warnings.push({ level: 'WARN', msg: `Element ${el.from}→${el.to}: T1 = ${el.T1}°C — outside expected range [-273, 1500]`, elementIndex: el.index });
    }
    if (el.P1 < 0) {
      warnings.push({ level: 'WARN', msg: `Element ${el.from}→${el.to}: P1 = ${el.P1} — negative pressure`, elementIndex: el.index });
    }
    if (el.density < 0) {
      warnings.push({ level: 'WARN', msg: `Element ${el.from}→${el.to}: density = ${el.density} — negative value`, elementIndex: el.index });
    }
  }

  // Gate 7: Connectivity — BFS from first node
  if (elements.length > 0) {
    const graph = new Map();
    for (const el of elements) {
      if (!graph.has(el.from)) graph.set(el.from, []);
      if (!graph.has(el.to)) graph.set(el.to, []);
      graph.get(el.from).push(el.to);
      graph.get(el.to).push(el.from);
    }

    const firstNode = elements[0].from;
    const visited = new Set([firstNode]);
    const queue = [firstNode];
    while (queue.length) {
      const n = queue.shift();
      for (const neighbour of (graph.get(n) ?? [])) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    const allNodes = new Set(Object.keys(nodes).map(Number));
    const orphans = [...allNodes].filter(n => !visited.has(n));
    if (orphans.length) {
      warnings.push({ level: 'WARN', msg: `Connectivity: ${orphans.length} orphan node(s) not reachable from node ${firstNode}: ${orphans.join(', ')}` });
    } else {
      // no-op — will log OK in main parser
    }
  }

  return { errors, warnings };
}

/**
 * Summarise validation results into a banner status.
 * @param {string[]} fileErrors
 * @param {object[]} elementErrors  [{level, msg}]
 * @param {object[]} elementWarnings
 * @returns {{ status: 'OK'|'WARN'|'ERROR', summary: string }}
 */
export function summarise(fileErrors, elementErrors, elementWarnings) {
  if (fileErrors.length || elementErrors.length) {
    return {
      status: 'ERROR',
      summary: `${fileErrors.length + elementErrors.length} error(s), ${elementWarnings.length} warning(s)`,
    };
  }
  if (elementWarnings.length) {
    return {
      status: 'WARN',
      summary: `0 errors, ${elementWarnings.length} warning(s) — review Debug tab`,
    };
  }
  return { status: 'OK', summary: 'File parsed · 0 errors' };
}
