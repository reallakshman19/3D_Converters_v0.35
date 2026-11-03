import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  AIV_MASTER_DB_REFERENCE,
  AIV_MASTER_TABLE_SPECS,
  calculateAivGitBlobSha1,
} from '../converters/vibration/aiv/aiv-master-db-reference.js';
import { parseAivMasterDatabase } from '../converters/vibration/aiv/aiv-master-db.js';
import { resolveAivTablesFromMasterDb } from '../converters/vibration/aiv/aiv-master-db-resolver.js';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csv(filename, rows) {
  const columns = AIV_MASTER_TABLE_SPECS[filename].columns;
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')).join('\n')}\n`;
}
function verification() {
  return Object.fromEntries(Object.entries(AIV_MASTER_DB_REFERENCE.files).map(([filename, blob]) => [
    filename, { expectedBlob: blob, actualBlob: blob, status: 'MATCH' },
  ]));
}
function packageTexts() {
  const doc = { SourceDocumentId: 'DOC-1', DocumentNumber: 'REF-1', DocumentTitle: 'Controlled reference', DocumentType: 'ENGINEERING_RULE', Organization: 'TEST', Edition: '1', Revision: '1', IssueDate: '2026-08-15', AuthorityLevel: 'CONTROLLED_ENGINEERING', RecordVersion: '1', FileReference: '', DocumentHash: '', SupersededBy: '', DataOwner: 'TEST', Status: 'ACTIVE' };
  const unit = { UnitId: 'U-MM', QuantityType: 'LENGTH', UnitSymbol: 'mm', CanonicalUnit: 'm', ScaleToCanonical: '0.001', OffsetToCanonical: '0', PressureBasisAllowed: '', Description: 'millimetre', Status: 'ACTIVE' };
  const material = { MaterialId: 'MAT-CS', Specification: 'ASTM A106', Grade: 'B', MaterialFamily: 'CARBON_STEEL', BaseMaterialType: 'CS', IsDuplex: 'NO', IsStainless: 'NO', IsCarbonSteel: 'YES', SourceDocumentId: 'DOC-1', SourceRecord: 'B', StandardEdition: '2024', Status: 'ACTIVE' };
  const component1 = { ComponentTypeId: 'CMP-TEE-1', ComponentFamily: 'TEE', ComponentSubtype: 'BUTT_WELD_TEE', ModelType: 'TEE', IsAivAssessmentCandidate: 'YES', AivAssessmentType: 'WELDED_TEE', RequiresBranchGeometry: 'YES', MainSizeRequired: 'YES', BranchSizeRequired: 'YES', Description: 'tee', SourceDocumentId: 'DOC-1', Revision: '1', Status: 'ACTIVE' };
  const component2 = { ...component1, ComponentTypeId: 'CMP-TEE-2', ComponentSubtype: 'FABRICATED_TEE' };
  const source = { SourceDeviceTypeId: 'SRC-PSV', ComponentFamily: 'VALVE', ComponentSubtype: 'PSV', ModelType: 'RELIEF_VALVE', IsAivSourceCandidate: 'YES', AivSourceDeviceType: 'RELIEF_VALVE', RequiresPressureDrop: 'YES', RequiresMassFlow: 'YES', RequiresTemperature: 'YES', RequiresMolecularWeight: 'YES', SupportsLowNoiseTrim: 'NO', Description: 'PSV', SourceDocumentId: 'DOC-1', Revision: '1', Status: 'ACTIVE' };
  const dim200 = { PipeDimensionId: 'DIM-200-40', Standard: 'ASME B36.10M', StandardEdition: '2022', NPS: '8', DN: '200', OutsideDiameter: '219.1', OutsideDiameterUnit: 'mm', Schedule: '40', WallThickness: '8.18', WallThicknessUnit: 'mm', InsideDiameter: '202.74', InsideDiameterUnit: 'mm', SourceDocumentId: 'DOC-1', SourceRecord: 'T1', Status: 'ACTIVE' };
  const dim100 = { ...dim200, PipeDimensionId: 'DIM-100-40', NPS: '4', DN: '100', OutsideDiameter: '114.3', WallThickness: '6.02', InsideDiameter: '102.26' };
  const pipe = { PipingClassRecordId: 'PC-A1-PIPE-8', PipingClassId: 'A1', ComponentFamily: 'PIPE', NPS: '8', DN: '200', Schedule: '40', NominalWallThickness: '8.18', WallThicknessUnit: 'mm', MaterialId: 'MAT-CS', PressureClass: '300', BranchType: '', BranchNPS: '', BranchDN: '', BranchSchedule: '', BranchWallThickness: '', Standard: 'ASME B36.10M', SourceDocumentId: 'DOC-1', SourceRecord: 'P1', Revision: '1', Status: 'ACTIVE' };
  const tee = { ...pipe, PipingClassRecordId: 'PC-A1-TEE-8X4', ComponentFamily: 'TEE', BranchType: 'WELDED_TEE', BranchNPS: '4', BranchDN: '100', BranchSchedule: '40', BranchWallThickness: '6.02', SourceRecord: 'T1' };
  return {
    'M_DOCUMENT_SOURCE.csv': csv('M_DOCUMENT_SOURCE.csv', [doc]),
    'M_UNIT.csv': csv('M_UNIT.csv', [unit]),
    'M_MATERIAL.csv': csv('M_MATERIAL.csv', [material]),
    'M_COMPONENT_TYPE.csv': csv('M_COMPONENT_TYPE.csv', [component1, component2]),
    'M_SOURCE_DEVICE_TYPE.csv': csv('M_SOURCE_DEVICE_TYPE.csv', [source]),
    'M_PIPE_DIMENSION.csv': csv('M_PIPE_DIMENSION.csv', [dim200, dim100]),
    'M_PIPING_CLASS.csv': csv('M_PIPING_CLASS.csv', [pipe, tee]),
  };
}
function row(header, values) { return header.map((column) => String(values[column] ?? '')); }
function value(table, rowIndex, column) { return table.rows[rowIndex][table.header.indexOf(column)]; }

