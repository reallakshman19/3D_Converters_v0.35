import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFitWorkingCellTrace,
  buildSelectedFitMechanismAssessmentSet,
} from '../tabs/vibration-integrity-mechanism-context.js';

function table(kind, header, rows, rowIds) {
  return { kind, header, rows, rowIds };
}

function state() {
  const topologyHeader = Array.from({ length: 15 }, (_, index) => `T${index}`);
  topologyHeader[2] = 'Line';
  topologyHeader[14] = 'Canonical ID';
  const operatingHeader = [
    'Line','Case','Label','Phase','Mass Flow','Mass Flow Unit','Density','Density Unit',
    'Pressure','Pressure Unit','Pressure Ref','Temperature','Temperature Unit','Viscosity','Viscosity Unit',
    'Velocity','Velocity Unit','Source','Source Revision','Record ID',
  ];
  const enrichmentHeader = [
    'Canonical ID','Line','Case','Property','Value','Value Type','Unit','Source','Source Revision','Record ID',
  ];
  return {
    resultState: 'CURRENT_RESULT',
    benchmark: { loaded: null },
    tables: {
      topology: table('topology', topologyHeader, [
        ['', '', 'L-100', '', '', '', '', '', '', '', '', '', '', '', 'CAN-1'],
      ], ['TOPO-1']),
      operating: table('operating', operatingHeader, [
        ['L-100','NORMAL','Normal','GAS','53482','kg/h','18','kg/m3','','','','','','0.00002','Pa*s','44','m/s','EI-D2','R1','OP-1'],
      ], ['OP-ROW-1']),
      enrichment: table('enrichment', enrichmentHeader, [
        ['CAN-1','L-100','','FIT_ASSESSMENT_POINT','true','boolean','','EI-D2','R1','EN-0'],
        ['CAN-1','L-100','','OUTSIDE_DIAMETER','168.275','number','mm','EI-D2','R1','EN-1'],
        ['CAN-1','L-100','','WALL_THICKNESS','7.112','number','mm','EI-D2','R1','EN-2'],
        ['CAN-1','L-100','','MAX_UNSUPPORTED_SPAN','7','number','m','EI-D2','R1','EN-3'],
        ['CAN-1','L-100','NORMAL','NATURAL_FREQUENCY','2.2','number','Hz','EI-D2','R1','EN-4'],
      ], ['EN-ROW-0','EN-ROW-1','EN-ROW-2','EN-ROW-3','EN-ROW-4']),
    },
    workspace: {
      detail: {
        summary: {
          line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1', status: 'CALCULATED_BENCHMARK',
          standardLof: 0.276, governingReferenceLof: 0.276, referenceBand: 'LOF_LT_0_3',
          qualificationState: 'BENCHMARK_ONLY', missing: [], invalid: [], errorCodes: [],
        },
        fitMechanism: {
          calculationId: 'VIB.FIV.FLOW_TURBULENCE', methodRevision: 'ei-aviff2-fit-reference-v2',
          execution: { executionId: 'ENG-1' }, applicability: { applicable: true },
          resolvedInputs: {
            phase: { canonicalValue: 'GAS', canonicalUnit: null },
            density: { canonicalValue: 18, canonicalUnit: 'kg/m3' },
            fluidVelocity: { canonicalValue: 44, canonicalUnit: 'm/s' },
            outsideDiameter: { canonicalValue: 0.168275, canonicalUnit: 'm' },
            wallThickness: { canonicalValue: 0.007112, canonicalUnit: 'm' },
            maximumUnsupportedSpan: { canonicalValue: 7, canonicalUnit: 'm' },
            naturalFrequency: { canonicalValue: 2.2, canonicalUnit: 'Hz' },
          },
          outputs: { standardLof: 0.276, governingReferenceLof: 0.276, referenceBand: 'LOF_LT_0_3' },
          assessment: { status: 'REFERENCE_BELOW_THRESHOLD' }, qualification: { effective: 'BENCHMARK_ONLY' },
          provenance: { engineeringAuthority: 'WORKBOOK_REFERENCE_ONLY' },
          equationIds: ['FIT-EQ-001'], correlationIds: ['FIT.STD.MEDIUM_STIFF.v1'],
          sourceTrace: { operatingCase: { source: 'EI-D2' } }, warnings: [],
        },
      },
    },
  };
}

test('FIT working trace resolves exact Stage-3 backing cell pointers and anchors', () => {
  const value = state();
  const trace = buildFitWorkingCellTrace(value, value.workspace.detail.summary);
  assert.equal(trace.density.valueRef.rowId, 'OP-ROW-1');
  assert.equal(trace.density.valueRef.header, 'Density');
  assert.equal(trace.density.unitRef.header, 'Density Unit');
  assert.equal(trace.outsideDiameter.valueRef.rowId, 'EN-ROW-1');
  assert.equal(trace.outsideDiameter.sourceAnchorId, 'vi-source-enrichment-EN-ROW-1-4');
  assert.equal(trace.naturalFrequency.valueRef.rowId, 'EN-ROW-4');
});

test('selected FIT generic assessment reports complete source-working-normalized trace', () => {
  const set = buildSelectedFitMechanismAssessmentSet(state());
  assert.equal(set.cardinality.kind, 'ONE');
  const item = set.items[0];
  assert.equal(item.itemId, '["fit","L-100","NORMAL","CAN-1","mainline"]');
  assert.equal(item.trace.inputTrace.status, 'COMPLETE_WORKING_TRACE');
  assert.equal(item.trace.inputTrace.workingCells.maximumUnsupportedSpan.valueRef.rowId, 'EN-ROW-3');
  assert.equal(item.trace.inputTrace.normalizedInputs.outsideDiameter.canonicalValue, 0.168275);
  assert.equal(item.trace.inputTrace.sourceTrace.operatingCase.source, 'EI-D2');
});
