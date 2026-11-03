import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runChapterIxFatigueReferenceDirectory } from '../scripts/run-b313-ch9-fatigue-reference.mjs';

function writeMasters() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-fatigue-reference-'));
  fs.writeFileSync(path.join(dir, 'method_manifest.csv'), [
    'method_id,method_revision,application_scope,b313_edition,fatigue_route_id,qualification_state',
    'B313-CH9-SYNTH-TEST-R1,1.0.0,SYNTHETIC_BENCHMARK_VERIFICATION,2024,ROUTE-KD3-SYNTH,APPROVED',
    'B313-CH9-PF-2024-R1,1.0.0,STRAIGHT_PIPE_PRESSURE_ONLY,2024,ROUTE-KD3-2024,APPROVED',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'fatigue_route.csv'), [
    'fatigue_route_id,method_revision,kd_route_id,stress_basis,seq_route,mean_stress_route,fatigue_curve_id,interpolation_rule,extrapolation_allowed,applicability,source_id,qualification_state',
    'ROUTE-KD3-SYNTH,1.0.0,KD3-SYNTH-001,TRESCA_STRESS_INTENSITY,DIRECT_SALT_EQUAL_SEQ,NONE,TEST-SYNTH-CURVE-001,LOG_LOG,FALSE,SYNTHETIC_BENCHMARK_VERIFICATION,SRC-TEST-SYNTH,APPROVED',
    'ROUTE-KD3-2024,1.0.0,KD3-FATIGUE-001,TRESCA_STRESS_INTENSITY,KD320_MEAN_STRESS_CORRECTION,ALGEBRAIC_MEAN_STRESS,VIII3-KD3-CS-001,LOG_LOG,FALSE,STRAIGHT_PIPE_REMOTE_FROM_DISCONTINUITY,SRC-VIII3-2025,APPROVED',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'fatigue_curve.csv'), [
    'fatigue_curve_id,standard,edition,material_scope,source_id,source_locator,license_class,qualification_state',
    'TEST-SYNTH-CURVE-001,INTERNAL_BENCHMARK,2026,TEST-MAT,SRC-TEST-SYNTH,Benchmark Class D Specification,PUBLIC_DOMAIN,APPROVED',
    'VIII3-KD3-CS-001,ASME BPVC Section VIII Div 3,2025,CARBON_AND_LOW_ALLOY_STEEL,SRC-VIII3-2025,Figure/Table,LICENSED_RESTRICTED,APPROVED',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'fatigue_curve_point.csv'), [
    'fatigue_curve_id,point_no,n_cycles,sa_mpa',
    'TEST-SYNTH-CURVE-001,1,1000,200',
    'TEST-SYNTH-CURVE-001,2,10000,100',
    'TEST-SYNTH-CURVE-001,3,100000,50',
    'VIII3-KD3-CS-001,1,10,3999',
    'VIII3-KD3-CS-001,2,100,1750',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'cycle_spectrum.csv'), 'spectrum_id,design_life_years,prepared_by,checked_by,approved_by,status\nSPEC-TEST,25,SYS_ENGR,LEAD_PE,CHIEF_ENGR,APPROVED\n');
  fs.writeFileSync(path.join(dir, 'operating_state.csv'), [
    'spectrum_id,state_id,state_name,pressure_mpa,material_temperature_c,structural_temperature_c,duration_hr,provenance_id,status',
    'SPEC-TEST,LOW,Low,5,40,40,1,P1,ACTIVE',
    'SPEC-TEST,HIGH,High,30,40,40,1,P2,ACTIVE',
    'SPEC-TEST,STEADY,Steady,15,40,40,1,P3,ACTIVE',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'cycle_transition.csv'), [
    'spectrum_id,cycle_id,from_state_id,to_state_id,category,cycles_per_year,total_cycles,provenance_id,approved_by,status',
    'SPEC-TEST,C1,LOW,HIGH,PROCESS_CYCLE,500,10000,T1,CHIEF_ENGR,APPROVED',
    'SPEC-TEST,C0,STEADY,STEADY,PROCESS_CYCLE,1000,25000,T0,CHIEF_ENGR,APPROVED',
  ].join('\n'));
  return dir;
}

test('reference runner executes resolved synthetic masters and preserves zero-damage cycles', () => {
  const result = runChapterIxFatigueReferenceDirectory(writeMasters(), {
    methodId: 'B313-CH9-SYNTH-TEST-R1',
    spectrumId: 'SPEC-TEST',
    outsideDiameterMm: 114.3,
    effectiveWallMm: 8.80375,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.runState, 'SYNTHETIC_REFERENCE_EXECUTED');
  assert.equal(result.result.cycles.length, 2);
  assert.equal(result.result.cycles.find((row) => row.cycleId === 'C0').usage, 0);
  assert.equal(result.canUseForDesignAuthority, false);
});

test('reference runner refuses production KD320 execution while evidence is pending', () => {
  const result = runChapterIxFatigueReferenceDirectory(writeMasters(), {
    methodId: 'B313-CH9-PF-2024-R1',
    spectrumId: 'SPEC-TEST',
    outsideDiameterMm: 114.3,
    effectiveWallMm: 8.80375,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.runState, 'PRODUCTION_EVIDENCE_PENDING');
  assert.equal(result.result, null);
  assert(result.issues.includes('KD320_CONTROLLED_MEAN_STRESS_PARAMETERS_PENDING'));
  assert.equal(result.canUseForDesignAuthority, false);
});
