/**
 * report-data.js — Static data extracted from the PDF summary report.
 * Doc: 08572-TRHT-RT-PI-00-OO-313  Rev 0
 * Project: Tinrhert Field Development Project – EPC 1
 */

export const META = {
  docNumber: 'XX-XX-PFEED-',
  title: 'Pipe Stress Calculation Summary Report',
  project: 'Petroleum Development Oman-PDO',
  facility: 'Inlet Separation and Boosting Facility, Ohanet',
  system: 'SYS-177A',
  projNumber: 'JI-2043',
  designCode: 'ASME B31.3 - 2016',
  software: 'CAESAR-II 2018 (Ver 10.0)',
  revision: 'Rev 0',
  date: '—',
};

export const DESIGN_PARAMS = {
  T1: { value: 150, unit: '°C', label: 'Max Design Temperature' },
  T2: { value: 72.2, unit: '°C', label: 'Normal Operating Temperature' },
  T3: { value: -35, unit: '°C', label: 'Min Design Temperature' },
  P1: { value: 78, unit: 'bar', label: 'Design Pressure' },
  plantLife: { value: 25, unit: 'years', label: 'Plant Life' },
  operatingHours: { value: 7000, unit: 'hrs', label: 'Operating Hours' },
  thermalCycles: { value: 25, unit: '', label: 'Thermal Cycles' },
  maxVerticalDeflection: { value: 10, unit: 'mm', label: 'Max Sustained Vertical Mid-span Deflection' },
};

export const SCOPE_ITEMS = [
  { id: 'code',    label: 'Code compliance check',       conclusion: 'STRESSES WITHIN CODE ALLOWABLE LIMITS' },
  { id: 'nozzle',  label: 'Nozzle loads check',           conclusion: 'NOZZLE LOADS WITHIN ALLOWABLE LIMITS' },
  { id: 'support', label: 'Support loads calculation',    conclusion: 'SUSTAINED SAG WITHIN THE LIMIT' },
  { id: 'hydro',   label: 'Hydro test run',               conclusion: 'HYDRO TEST STRESS WITHIN LIMITS' },
  { id: 'flange',  label: 'Flange leakage check',         conclusion: 'FLANGE LEAKAGE CHECK PASSED' },
];

export const STRESS_TABLE = [
  { loadCase: 'Hydro Test',                node: 380, calc: 159.6, allow: 482.6, ratio: 33.1, status: 'PASS' },
  { loadCase: 'Sustained Stress',          node: 130, calc: 112.5, allow: 218.6, ratio: 51.5, status: 'PASS' },
  { loadCase: 'Expansion Stress',          node: 649, calc: 267.6, allow: null,  ratio: 29.1, status: 'PASS' },
  { loadCase: 'Occ+Sus Stress (Wind, Max)',node: 130, calc: 78.0,  allow: 290.7, ratio: 45.9, status: 'PASS' },
];

export const DISPLACEMENT_TABLE = [
  { node: 20,  dx: 0.0,  dy: 8.5,  dz: -2.1, loadCase: 'Operating', note: '—' },
  { node: 22,  dx: 0.0,  dy: 12.3, dz: -3.4, loadCase: 'Operating', note: '—' },
  { node: 380, dx: 1.2,  dy: 0.0,  dz: 0.5,  loadCase: 'Hydro',     note: '—' },
  { node: 130, dx: -0.5, dy: 3.2,  dz: 0.0,  loadCase: 'Operating', note: '—' },
  { node: 649, dx: 0.0,  dy: 6.1,  dz: -1.8, loadCase: 'Operating', note: '—' },
];

export const SPECIAL_SUPPORTS = [];

export const NOZZLE_LOADS = [];

export const FLANGE_DATA = [
  { location: 'System flanges', method: 'Equivalent Pressure Method', standard: 'ASME SEC III DIV1, NC 3658.3', status: 'PASS' },
];

export const REFERENCES = [];

export const ASSUMPTIONS = [];

export const NOTES = [];

export const CONCLUSIONS = [
  'STRESSES ARE WITHIN CODE ALLOWABLE LIMITS',
  'NOZZLE LOADS ARE WITHIN ALLOWABLE LIMITS',
  'FLANGE LEAKAGE CHECK PASSED',
  'SUSTAINED SAG WITHIN THE LIMIT',
];


export function buildCurrentReportData(appState) {
  return {
    meta: META,
    designParams: DESIGN_PARAMS,
    extractedAt: new Date().toISOString()
  };
}
