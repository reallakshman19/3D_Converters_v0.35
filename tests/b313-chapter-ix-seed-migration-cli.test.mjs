import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  migrateChapterIxSeedDirectory,
  parseChapterIxSeedCsv,
} from '../scripts/migrate-b313-ch9-seed-masters.mjs';

const PINNED_SOURCE = 'reallaksh19/Advanced_Analysis@951798864e6f557691d0d4388368b7805e425f0d/docs/High Pr';

test('seed migration parser preserves quoted CSV and writes quarantined canonical store', () => {
  const parsed = parseChapterIxSeedCsv('a,b\n1,"two,three"\n');
  assert.deepEqual(parsed, [{ a: '1', b: 'two,three' }]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-ch9-seed-'));
  const files = {
    'code_source_revision.csv': 'source_id,standard,edition,document_hash,source_locator,verified_by,verified_at,status\nSRC-X,TEST,R1,sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,Loc,A,2026-01-01T00:00:00Z,ACTIVE\n',
    'material_property.csv': 'material_id,temperature_c,allowable_stress_mpa,yield_strength_mpa,tensile_strength_mpa,elastic_modulus_mpa,poisson_ratio,alpha_per_c,density_kg_m3,source_id,source_locator,qualification_state\nMAT,100,100,200,300,190000,0.3,0.00001,7850,SRC-X,Loc,APPROVED\n',
    'pipe_dimension.csv': 'dimension_id,nps,od_mm,schedule,nominal_wall_mm,dimension_standard,dimension_edition,source_id\nDIM,4,114.3,SCH_160,13.49,TEST,R1,SRC-X\n',
    'pipe_product.csv': 'product_id,dimension_id,material_id,product_spec,manufacturing_process,minus_tolerance_pct,tolerance_basis,source_id,source_locator\nPROD,DIM,MAT,TEST PIPE,TEST_PROCESS,12.5,TEST,SRC-X,Loc\n',
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  const output = path.join(dir, 'out', 'store.json');
  const migrated = migrateChapterIxSeedDirectory(dir, output, { sourceRef: PINNED_SOURCE });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.store.quarantine.length, 2);
  assert.equal(fs.existsSync(output), true);
  const written = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(written.canUseForDesignAuthority, false);
  assert.equal(written.metadata.migrationState, 'SOURCE_PENDING');
  assert.equal(written.metadata.sourceRef, PINNED_SOURCE);
  assert.notEqual(written.metadata.sourceRef, migrated.sourceDirectory);
});
