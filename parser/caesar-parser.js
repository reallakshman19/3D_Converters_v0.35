/**
 * caesar-parser.js — Auto-detecting CAESAR II file parser.
 *
 * Supports two formats:
 *   1. CAESAR II Neutral text format  (#$ SECTIONS ... ) — e.g. INLET-SEPARATOR-SKID-C2.ACCDB
 *   2. CAESAR II XML format           (<CAESARII ...>)    — e.g. SAMPLE2.ACCDB, RELIEF-FLANGED.ACCDB
 *
 * Usage (client-side, no server):
 *   import { parse } from './caesar-parser.js';
 *   const result = parse(rawText, fileName);
 *
 * Returns:
 *   { elements, nodes, bends, restraints, forces, rigids,
 *     units, meta, log[], errors[], validation, format }
 */

import { parseElements }    from './sections/elements.js';
import { parseBends }       from './sections/bends.js';
import { parseRestraints }  from './sections/restraints.js';
import { parseForces }      from './sections/forces.js';
import { parseUnits }       from './sections/units.js';
import { parseXmlElements } from './sections/xml-elements.js';
import { parsePdfElements } from './pdf-parser.js';
import { validateFile, validateElements, summarise } from './validator.js';

// ── Format detection ──────────────────────────────────────────────────────

function detectFormat(rawText) {
  const head = rawText.slice(0, 1500); // PDF header might be deeper if there are many spaces
  if (head.includes('<CAESARII') || head.includes('<PIPINGMODEL')) return 'XML';
  if (/^#\$\s*(VERSION|ELEMENTS|CONTROL)/m.test(rawText))          return 'NEUTRAL';
  if (rawText.includes('CAESAR II Ver.') || rawText.includes('INPUT LISTING')) return 'PDF';
  return 'UNKNOWN';
}

// ── Neutral format helpers ────────────────────────────────────────────────

function splitSections(text) {
  const sections = new Map();
  const parts = text.split(/^#\$\s*/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const nlIdx = part.indexOf('\n');
    const name  = (nlIdx >= 0 ? part.slice(0, nlIdx) : part).trim().toUpperCase();
    const content = nlIdx >= 0 ? part.slice(nlIdx + 1) : '';
    sections.set(name, content.split('\n'));
  }
  return sections;
}

function parseRigids(lines, log) {
  const rigids = [];
  const dataLines = lines.filter(l => l.trim() && !l.trim().startsWith('*'));
  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/).map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && parts[1] > 0) {
      rigids.push({ node: Math.round(parts[0]), mass: parts[1] });
    }
  }
  if (rigids.length) {
    log.push({ level: 'INFO', msg: `RIGID: ${rigids.length} element(s) — max mass ${Math.max(...rigids.map(r=>r.mass)).toFixed(1)} kg` });
  }
  return rigids;
}

function parseControl(lines, log) {
  const dataLines = lines.filter(l => l.trim() && !l.trim().startsWith('*'));
  // Collect all numbers across all data lines (control block spans multiple lines)
  const allNums = [];
  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
    allNums.push(...parts);
  }
  const meta = {
    numElements:   allNums[0]  ?? 0,
    numNozzles:    allNums[1]  ?? 0,
    numHydro:      allNums[2]  ?? 0,
    numBends:      allNums[3]  ?? 0,
    numRigid:      allNums[4]  ?? 0,
    numExpJoints:  allNums[5]  ?? 0,
    numRestraints: allNums[6]  ?? 0,
    numForces:     allNums[7]  ?? 0,
  };
  log.push({
    level: 'INFO',
    msg: `CONTROL: ${meta.numElements} elements | ${meta.numBends} bends | ${meta.numRigid} rigids | ${meta.numRestraints} restraints | ${meta.numForces} force sets`
  });
  return meta;
}

// ── Neutral format parse ──────────────────────────────────────────────────

function parseNeutral(rawText, log) {
  const sections = splitSections(rawText);
  const foundSections = [...sections.keys()];
  log.push({ level: 'INFO', msg: `Sections found: ${foundSections.join(', ')}` });

  // Log section line counts
  for (const [name, lines] of sections) {
    const nonEmpty = lines.filter(l => l.trim()).length;
    if (nonEmpty > 0) {
      log.push({ level: 'INFO', msg: `  § ${name}: ${nonEmpty} non-empty lines` });
    }
  }

  const meta        = parseControl(sections.get('CONTROL') ?? [], log);
  const units       = parseUnits(sections.get('UNITS') ?? [], log);
  const { elements, nodes } = parseElements(sections.get('ELEMENTS') ?? [], log);
  const bends       = parseBends(sections.get('BEND') ?? [], log);
  const restraints  = parseRestraints(sections.get('RESTRANT') ?? [], log);
  const forces      = parseForces(sections.get('FORCMNT') ?? [], log);
  const rigids      = parseRigids(sections.get('RIGID') ?? [], log);

  // Attach bend flags to elements
  for (const bend of bends) {
    const el = elements[bend.elementIndex];
    if (el) { el.hasBend = true; el.bend = bend; }
  }

  return { elements, nodes, bends, restraints, forces, rigids, units, meta };
}

// ── Main export ───────────────────────────────────────────────────────────

