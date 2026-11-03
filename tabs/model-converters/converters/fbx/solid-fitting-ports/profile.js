import { AUTO_PIPE_PROFILE, scaledTolerance } from '../auto-pipe/profile.js';

export const SOLID_FITTING_PORT_PROFILE = Object.freeze({
  schema: 'FbxSolidFittingPortProfile.v3',
  planarJoinDotTolerance: 0.999,
  minimumRegionAreaRatio: 0.75,
  coAxialDotTolerance: 0.01,
  radiusTaperRatio: 0.05,
  shortSpanRadiusRatio: 1.5,
  minimumSpanMm: AUTO_PIPE_PROFILE.minimumSpanMm,
  radiusAbsoluteMm: AUTO_PIPE_PROFILE.radiusAbsoluteMm,
  radiusRatio: AUTO_PIPE_PROFILE.radiusRatio,
  vertexMergeAbsoluteMm: 2e-6,
  vertexMergeRelativeTolerance: 0,
  terminalCapBridgeAbsoluteMm: 1e-4,
  maximumPortsPerOccurrence: 4,
});

export { scaledTolerance };
