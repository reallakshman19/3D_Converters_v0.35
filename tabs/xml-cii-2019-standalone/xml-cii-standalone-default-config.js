import { DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS } from '../../converters/xml-cii2019-core/restraint-type-mutation.js';

export const DEFAULT_XML_CII_2019_SUPPORT_CONFIG = Object.freeze({
  schema: 'xml-cii-2019-standalone-support-config/v1',
  splitCondensedValveFlange: true,
  split_condensed_valve_flange: true,
  useFrictionSentinelForNonYSupports: true,
  disableCiiSupportTagPopulation: true,
  convertDensityKgM3ToKgCm3: true,
  defaultStiffness: 1751270000000,
  defaultGap: 0,
  defaultFriction: 0.3,
  defaultTeeSifType: 0,
  useDefaultPipingClassMaterialCodeMap: true,
  inputXmlPipingClass: {
    tokenDelimiter: '-',
    tokenPosition: 5,
  },
  inputXmlRatingByPipingClass: {
    91261: '900',
  },
  inputXmlDtxrRestraintRules: [
    { label: 'Y/restraint support', typeCode: 14, patterns: ['PIPE REST', 'SHOE', 'SUPPORT TYPE-103', 'REST'] },
    { label: 'guide restraint', typeCode: 9, friction: -1.0101, patterns: ['GUIDE', 'PDO-TYPE-603'] },
    { label: 'line stop / directional anchor', typeCode: 8, friction: -1.0101, patterns: ['DIRECTIONAL ANCHOR', 'ANCHOR', 'LINE STOP'] },
  ],
  inputXmlRestraintTypeMutation: {
    enabled: true,
    rows: DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS.map((row) => ({ ...row })),
  },
});

export function defaultXmlCii2019SupportConfigJson() {
  return JSON.stringify(DEFAULT_XML_CII_2019_SUPPORT_CONFIG, null, 2);
}