export function parse(rawText, fileName = 'unknown.accdb') {
  const log    = [];
  const errors = [];

  log.push({ level: 'INFO', msg: `File loaded: "${fileName}" | ${rawText.length} chars | ${rawText.split('\n').length} lines` });

  // Gate 1 & 2: file-level validation
  const fileVal = validateFile(fileName, rawText);
  for (const e of fileVal.errors)   errors.push({ level: 'ERROR', msg: e });
  for (const w of fileVal.warnings) log.push({ level: 'WARN',  msg: w });

  // Format detection
  const format = detectFormat(rawText);
  log.push({ level: 'INFO', msg: `Format detected: ${format}` });

  if (format === 'UNKNOWN') {
    errors.push({ level: 'ERROR', msg: 'Unknown file format — expected CAESAR II neutral text (#$ ELEMENTS) or XML (<CAESARII>/<PIPINGMODEL>) or PDF (INPUT LISTING)' });
    if (rawText.includes('\u0000')) {
      errors.push({ level: 'ERROR', msg: 'Binary data detected — this appears to be a binary .accdb database, not a CAESAR II text export' });
    }
    return { elements: [], nodes: {}, bends: [], restraints: [], forces: [], rigids: [],
             units: {}, meta: {}, log, errors, format,
             validation: { status: 'ERROR', summary: 'Unrecognised format — not a CAESAR II export' } };
  }

  // Format-specific section-presence check (neutral only)
  if (format === 'NEUTRAL' && !/^#\$\s*ELEMENTS/mi.test(rawText)) {
    errors.push({ level: 'ERROR', msg: 'NEUTRAL format detected but #$ ELEMENTS section not found — file may be truncated or use an unsupported CAESAR II version' });
  }

  let data;
  if (format === 'XML') {
    log.push({ level: 'INFO', msg: 'Parsing as CAESARII XML format...' });
    const xmlData = parseXmlElements(rawText, log);
    data = { ...xmlData, units: {}, meta: {} };
  } else if (format === 'PDF') {
    log.push({ level: 'INFO', msg: 'Parsing as CAESARII PDF format...' });
    data = parsePdfElements(rawText, fileName, log);
  } else {
    log.push({ level: 'INFO', msg: 'Parsing as CAESAR II neutral text format...' });
    data = parseNeutral(rawText, log);
  }

  // Propagate extracted stresses/displacements from binary ACCDB if available
  if (globalThis.__tempParsedAccdbPayload) {
      if (globalThis.__tempParsedAccdbPayload.stresses) data.stresses = globalThis.__tempParsedAccdbPayload.stresses;
      if (globalThis.__tempParsedAccdbPayload.displacements) data.displacements = globalThis.__tempParsedAccdbPayload.displacements;
  }

  const { elements, nodes, bends, restraints, forces, rigids, units, meta } = data;

  // Gate 4–7: element-level validation
  const elVal = validateElements(elements, nodes);
  for (const e of elVal.errors)   errors.push(e);
  for (const w of elVal.warnings) log.push(w);

  // Connectivity BFS
  if (elements.length > 0) {
    const graph = new Map();
    for (const el of elements) {
      (graph.get(el.from) ?? graph.set(el.from, []).get(el.from)).push(el.to);
      (graph.get(el.to)   ?? graph.set(el.to,   []).get(el.to)).push(el.from);
    }
    const firstNode = elements[0].from;
    const visited = new Set([firstNode]);
    const queue = [firstNode];
    while (queue.length) {
      const n = queue.shift();
      for (const nb of (graph.get(n) ?? [])) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    const allNodeIds = Object.keys(nodes).map(Number);
    const orphans = allNodeIds.filter(n => !visited.has(n));
    if (orphans.length === 0) {
      log.push({ level: 'OK', msg: `Connectivity: all ${allNodeIds.length} nodes reachable from node ${firstNode}` });
    } else {
      log.push({ level: 'WARN', msg: `Connectivity: ${orphans.length} orphan node(s): ${orphans.join(', ')}` });
    }
  }

  // Log which report sections are populated
  log.push({ level: 'INFO', msg: '── Report sections populated from parsed data ──' });
  log.push({ level: elements.length   ? 'OK' : 'WARN', msg: `Pipe Properties table: ${elements.length} rows (Input Data tab)` });
  log.push({ level: forces.length     ? 'OK' : 'INFO', msg: `Applied Loads: ${forces.length} load node(s) (Input Data tab)` });
  log.push({ level: bends.length      ? 'OK' : 'INFO', msg: `Bends: ${bends.length} (Geometry tab)` });
  log.push({ level: restraints.length ? 'OK' : 'INFO', msg: `Restraints/Supports: ${restraints.length} (Geometry tab)` });
  log.push({ level: rigids.length     ? 'OK' : 'INFO', msg: `Rigid elements: ${rigids.length} (Basis card — max mass)` });
  log.push({ level: 'INFO', msg: 'Stress Compliance table: static (from PDF report data)' });
  log.push({ level: 'INFO', msg: 'Displacement table: static (from PDF report data)' });
  log.push({ level: 'INFO', msg: 'Nozzle loads, Supports, Flanges: static (from PDF report data)' });

  const validation = summarise(fileVal.errors, elVal.errors, elVal.warnings);
  log.push({ level: validation.status, msg: `Validation result: ${validation.summary}` });

  return { elements, nodes, bends, restraints, forces, rigids, units, meta, log, errors, validation, format };
}
