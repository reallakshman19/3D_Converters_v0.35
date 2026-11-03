#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'docs', 'Masters', 'NPS_OD_BORE_SCHEDULE_MASTER.tsv');
const OUTPUT = path.join(ROOT, 'converters', 'pipe-wall-master', 'default-pipe-wall-master-rows.js');
const SOURCE_BLOB_SHA = '7e83f7283b4ca9f35a86a45c008ca0b52a053fcc';

function render(tsvText) {
  const normalized = tsvText.replace(/\r/g, '').replace(/\n?$/, '\n');
  if (normalized.includes('`') || normalized.includes('${')) {
    throw new Error('Canonical TSV contains template-literal control text; generator needs escaping.');
  }
  return `// Generated from docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv.
// Canonical project-master blob SHA: ${SOURCE_BLOB_SHA}
// Do not hand-edit values here; regenerate from the canonical TSV.

const RAW_TSV = \`${normalized}\`;

export const PIPE_WALL_MASTER_SOURCE = Object.freeze({
  sourcePath: 'docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv',
  sourceBlobSha: '${SOURCE_BLOB_SHA}',
  sourceAuthority: 'PROJECT_MASTER',
  dataStatus: 'PROJECT_MASTER',
  standardEditionStatus: 'NOT_RECORDED_IN_SOURCE',
});

const SCHEDULES = Object.freeze([
  '5', '5S', '10', '10S', '20', '30', 'STD', '40', '40S',
  '60', 'XS', '80', '80S', '100', '120', '140', '160', 'XXS',
]);
const S_SCHEDULES = new Set(['5S', '10S', '40S', '80S']);

function parseSourceRows() {
  const lines = RAW_TSV.replace(/\\r/g, '').split('\\n').filter((line) => line.length);
  const headers = lines[0].split('\\t');
  return lines.slice(1).map((line, index) => {
    const cells = line.split('\\t');
    const row = Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']));
    const walls = {};
    for (const schedule of SCHEDULES) {
      const raw = String(row[schedule] ?? '').trim();
      if (raw) walls[schedule] = Number(raw);
    }
    return Object.freeze({
      sourceRow: index + 2,
      nps: String(Number(row.INCH)),
      dn: Number(row.BORE),
      outsideDiameterMm: Number(row['OD(mm)']),
      outsideDiameterInSource: Number(row['OD(in)']),
      walls: Object.freeze(walls),
    });
  });
}

export const PIPE_WALL_MASTER_SIZE_ROWS = Object.freeze(parseSourceRows());

export function inferPipeDimensionStandard(schedule) {
  return S_SCHEDULES.has(String(schedule).toUpperCase())
    ? 'ASME B36.19M'
    : 'ASME B36.10M';
}

export function buildDefaultPipeWallMasterRows() {
  const rows = [];
  for (const size of PIPE_WALL_MASTER_SIZE_ROWS) {
    for (const [schedule, nominalWallMm] of Object.entries(size.walls)) {
      rows.push(Object.freeze({
        dimensionStandard: inferPipeDimensionStandard(schedule),
        edition: null,
        nps: size.nps,
        dn: size.dn,
        outsideDiameterMm: size.outsideDiameterMm,
        schedule,
        nominalWallMm,
        sourcePath: PIPE_WALL_MASTER_SOURCE.sourcePath,
        sourceBlobSha: PIPE_WALL_MASTER_SOURCE.sourceBlobSha,
        sourceAuthority: PIPE_WALL_MASTER_SOURCE.sourceAuthority,
        dataStatus: PIPE_WALL_MASTER_SOURCE.dataStatus,
        sourceRow: size.sourceRow,
        standardAssignment: 'SCHEDULE_NAMESPACE_INFERENCE',
      }));
    }
  }
  return Object.freeze(rows);
}

export const DEFAULT_PIPE_WALL_MASTER_ROWS = buildDefaultPipeWallMasterRows();
`;
}

const generated = render(fs.readFileSync(SOURCE, 'utf8'));
const mode = process.argv[2] || '--check';

if (mode === '--write') {
  fs.writeFileSync(OUTPUT, generated);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
} else if (mode === '--check') {
  const current = fs.readFileSync(OUTPUT, 'utf8');
  if (current !== generated) {
    console.error('Pipe-wall runtime registry is out of sync with the canonical TSV.');
    process.exit(1);
  }
  console.log('Pipe-wall runtime registry matches canonical TSV.');
} else {
  console.error('Usage: node scripts/generate-pipe-wall-master.mjs [--check|--write]');
  process.exit(2);
}