const sourceHeader = ['Source Canonical ID','Operating Case','Source Device Type','Source State','Phase','Mass Flow','Mass Flow Unit','Upstream Pressure','Upstream Pressure Unit','Upstream Pressure Basis','Downstream Pressure','Downstream Pressure Unit','Downstream Pressure Basis','Reference Pressure','Reference Pressure Unit','Reference Pressure Source','Reference Pressure Source Revision','Upstream Temperature','Upstream Temperature Unit','Molecular Weight','Molecular Weight Unit','Low Noise Trim State','Low Noise Trim Reduction','Low Noise Trim Unit','Low Noise Trim Source','Low Noise Trim Source Revision','Sonic State','Source','Source Revision','Record ID','Status','Reviewer'];
const assessmentHeader = ['Assessment Canonical ID','Assessment Type','Main Outside Diameter','Main Outside Diameter Unit','Main Inside Diameter','Main Inside Diameter Unit','Main Wall Thickness','Main Wall Thickness Unit','Branch Outside Diameter','Branch Outside Diameter Unit','Branch Wall Thickness','Branch Wall Thickness Unit','Material','Duplex State','Source','Source Revision','Record ID','Status','Reviewer'];
const relationshipHeader = ['Source Canonical ID','Assessment Canonical ID','Operating Case','Physical Distance','Physical Distance Unit','Distance Source','Distance Source Revision','Simultaneous Source Group','Applicability Disposition','Source','Source Revision','Record ID','Status','Reviewer'];

function table(kind, header, rows) { return { kind, header, rows, sourceName: null, sourceKind: 'WORKING_TABLE', dirty: false }; }
function tables(mainOd = '') {
  return {
    sources: table('sources', sourceHeader, [row(sourceHeader, { 'Source Canonical ID': 'PSV-1', 'Operating Case': 'RELIEF-1' })]),
    assessments: table('assessments', assessmentHeader, mainOd ? [row(assessmentHeader, { 'Assessment Canonical ID': 'TEE-1', 'Main Outside Diameter': mainOd })] : []),
    relationships: table('relationships', relationshipHeader, []),
  };
}
const topology = { elements: [
  { canonicalId: 'PSV-1', tag: 'PSV-1', line: 'L-1', type: 'RELIEF_VALVE' },
  { canonicalId: 'TEE-1', tag: 'TEE-1', line: 'L-1', type: 'TEE', dnInMm: 200, schedule: '40', pipingClass: 'A1', material: 'ASTM A106 B' },
] };

test('Git blob hashing matches the canonical Git object vector', async () => {
  assert.equal(await calculateAivGitBlobSha1(new TextEncoder().encode('test content\n')), 'd670460b4b4aece5915caf5c68d12f560a9fe3e4');
});

test('master parser requires the pinned verification receipt and controlled package', () => {
  assert.throws(() => parseAivMasterDatabase(packageTexts(), {}), { code: 'AIV_MASTER_VERIFICATION_REQUIRED' });
  const db = parseAivMasterDatabase(packageTexts(), verification());
  assert.equal(db.status, 'PIN_VERIFIED_STRUCTURALLY_VALID');
  assert.equal(db.authority.screeningAuthorityConferred, false);
  assert.equal(db.authority.designAuthority, false);
});

test('master resolver discovers exact assessment semantics and fills deterministic blank geometry/material only', () => {
  const db = parseAivMasterDatabase(packageTexts(), verification());
  const result = resolveAivTablesFromMasterDb({ tables: tables(), topology, masterDb: db });
  assert.equal(result.discoveredAssessmentCandidateCount, 1);
  assert.equal(result.sourceCandidates.length, 1);
  assert.equal(value(result.tables.sources, 0, 'Source Device Type'), 'RELIEF_VALVE');
  assert.equal(value(result.tables.sources, 0, 'Mass Flow'), '');
  assert.equal(value(result.tables.assessments, 0, 'Assessment Type'), 'WELDED_TEE');
  assert.equal(value(result.tables.assessments, 0, 'Main Outside Diameter'), '219.1');
  assert.equal(value(result.tables.assessments, 0, 'Main Inside Diameter'), '202.74');
  assert.equal(value(result.tables.assessments, 0, 'Main Wall Thickness'), '8.18');
  assert.equal(value(result.tables.assessments, 0, 'Branch Outside Diameter'), '114.3');
  assert.equal(value(result.tables.assessments, 0, 'Branch Wall Thickness'), '6.02');
  assert.equal(value(result.tables.assessments, 0, 'Material'), 'ASTM A106 B');
  assert.equal(value(result.tables.assessments, 0, 'Duplex State'), 'NO');
  assert.equal(result.tables.relationships.rows.length, 0);
  assert.equal(result.policy.processCaseValuesInvented, false);
  assert.equal(result.policy.generalTopologyDistanceInvented, false);
});

test('explicit project values remain authoritative over master enrichment', () => {
  const db = parseAivMasterDatabase(packageTexts(), verification());
  const result = resolveAivTablesFromMasterDb({ tables: tables('999'), topology, masterDb: db });
  assert.equal(value(result.tables.assessments, 0, 'Main Outside Diameter'), '999');
  assert.equal(result.resolutions.some((item) => item.column === 'Main Outside Diameter'), false);
});
