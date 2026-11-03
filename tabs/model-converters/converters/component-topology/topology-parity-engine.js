/** Public topology parity facade. */
export {
  compareCanonicalToInputXml,
  compareCanonicalToSvgScene,
  compareInputXmlToSvgScene,
} from './topology-parity-comparisons.js';
export {
  buildTopologyParityReport,
  topologyParityMismatchesCsv,
  TopologyParityError,
} from './topology-parity-report.js';
export { GLOBAL_DECIMALS, DELTA_DECIMALS } from './topology-parity-values.js';
export const TOPOLOGY_PARITY_NORMALIZATION = Object.freeze({
  globalCoordinateDecimals: 3,
  deltaDecimals: 6,
  toleranceMm: 0,
});
