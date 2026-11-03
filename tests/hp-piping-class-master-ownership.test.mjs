import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateChapterIxMasterStore } from '../converters/b313-chapter-ix/master-store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8');
}

test('legacy engineering library no longer traverses iframe DOM or writes calculator fields', () => {
  const source = read('engineering/hp-class-standardization/engineering-library-ui.js');
  for (const forbidden of [
    /\.contentDocument/,
    /calculatorDocument\s*\(/,
    /triggerCalculate\s*\(/,
    /getElementById\(['"]diameter['"]\)\.value/,
    /getElementById\(['"]allowableStress['"]\)\.value/,
    /getElementById\(['"]candidateWalls['"]\)\.value/,
    /getElementById\(['"]calculateButton['"]\)/,
    /querySelectorAll\(['"]#cycleBody tr['"]\)/,
  ]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /Authoring preview only/);
  assert.match(source, /b313-ch9-master-store\/v1/);
});

test('legacy library HTML declares ingestion-only role and does not advertise calculator application', () => {
  const html = read('engineering/hp-class-standardization/engineering-library.html');
  assert.match(html, /Legacy ingestion \/ authoring evidence/);
  assert.match(html, /Runtime master authority is/);
  assert.match(html, /Preview interpolation only/);
  assert.match(html, /Preview selected row only/);
  assert.doesNotMatch(html, />Apply material to calculator</);
  assert.doesNotMatch(html, />Apply selected product row to calculator</);
});

test('native master runtime reads only the canonical master-store JSON path', () => {
  const service = read('tabs/hp-piping-class-master-store-service.js');
  assert.match(service, /b313-ch9-master-store\.json/);
  assert.match(service, /runtimeMasterSource: 'B313_CH9_MASTER_STORE_V1'/);
  assert.match(service, /legacyDocsRuntimeAuthority: false/);
  assert.doesNotMatch(service, /library-catalog\.csv/);
  assert.doesNotMatch(service, /material-properties\.csv/);
  assert.doesNotMatch(service, /pipe-product-overrides\.csv/);
  assert.doesNotMatch(service, /NPS_OD_BORE_SCHEDULE_MASTER/);
});

test('workspace controller requires canonical custody for governed calculations', () => {
  const controller = read('tabs/hp-piping-class-workspace-controller.js');
  assert.match(controller, /loadHpPipingClassMasterStore/);
  assert.match(controller, /bindGovernedBasis/);
  assert.match(controller, /validateHpPipingClassGovernedBasisCustody/);
  assert.match(controller, /MASTER_STORE_CUSTODY_BLOCKED/);
  assert.match(controller, /CALCULATION_BLOCKED_MASTER_STORE_CUSTODY/);
  assert.doesNotMatch(controller, /engineering-library-csv/);
  assert.doesNotMatch(controller, /HpEngineeringLibraryCore/);
});

test('committed canonical store is valid, source-pending and explicitly records current docs blockers', () => {
  const store = JSON.parse(read('engineering/hp-class-standardization/masters/b313-ch9-master-store.json'));
  const validation = validateChapterIxMasterStore(store);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.equal(store.metadata.runtimeRole, 'CANONICAL_RUNTIME_MASTER_STORE');
  assert.equal(store.metadata.legacyDocsPolicy, 'CSV_TSV_ARE_INGESTION_AUTHORING_ONLY');
  assert.equal(store.canUseForDesignAuthority, false);
  assert.equal(store.collections.materialAllowable.length, 0);
  assert.equal(store.collections.pipeProduct.length, 0);
  assert.equal(store.collections.manufacturingTolerance.length, 0);
  assert(store.quarantine.some((row) => row.quarantineId === 'Q-MATERIAL-DATASET-PENDING'));
  assert(store.quarantine.some((row) => row.quarantineId === 'Q-PRODUCT-OVERLAY-PENDING'));
});

test('docs catalog remains ingestion evidence and truthfully declares header-only material/product datasets', () => {
  const catalog = read('docs/Masters/HP_Piping_Class/library-catalog.csv');
  assert.match(catalog, /material,material-properties\.csv,csv,HEADER_ONLY/);
  assert.match(catalog, /product_overlay,pipe-product-overrides\.csv,csv,HEADER_ONLY/);
  const material = read('docs/Masters/HP_Piping_Class/material-properties.csv').trim().split(/\r?\n/);
  const product = read('docs/Masters/HP_Piping_Class/pipe-product-overrides.csv').trim().split(/\r?\n/);
  assert.equal(material.length, 1);
  assert.equal(product.length, 1);
});
