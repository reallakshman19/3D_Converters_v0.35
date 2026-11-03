export const EI_AVIFF_APPENDIX_B_SOURCE = Object.freeze({
  repository: 'reallaksh19/Advanced_Analysis',
  commit: '6111ddbc0f27dd95b50a80c569a2c4daba3b3921',
  path: 'docs/EI data/Appendix_B_Defaults_and_Fluid_Properties.md',
  gitBlobSha1: '1d26832aa3ba1e2a99f680ea3d8243490e0ffeb6',
  sizeBytes: 7972,
});

export const EI_AVIFF_APPENDIX_B_MASTER_IDS = Object.freeze({
  liquidSpeedOfSound: 'EI_AVIFF.APPENDIX_B.LIQUID_SPEED_OF_SOUND_20C',
  reynoldsRule: 'EI_AVIFF.APPENDIX_B.REYNOLDS_CHARACTERISTIC_DIMENSION_RULE',
  gasDynamicViscosity: 'EI_AVIFF.APPENDIX_B.GAS_DYNAMIC_VISCOSITY',
  gasThermodynamicDefaults: 'EI_AVIFF.APPENDIX_B.GAS_THERMODYNAMIC_DEFAULTS',
  waterVaporPressure: 'EI_AVIFF.APPENDIX_B.WATER_VAPOR_PRESSURE',
  mechanicalExcitation: 'EI_AVIFF.T2_3.MECHANICAL_EXCITATION_BASELINE_LOF',
});

export const EI_APPENDIX_B_DEFAULT_USE_POLICY = Object.freeze({
  schema: 'EiAppendixBDefaultUsePolicy.v1',
  precedence: Object.freeze(['PROJECT_EXPLICIT', 'ACTIVE_EI_METHOD_MASTER', 'APPENDIX_B_DEFAULT']),
  automaticFallbackAllowed: false,
  explicitAcceptanceRequired: true,
  interpolationAllowed: false,
  extrapolationAllowed: false,
});

export const EI_LIQUID_SOUND_ROWS = Object.freeze([
  ['BENZENE', 1321], ['CRUDE_OIL', 1385], ['ETHANOL', 1180], ['ETHYL_ETHER', 1008],
  ['GASOLINE', 1166], ['HEPTENE', 1082], ['HEXANE', 1203], ['HYDRAULIC_OIL', 1280],
  ['KEROSENE', 1315], ['METHANOL', 1123], ['NAPHTHA', 1225], ['NONANE', 1248],
  ['OCTANE', 1192], ['PENTANE', 1008], ['SEA_WATER', 1481], ['WATER_PURE_REF', 1482],
].map(([liquidKey, speedOfSoundMps]) => Object.freeze({
  liquidKey, referenceTemperatureC: 20, speedOfSoundMps,
})));

const GAS_VISCOSITY_TEMPERATURES_C = Object.freeze([-50, 0, 50, 150, 250, 350, 450]);

function viscositySeries(gasKey, valuesTimes1e5) {
  return Object.freeze({
    gasKey,
    points: Object.freeze(valuesTimes1e5.map((value, index) => Object.freeze({
      temperatureC: GAS_VISCOSITY_TEMPERATURES_C[index],
      dynamicViscosityPaS: value * 1e-5,
    }))),
  });
}

export const EI_GAS_VISCOSITY_ROWS = Object.freeze([
  viscositySeries('AIR', [1.46, 1.72, 1.96, 2.39, 2.76, 3.11, 3.44]),
  viscositySeries('METHANE_SG_0_55', [0.88, 1.03, 1.18, 1.44, 1.67, 1.88, 2.08]),
  viscositySeries('HC_GAS_SG_0_75', [0.78, 0.92, 1.05, 1.29, 1.51, 1.71, 1.89]),
  viscositySeries('HC_GAS_SG_1_00', [0.68, 0.81, 0.94, 1.16, 1.36, 1.54, 1.71]),
  viscositySeries('NITROGEN', [1.41, 1.66, 1.89, 2.30, 2.65, 2.98, 3.28]),
  viscositySeries('CARBON_DIOXIDE', [1.15, 1.39, 1.62, 2.05, 2.44, 2.80, 3.12]),
  viscositySeries('HYDROGEN', [0.74, 0.84, 0.94, 1.12, 1.28, 1.42, 1.56]),
  viscositySeries('HELIUM', [1.68, 1.87, 2.06, 2.41, 2.74, 3.05, 3.34]),
  viscositySeries('OXYGEN', [1.65, 1.92, 2.18, 2.64, 3.05, 3.42, 3.76]),
]);

