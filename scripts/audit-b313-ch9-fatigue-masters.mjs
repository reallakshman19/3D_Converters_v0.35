import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChapterIxFatigueMasterBundle } from '../converters/b313-chapter-ix/fatigue-master-resolver.js';

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.replace(/\r/g, '').length; i += 1) {
    const source = text.replace(/\r/g, '');
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((item) => item.some((value) => String(value).length));
  if (!clean.length) return [];
  const headers = clean[0].map((value) => String(value).trim());
  return clean.slice(1).map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] ?? ''])));
}

function readRows(directory, name, optional = false) {
  const filePath = path.join(directory, name);
  if (optional && !fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

export function auditChapterIxFatigueMasterDirectory(directory, methodId, spectrumId = null) {
  const masters = {
    methods: readRows(directory, 'method_manifest.csv'),
    routes: readRows(directory, 'fatigue_route.csv'),
    curves: readRows(directory, 'fatigue_curve.csv'),
    curvePoints: readRows(directory, 'fatigue_curve_point.csv'),
    spectra: readRows(directory, 'cycle_spectrum.csv', true),
    states: readRows(directory, 'operating_state.csv', true),
    transitions: readRows(directory, 'cycle_transition.csv', true),
  };
  return resolveChapterIxFatigueMasterBundle({ methodId, spectrumId, masters });
}

function main() {
  const [, , directory, methodId, spectrumId] = process.argv;
  if (!directory || !methodId) {
    console.error('Usage: node scripts/audit-b313-ch9-fatigue-masters.mjs <High-Pr-dir> <method-id> [spectrum-id]');
    process.exitCode = 1;
    return;
  }
  try {
    const result = auditChapterIxFatigueMasterDirectory(directory, methodId, spectrumId ?? null);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok && result.bundleState === 'SYNTHETIC_REFERENCE_READY' ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: 'FATIGUE_MASTER_AUDIT_FAILED', message: error.message }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
