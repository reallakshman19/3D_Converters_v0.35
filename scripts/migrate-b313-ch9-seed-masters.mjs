import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateLegacyChapterIxMasters } from '../converters/b313-chapter-ix/legacy-master-migration.js';
import { validateChapterIxMasterStore } from '../converters/b313-chapter-ix/master-store.js';

const SOURCE_FILES = Object.freeze({
  sources: 'code_source_revision.csv',
  materialProperties: 'material_property.csv',
  pipeDimensions: 'pipe_dimension.csv',
  pipeProducts: 'pipe_product.csv',
});

function parseRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

export function parseChapterIxSeedCsv(text) {
  const rows = parseRows(String(text ?? ''));
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? '']),
  ));
}

function readCsv(sourceDir, filename) {
  return parseChapterIxSeedCsv(fs.readFileSync(path.join(sourceDir, filename), 'utf8'));
}

export function migrateChapterIxSeedDirectory(sourceDir, outputFile, options = {}) {
  const absoluteSource = path.resolve(sourceDir);
  const payload = Object.fromEntries(Object.entries(SOURCE_FILES).map(([key, filename]) => [
    key,
    readCsv(absoluteSource, filename),
  ]));
  const migrated = migrateLegacyChapterIxMasters({
    sourceRef: options.sourceRef || absoluteSource,
    ...payload,
  });
  const validation = validateChapterIxMasterStore(migrated.store);
  if (!validation.ok) {
    const error = new Error(validation.errors.join('\n'));
    error.code = 'MASTER_STORE_INVALID';
    throw error;
  }
  const absoluteOutput = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(migrated.store, null, 2)}\n`);
  return { ...migrated, outputFile: absoluteOutput, sourceDirectory: absoluteSource };
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const sourceDir = process.argv[2];
  const outputFile = process.argv[3];
  const sourceRef = process.argv[4];
  if (!sourceDir || !outputFile) {
    console.error('Usage: node scripts/migrate-b313-ch9-seed-masters.mjs <High-Pr-dir> <output.json> [immutable-source-ref]');
    process.exitCode = 1;
  } else {
    try {
      const result = migrateChapterIxSeedDirectory(sourceDir, outputFile, { sourceRef });
      process.stdout.write(`${JSON.stringify({
        ok: result.ok,
        summary: result.summary,
        outputFile: result.outputFile,
        sourceRef: result.store.metadata.sourceRef,
        canUseForDesignAuthority: result.canUseForDesignAuthority,
      }, null, 2)}\n`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