export const EI_GAS_THERMODYNAMIC_ROWS = Object.freeze([
  ['METHANE', 16.04, 1.31, 446, 20], ['ETHANE', 30.07, 1.19, 310, 20],
  ['PROPANE', 44.10, 1.13, 250, 20], ['DRY_NATURAL_GAS_SG_0_65', 18.85, 1.28, 408, 20],
  ['AIR', 28.96, 1.40, 343, 20], ['NITROGEN', 28.01, 1.40, 349, 20],
  ['CARBON_DIOXIDE', 44.01, 1.29, 267, 20], ['CHLORINE', 70.90, 1.34, 215, 20],
  ['STEAM_WATER_VAPOR', 18.02, 1.33, 478, 100], ['HYDROGEN', 2.016, 1.41, 1308, 20],
].map(([gasKey, molecularWeightKgPerKmol, gamma, sonicVelocityMps, referenceTemperatureC]) => (
  Object.freeze({ gasKey, molecularWeightKgPerKmol, gamma, sonicVelocityMps, referenceTemperatureC })
)));

export const EI_WATER_VAPOR_PRESSURE_ROWS = Object.freeze([
  [0, 0.0061], [10, 0.0123], [20, 0.0234], [30, 0.0425], [40, 0.0738],
  [50, 0.1235], [60, 0.1994], [70, 0.3120], [80, 0.4741], [90, 0.7018],
  [100, 1.0133], [120, 1.9854], [150, 4.7580],
].map(([temperatureC, vaporPressureBarA]) => Object.freeze({
  temperatureC, vaporPressureBarA, vaporPressureKPaA: vaporPressureBarA * 100,
})));

export const EI_REYNOLDS_RULE = Object.freeze({
  equationId: 'EI-AVIFF-B9-REYNOLDS',
  expression: 'rho*v*Dchar/(1000*mu)',
  densityUnit: 'kg/m3', velocityUnit: 'm/s', characteristicDimensionUnit: 'mm',
  dynamicViscosityUnit: 'Pa.s', resultUnit: '1',
  characteristicDimensions: Object.freeze({
    DEADLEG_T2_6_3: 'MAIN_PIPE_INTERNAL_DIAMETER',
    THERMOWELL_STRAIGHT: 'D_TW_TIP',
    THERMOWELL_TAPERED: 'D2_TIP',
    THERMOWELL_STEPPED: 'D2_TIP',
  }),
});

export const EI_MECHANICAL_EXCITATION_ROWS = Object.freeze([
  ['RECIP_PD_COMPRESSOR_OR_PUMP', 0.90, 0.40, 'TM09_DYNAMIC_STUDY_NO_HARMONIC_COINCIDENCE'],
  ['DIESEL_OR_GAS_ENGINE_DRIVE', 0.80, 0.40, 'TM09_MODAL_SEPARATION_NO_HARMONIC_RESONANCE'],
  ['SCREW_COMPRESSOR_OR_PUMP', 0.60, null, 'ROTOR_POCKET_PASS_FREQUENCY_CHECK'],
  ['CENTRIFUGAL_PUMP', 0.40, null, 'STANDARD_ROTATING_MACHINE_BASELINE'],
  ['ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW', 0.40, null, 'ELECTRICAL_AND_MECHANICAL_FREQUENCY_CHECK'],
  ['ELECTRIC_MOTOR_OR_ALTERNATOR_LT_15KW', 0.20, null, 'LOW_MECHANICAL_POWER_EXCITATION'],
  ['CENTRIFUGAL_COMPRESSOR', 0.20, null, 'CONTINUOUS_FLOW_BASELINE'],
  ['GAS_TURBINE', 0.20, null, 'HIGH_FREQUENCY_LOW_FLEXURAL_COUPLING'],
  ['FAN_OR_BLOWER', 0.20, null, 'BLADE_PASS_FREQUENCY_CHECK'],
].map(([sourceKey, baselineLof, qualifiedReducedLof, qualificationGate]) => Object.freeze({
  sourceKey, baselineLof, qualifiedReducedLof, qualificationGate,
})));

export const EI_SHARED_SUPPORT_TRANSFER_RULE = Object.freeze({
  sourceKey: 'PIPEWORK_SHARING_SUPPORTS_WITH_LINE_LOF_GE_0_50',
  adjacentLofThreshold: 0.50,
  resultRule: 'EQUAL_ADJACENT_LOF',
  qualificationGate: 'TRANSMITTED_STRUCTURAL_EXCITATION_ACROSS_SHARED_SUPPORTS',
});
