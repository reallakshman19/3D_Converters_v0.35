import { createHpPipingClassProject } from '../converters/b313-chapter-ix/hp-piping-class-project.js';

export const HP_PIPING_CLASS_REFERENCE_SAMPLE_VERSION = 'hp-piping-class-reference-samples/v2';
export const HP_PIPING_CLASS_NPS4_REFERENCE_ID = 'NPS4_S160_PRESSURE_FATIGUE_REGRESSION';
export const HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID = 'NPS4_S160_BROWNFIELD_PROJECTED_EOL';
export const HP_PIPING_CLASS_NPS4_STATIC_FAIL_REFERENCE_ID = 'NPS4_S160_STATIC_FAIL_REGRESSION';

const BASE_STATIC_EXPECTED = Object.freeze({
  pressureDesignThicknessMm: 7.7103934983403475,
  requiredMinimumThicknessMm: 10.710393498340348,
  requiredNominalThicknessMm: 12.240449712388969,
});

const NPS4_REFERENCE_EXPECTED = Object.freeze({
  ...BASE_STATIC_EXPECTED,
  minimumAsManufacturedThicknessMm: 11.80375,
  effectiveNetWallMm: 8.80375,
  selectedFatigueWallMm: 8.80375,
  pressureRatingMpa: 23.086120852009273,
  staticPass: true,
  cycleSaltMpa: 63.29949581051363,
  cumulativeUsage: 0.05,
});

const NPS4_BROWNFIELD_EXPECTED = Object.freeze({
  ...BASE_STATIC_EXPECTED,
  minimumAsManufacturedThicknessMm: 11.80375,
  effectiveNetWallMm: 8.80375,
  selectedFatigueWallMm: 8.7,
  projectedEndOfLifeWallMm: 8.7,
  pressureRatingMpa: 23.086120852009273,
  staticPass: true,
  cycleSaltMpa: 63.99142829153606,
  cumulativeUsage: 0.05,
});

