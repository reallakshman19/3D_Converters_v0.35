import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveChapterIxFatigueMasterBundle } from '../converters/b313-chapter-ix/fatigue-master-resolver.js';
import { auditChapterIxFatigueMasterDirectory } from '../scripts/audit-b313-ch9-fatigue-masters.mjs';

function masters() {
  return {
    methods: [{
      method_id: 'B313-CH9-SYNTH-TEST-R1', method_revision: '1.0.0', application_scope: 'SYNTHETIC_BENCHMARK_VERIFICATION',
      b313_edition: '2024', fatigue_route_id: 'ROUTE-KD3-SYNTH', qualification_state: 'APPROVED',
    }, {
      method_id: 'B313-CH9-PF-2024-R1', method_revision: '1.0.0', application_scope: 'STRAIGHT_PIPE_PRESSURE_ONLY',
      b313_edition: '2024', fatigue_route_id: 'ROUTE-KD3-2024', qualification_state: 'APPROVED',
    }],
    routes: [{
      fatigue_route_id: 'ROUTE-KD3-SYNTH', method_revision: '1.0.0', kd_route_id: 'KD3-SYNTH-001',
      stress_basis: 'TRESCA_STRESS_INTENSITY', seq_route: 'DIRECT_SALT_EQUAL_SEQ', mean_stress_route: 'NONE',
      fatigue_curve_id: 'TEST-SYNTH-CURVE-001', interpolation_rule: 'LOG_LOG', extrapolation_allowed: 'FALSE',
      applicability: 'SYNTHETIC_BENCHMARK_VERIFICATION', source_id: 'SRC-TEST-SYNTH', qualification_state: 'APPROVED',
    }, {
      fatigue_route_id: 'ROUTE-KD3-2024', method_revision: '1.0.0', kd_route_id: 'KD3-FATIGUE-001',
      stress_basis: 'TRESCA_STRESS_INTENSITY', seq_route: 'KD320_MEAN_STRESS_CORRECTION', mean_stress_route: 'ALGEBRAIC_MEAN_STRESS',
      fatigue_curve_id: 'VIII3-KD3-CS-001', interpolation_rule: 'LOG_LOG', extrapolation_allowed: 'FALSE',
      applicability: 'STRAIGHT_PIPE_REMOTE_FROM_DISCONTINUITY', source_id: 'SRC-VIII3-2025', qualification_state: 'APPROVED',
    }],
    curves: [{
      fatigue_curve_id: 'TEST-SYNTH-CURVE-001', standard: 'INTERNAL_BENCHMARK', edition: '2026', material_scope: 'TEST-MAT',
      source_id: 'SRC-TEST-SYNTH', source_locator: 'Benchmark Class D Specification', license_class: 'PUBLIC_DOMAIN', qualification_state: 'APPROVED',
    }, {
      fatigue_curve_id: 'VIII3-KD3-CS-001', standard: 'ASME BPVC Section VIII Div 3', edition: '2025', material_scope: 'CARBON_AND_LOW_ALLOY_STEEL',
      source_id: 'SRC-VIII3-2025', source_locator: 'Figure/Table', license_class: 'LICENSED_RESTRICTED', qualification_state: 'APPROVED',
    }],
    curvePoints: [
      { fatigue_curve_id: 'TEST-SYNTH-CURVE-001', point_no: '1', n_cycles: '1000', sa_mpa: '200' },
      { fatigue_curve_id: 'TEST-SYNTH-CURVE-001', point_no: '2', n_cycles: '10000', sa_mpa: '100' },
      { fatigue_curve_id: 'TEST-SYNTH-CURVE-001', point_no: '3', n_cycles: '100000', sa_mpa: '50' },
      { fatigue_curve_id: 'VIII3-KD3-CS-001', point_no: '1', n_cycles: '10', sa_mpa: '3999' },
      { fatigue_curve_id: 'VIII3-KD3-CS-001', point_no: '2', n_cycles: '100', sa_mpa: '1750' },
    ],
  };
}

test('synthetic master chain resolves to reference-ready without authority promotion', () => {
  const result = resolveChapterIxFatigueMasterBundle({ methodId: 'B313-CH9-SYNTH-TEST-R1', masters: masters() });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.bundleState, 'SYNTHETIC_REFERENCE_READY');
  assert.equal(result.route.seqRoute, 'DIRECT_SALT_EQUAL_SEQ');
  assert.equal(result.points.length, 3);
  assert.equal(result.canUseForDesignAuthority, false);
});

test('production KD320 chain resolves structurally but remains evidence-pending', () => {
  const result = resolveChapterIxFatigueMasterBundle({ methodId: 'B313-CH9-PF-2024-R1', masters: masters() });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.bundleState, 'PRODUCTION_EVIDENCE_PENDING');
  assert(result.issues.includes('KD320_CONTROLLED_MEAN_STRESS_PARAMETERS_PENDING'));
  assert(result.issues.includes('LICENSED_CURVE_INDEPENDENT_CUSTODY_PENDING'));
  assert(result.issues.includes('INDEPENDENT_ENGINEERING_CHECK_PENDING'));
  assert.equal(result.canUseForDesignAuthority, false);
});

test('method-route revision mismatch fails master-link validation', () => {
  const data = masters();
  data.routes[0].method_revision = '2.0.0';
  const result = resolveChapterIxFatigueMasterBundle({ methodId: 'B313-CH9-SYNTH-TEST-R1', masters: data });
  assert.equal(result.bundleState, 'MASTER_LINKS_INVALID');
  assert(result.issues.includes('METHOD_ROUTE_REVISION_MISMATCH'));
});

test('directory audit parses pinned-style CSV and reaches synthetic reference-ready', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-fatigue-master-'));
  fs.writeFileSync(path.join(dir, 'method_manifest.csv'), 'method_id,method_revision,application_scope,b313_edition,fatigue_route_id,qualification_state\nB313-CH9-SYNTH-TEST-R1,1.0.0,SYNTHETIC_BENCHMARK_VERIFICATION,2024,ROUTE-KD3-SYNTH,APPROVED\n');
  fs.writeFileSync(path.join(dir, 'fatigue_route.csv'), 'fatigue_route_id,method_revision,kd_route_id,stress_basis,seq_route,mean_stress_route,fatigue_curve_id,interpolation_rule,extrapolation_allowed,applicability,source_id,qualification_state\nROUTE-KD3-SYNTH,1.0.0,KD3-SYNTH-001,TRESCA_STRESS_INTENSITY,DIRECT_SALT_EQUAL_SEQ,NONE,TEST-SYNTH-CURVE-001,LOG_LOG,FALSE,SYNTHETIC_BENCHMARK_VERIFICATION,SRC-TEST-SYNTH,APPROVED\n');
  fs.writeFileSync(path.join(dir, 'fatigue_curve.csv'), 'fatigue_curve_id,standard,edition,material_scope,source_id,source_locator,license_class,qualification_state\nTEST-SYNTH-CURVE-001,INTERNAL_BENCHMARK,2026,TEST-MAT,SRC-TEST-SYNTH,Benchmark Class D Specification,PUBLIC_DOMAIN,APPROVED\n');
  fs.writeFileSync(path.join(dir, 'fatigue_curve_point.csv'), 'fatigue_curve_id,point_no,n_cycles,sa_mpa\nTEST-SYNTH-CURVE-001,1,1000,200\nTEST-SYNTH-CURVE-001,2,10000,100\n');
  const result = auditChapterIxFatigueMasterDirectory(dir, 'B313-CH9-SYNTH-TEST-R1');
  assert.equal(result.bundleState, 'SYNTHETIC_REFERENCE_READY');
});
