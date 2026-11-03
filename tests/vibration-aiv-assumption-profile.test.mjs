import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  createAivAssumptionProfile,
  resolveAivWorkingTablesWithAssumptions,
  updateAivAssumptionProfile,
  validateAivAssumptionProfile,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';

const sourceHeader = [
  'Source Canonical ID','Operating Case','Source Device Type','Source State','Phase','Mass Flow','Mass Flow Unit',
  'Upstream Pressure','Upstream Pressure Unit','Upstream Pressure Basis','Downstream Pressure','Downstream Pressure Unit',
  'Downstream Pressure Basis','Reference Pressure','Reference Pressure Unit','Reference Pressure Source',
  'Reference Pressure Source Revision','Upstream Temperature','Upstream Temperature Unit','Molecular Weight','Molecular Weight Unit',
  'Low Noise Trim State','Low Noise Trim Reduction','Low Noise Trim Unit','Low Noise Trim Source','Low Noise Trim Source Revision',
  'Sonic State','Source','Source Revision','Record ID','Status','Reviewer',
];
const assessmentHeader = [
  'Assessment Canonical ID','Assessment Type','Main Outside Diameter','Main Outside Diameter Unit','Main Inside Diameter',
  'Main Inside Diameter Unit','Main Wall Thickness','Main Wall Thickness Unit','Branch Outside Diameter','Branch Outside Diameter Unit',
  'Branch Wall Thickness','Branch Wall Thickness Unit','Material','Duplex State','Source','Source Revision','Record ID','Status','Reviewer',
];
const relationshipHeader = [
  'Source Canonical ID','Assessment Canonical ID','Operating Case','Physical Distance','Physical Distance Unit','Distance Source',
  'Distance Source Revision','Simultaneous Source Group','Applicability Disposition','Source','Source Revision','Record ID','Status','Reviewer',
];

function blankTable(kind, header, rows = 1) {
  return { kind, header, rows: Array.from({ length: rows }, () => Array(header.length).fill('')) };
}

test('default assumption profile is valid and explicitly requires no human evidence', () => {
  const validation = validateAivAssumptionProfile(AIV_DEFAULT_ASSUMPTION_PROFILE);
  assert.equal(validation.status, 'PASS');
  assert.equal(validation.humanEvidenceRequired, false);
  assert.equal(AIV_DEFAULT_ASSUMPTION_PROFILE.policy.assumptionsMustBeVisible, true);
  assert.equal(AIV_DEFAULT_ASSUMPTION_PROFILE.policy.assumptionsMustBeEditable, true);
  assert.equal(AIV_DEFAULT_ASSUMPTION_PROFILE.policy.designAuthority, false);
});

test('missing source, assessment and relationship cells are filled from visible configurable assumptions', () => {
  const resolved = resolveAivWorkingTablesWithAssumptions({
    sources: blankTable('sources', sourceHeader),
    assessments: blankTable('assessments', assessmentHeader),
    relationships: blankTable('relationships', relationshipHeader),
  });
  assert.ok(resolved.assumptionCount > 20);
  const src = resolved.tables.sources.rows[0];
  const assess = resolved.tables.assessments.rows[0];
  const rel = resolved.tables.relationships.rows[0];
  assert.equal(src[sourceHeader.indexOf('Source Canonical ID')], 'AIV-ASSUMED-SRC-1');
  assert.equal(src[sourceHeader.indexOf('Operating Case')], 'AIV-ASSUMED-CASE-1');
  assert.equal(src[sourceHeader.indexOf('Mass Flow')], '10');
  assert.equal(src[sourceHeader.indexOf('Sonic State')], 'NON_SONIC');
  assert.equal(assess[assessmentHeader.indexOf('Assessment Canonical ID')], 'AIV-ASSUMED-ASSESS-1');
  assert.equal(assess[assessmentHeader.indexOf('Main Inside Diameter')], '154');
  assert.equal(rel[relationshipHeader.indexOf('Source Canonical ID')], 'AIV-ASSUMED-SRC-1');
  assert.equal(rel[relationshipHeader.indexOf('Assessment Canonical ID')], 'AIV-ASSUMED-ASSESS-1');
  assert.equal(rel[relationshipHeader.indexOf('Operating Case')], 'AIV-ASSUMED-CASE-1');
  assert.equal(rel[relationshipHeader.indexOf('Physical Distance')], '0.8');
});

test('explicit user cells always win over assumptions', () => {
  const sources = blankTable('sources', sourceHeader);
  sources.rows[0][sourceHeader.indexOf('Mass Flow')] = '42';
  sources.rows[0][sourceHeader.indexOf('Sonic State')] = 'SONIC';
  const resolved = resolveAivWorkingTablesWithAssumptions({
    sources,
    assessments: blankTable('assessments', assessmentHeader),
    relationships: blankTable('relationships', relationshipHeader),
  });
  assert.equal(resolved.tables.sources.rows[0][sourceHeader.indexOf('Mass Flow')], '42');
  assert.equal(resolved.tables.sources.rows[0][sourceHeader.indexOf('Sonic State')], 'SONIC');
  assert.equal(resolved.assumptions.some((item) => item.column === 'Mass Flow'), false);
});

test('user can configure assumption values used for missing inputs', () => {
  let profile = createAivAssumptionProfile();
  profile = updateAivAssumptionProfile(profile, 'source.massFlow', '25');
  profile = updateAivAssumptionProfile(profile, 'relationship.physicalDistance', '1.25');
  profile = updateAivAssumptionProfile(profile, 'benchmark.flm1Mode', 'RECALCULATED');
  const resolved = resolveAivWorkingTablesWithAssumptions({
    sources: blankTable('sources', sourceHeader),
    assessments: blankTable('assessments', assessmentHeader),
    relationships: blankTable('relationships', relationshipHeader),
  }, profile);
  assert.equal(resolved.tables.sources.rows[0][sourceHeader.indexOf('Mass Flow')], '25');
  assert.equal(resolved.tables.relationships.rows[0][relationshipHeader.indexOf('Physical Distance')], '1.25');
  assert.equal(resolved.profile.benchmark.flm1Mode, 'RECALCULATED');
});

test('invalid numeric assumption values are rejected by profile validation', () => {
  const profile = updateAivAssumptionProfile(AIV_DEFAULT_ASSUMPTION_PROFILE, 'source.massFlow', 'not-a-number');
  const validation = validateAivAssumptionProfile(profile);
  assert.equal(validation.status, 'INVALID_ASSUMPTION_PROFILE');
  assert.ok(validation.invalidNumeric.includes('source.massFlow'));
});