const NPS4_STATIC_FAIL_EXPECTED = Object.freeze({
  ...BASE_STATIC_EXPECTED,
  minimumAsManufacturedThicknessMm: 10.0625,
  effectiveNetWallMm: 7.0625,
  pressureRatingMpa: 18.20329217044084,
  staticPass: false,
  cumulativeUsage: null,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fatigueBasis(calculationRef = 'HP-FAT-EXT-001') {
  return {
    code: 'ASME BPVC VIII-3',
    edition: '2025',
    methodRef: 'KD-3 external calculation',
    calculationRef,
    calculatedBy: 'ENGINEER_A',
    checkedBy: 'ENGINEER_B',
    checkedAt: '2026-08-16T04:30:00Z',
  };
}

function baseProject({ referenceSampleId, projectId, classId, revision, nominalWallMm = 13.49, wallState, withFatigue = true, userSaltMpa = NPS4_REFERENCE_EXPECTED.cycleSaltMpa } = {}) {
  return {
    schemaVersion: 'hp-piping-class-project/v2',
    metadata: {
      projectId,
      classId,
      revision,
      referenceSampleId,
      referenceSource: 'tests/hp-piping-class-orchestrator-parity.test.mjs::directProject',
    },
    methodManifest: {
      b313Edition: '2024',
      viii3Edition: '2025',
      calculationMode: 'USER_CALCULATED_KD3',
      nativeCoreKd3Qualified: false,
      codeCompliance: false,
      canUseForDesignAuthority: false,
    },
    classBasis: {
      designPressureMpa: 20,
      internalAllowanceMm: 3,
      externalAllowanceMm: 0,
    },
    products: [{
      productId: 'NPS4-S160',
      calculationBasis: {
        mode: 'DIRECT_ENGINEERING_INPUT',
        outsideDiameterMm: 114.3,
        allowableStressMpa: 138,
        nominalWallMm,
        minusTolerancePct: 12.5,
      },
      wallState: wallState ?? { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
    }],
    transient: withFatigue ? {
      spectrum: { spectrumId: 'HP-CS-001-SPECTRUM', designLifeYears: 20 },
      states: [
        { spectrumId: 'HP-CS-001-SPECTRUM', stateId: 'LOW', pressureMpa: 2, materialTemperatureC: 40, structuralTemperatureC: 40 },
        { spectrumId: 'HP-CS-001-SPECTRUM', stateId: 'HIGH', pressureMpa: 20, materialTemperatureC: 200, structuralTemperatureC: 200 },
      ],
      transitions: [{
        spectrumId: 'HP-CS-001-SPECTRUM', cycleId: 'C1', fromStateId: 'LOW', toStateId: 'HIGH',
        totalCycles: 500, category: 'PROCESS_CYCLE',
      }],
    } : { spectrum: null, states: [], transitions: [] },
    fatigueEvidence: withFatigue ? [{
      productId: 'NPS4-S160',
      externalResults: [{
        cycleId: 'C1', locationId: 'BORE_INNER_SURFACE', fromStateId: 'LOW', toStateId: 'HIGH',
        userAlternatingStressIntensityMpa: userSaltMpa,
        equivalentAlternatingStressMpa: 70,
        permissibleCycles: 10000,
        calculationBasis: fatigueBasis(referenceSampleId === HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID ? 'HP-FAT-EXT-BROWNFIELD-001' : 'HP-FAT-EXT-001'),
      }],
    }] : [],
  };
}

const RAW_REFERENCE_PROJECTS = Object.freeze({
  [HP_PIPING_CLASS_NPS4_REFERENCE_ID]: Object.freeze(baseProject({
    referenceSampleId: HP_PIPING_CLASS_NPS4_REFERENCE_ID,
    projectId: 'HP-PROJ-001', classId: 'HP-CS-001', revision: 'REFERENCE-A',
  })),
  [HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID]: Object.freeze(baseProject({
    referenceSampleId: HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID,
    projectId: 'HP-PROJ-BROWNFIELD-001', classId: 'HP-CS-BROWNFIELD', revision: 'REFERENCE-A',
    wallState: {
      fatigueWallBasis: 'PROJECTED_END_OF_LIFE',
      measuredCurrentWallMm: 10.2,
      futureInternalLossMm: 1.2,
      futureExternalLossMm: 0.3,
    },
    userSaltMpa: NPS4_BROWNFIELD_EXPECTED.cycleSaltMpa,
  })),
  [HP_PIPING_CLASS_NPS4_STATIC_FAIL_REFERENCE_ID]: Object.freeze(baseProject({
    referenceSampleId: HP_PIPING_CLASS_NPS4_STATIC_FAIL_REFERENCE_ID,
    projectId: 'HP-PROJ-STATIC-FAIL-001', classId: 'HP-CS-STATIC-FAIL', revision: 'REFERENCE-A',
    nominalWallMm: 11.5, withFatigue: false,
  })),
});

const SAMPLE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: HP_PIPING_CLASS_NPS4_REFERENCE_ID,
    label: 'NPS 4 · Sch 160 · pressure fatigue',
    shortLabel: 'Baseline pressure-fatigue',
    description: 'Executable canonical class regression: static wall, 2→20 MPa cycle, independently checked external Seq/N, and CORE Miner usage.',
    authority: 'SOFTWARE_REGRESSION_AND_EXTERNAL_KD3_REVIEW_ONLY',
    expected: NPS4_REFERENCE_EXPECTED,
  }),
  Object.freeze({
    id: HP_PIPING_CLASS_NPS4_BROWNFIELD_REFERENCE_ID,
    label: 'NPS 4 · Brownfield projected EOL wall',
    shortLabel: 'Brownfield EOL wall',
    description: 'Executable brownfield regression using measured current wall and future losses; fatigue uses the selected projected end-of-life wall.',
    authority: 'SOFTWARE_REGRESSION_AND_EXTERNAL_KD3_REVIEW_ONLY',
    expected: NPS4_BROWNFIELD_EXPECTED,
  }),
  Object.freeze({
    id: HP_PIPING_CLASS_NPS4_STATIC_FAIL_REFERENCE_ID,
    label: 'NPS 4 · Static wall fail',
    shortLabel: 'Static fail boundary',
    description: 'Executable negative regression with an 11.5 mm nominal wall; calculation executes but the static reference assessment fails.',
    authority: 'SOFTWARE_REGRESSION_ONLY',
    expected: NPS4_STATIC_FAIL_EXPECTED,
  }),
]);

export function createHpPipingClassReferenceProject(referenceId = HP_PIPING_CLASS_NPS4_REFERENCE_ID) {
  const raw = RAW_REFERENCE_PROJECTS[String(referenceId)];
  if (!raw) throw new RangeError(`Unknown HP Piping Class reference sample: ${referenceId}`);
  return createHpPipingClassProject(clone(raw));
}

export function createHpPipingClassNps4ReferenceProject() {
  return createHpPipingClassReferenceProject(HP_PIPING_CLASS_NPS4_REFERENCE_ID);
}

export function getHpPipingClassReferenceSamples() {
  return SAMPLE_DEFINITIONS.map((definition) => Object.freeze({
    ...definition,
    expected: { ...definition.expected },
    createProject: () => createHpPipingClassReferenceProject(definition.id),
  }));
}

export function getHpPipingClassReferenceSample(referenceId) {
  const definition = SAMPLE_DEFINITIONS.find((item) => item.id === String(referenceId));
  return definition ? Object.freeze({ ...definition, expected: { ...definition.expected } }) : null;
}

export function getHpPipingClassReferenceProjectId(project) {
  const id = String(project?.metadata?.referenceSampleId || '');
  return RAW_REFERENCE_PROJECTS[id] ? id : null;
}

export function isHpPipingClassReferenceProject(project) {
  return Boolean(getHpPipingClassReferenceProjectId(project));
}

export {
  NPS4_REFERENCE_EXPECTED as HP_PIPING_CLASS_NPS4_REFERENCE_EXPECTED,
  NPS4_BROWNFIELD_EXPECTED as HP_PIPING_CLASS_NPS4_BROWNFIELD_EXPECTED,
  NPS4_STATIC_FAIL_EXPECTED as HP_PIPING_CLASS_NPS4_STATIC_FAIL_EXPECTED,
};
