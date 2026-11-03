import { createAivFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network.js';

export const AIV_SMALL_FLARE_MOCK_ID = 'SMALL-FLARE-2RV-SUBHEADER-001';
export const AIV_SMALL_FLARE_MOCK_CASE = 'RELIEF-COMBINED';

function sourceInput(massFlowKgS) {
  return {
    caseId: AIV_SMALL_FLARE_MOCK_CASE,
    sourceDeviceType: 'RELIEF_VALVE',
    sourceState: 'RELIEVING',
    phase: 'GAS',
    massFlow: { value: massFlowKgS, unit: 'kg/s' },
    upstreamPressure: { value: 5, unit: 'MPa', basis: 'ABSOLUTE' },
    downstreamPressure: { value: 1, unit: 'MPa', basis: 'ABSOLUTE' },
    upstreamTemperature: { value: 300, unit: 'K' },
    molecularWeight: { value: 20, unit: 'g/mol' },
    lowNoiseTrim: { state: 'NONE' },
    sonicState: 'SONIC',
    source: 'AIV_SMALL_FLARE_CONTROLLED_MOCK',
    sourceRevision: 'COMMON-PR3',
    status: 'CONTROLLED_INTEGRATION_MOCK',
  };
}

function assessmentInput() {
  return {
    assessmentType: 'WELDED_TEE',
    mainOutsideDiameter: { value: 219.1, unit: 'mm' },
    mainInsideDiameter: { value: 202.74, unit: 'mm' },
    mainWallThickness: { value: 8.18, unit: 'mm' },
    branchOutsideDiameter: { value: 114.3, unit: 'mm' },
    branchWallThickness: { value: 6.02, unit: 'mm' },
    material: 'Carbon Steel',
    duplexState: 'NO',
    source: 'AIV_SMALL_FLARE_CONTROLLED_MOCK',
    sourceRevision: 'COMMON-PR3',
    status: 'CONTROLLED_INTEGRATION_MOCK',
  };
}

export function createAivSmallFlareMockNetwork() {
  return createAivFlareNetwork({
    networkId: AIV_SMALL_FLARE_MOCK_ID,
    revision: '1',
    source: 'AIV_SMALL_FLARE_CONTROLLED_MOCK',
    sourceRevision: 'COMMON-PR3',
    nodes: [
      {
        canonicalId: 'RV-101', kind: 'SOURCE', tag: 'RV-101', line: '2IN-RV101-BRANCH',
        sourceInput: sourceInput(7.307743040001822), presentation: { x: 110, y: 170 },
      },
      {
        canonicalId: 'RV-102', kind: 'SOURCE', tag: 'RV-102', line: '3IN-RV102-BRANCH',
        sourceInput: sourceInput(3.6625475182774654), presentation: { x: 110, y: 325 },
      },
      { canonicalId: 'J-101', kind: 'JUNCTION', tag: 'J-101', line: '4IN-SUBHEADER', presentation: { x: 390, y: 247 } },
      { canonicalId: 'J-102', kind: 'JUNCTION', tag: 'J-102', line: '8IN-FLARE-HEADER', presentation: { x: 600, y: 247 } },
      {
        canonicalId: 'AIV-ASSESS-HDR-001', kind: 'ASSESSMENT', tag: 'AIV-ASSESS-HDR-001',
        line: '8IN-FLARE-HEADER', assessmentInput: assessmentInput(), presentation: { x: 748, y: 247 },
      },
    ],
    segments: [
      { segmentId: 'RV101-BRANCH', fromNodeId: 'RV-101', toNodeId: 'J-101', line: '2IN-RV101-BRANCH', physicalLength: { value: 6, unit: 'm' } },
      { segmentId: 'RV102-BRANCH', fromNodeId: 'RV-102', toNodeId: 'J-101', line: '3IN-RV102-BRANCH', physicalLength: { value: 9, unit: 'm' } },
      { segmentId: 'SUBHEADER-4IN', fromNodeId: 'J-101', toNodeId: 'J-102', line: '4IN-SUBHEADER', physicalLength: { value: 12, unit: 'm' } },
      { segmentId: 'HEADER-8IN', fromNodeId: 'J-102', toNodeId: 'AIV-ASSESS-HDR-001', line: '8IN-FLARE-HEADER', physicalLength: { value: 20, unit: 'm' } },
    ],
  });
}
