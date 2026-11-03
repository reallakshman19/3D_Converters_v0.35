export const GENERATED_GAP_PIPE_METHOD = 'EXPLICIT_LINK_STRAIGHT_GAP_V1';

export const GENERATED_GAP_PIPE_PROFILE = Object.freeze({
  schema: 'FbxGeneratedGapPipeProfile.v1',
  coincidenceToleranceMm: 1e-6,
  axisAlignmentDotTolerance: 1e-6,
  maximumLengthPolicy: 'EXPLICIT_LINK_ENDPOINT_DISTANCE',
  maximumGeneratedGapLengthMm: null,
});

export function generatedGapPipeProfileDisclosure(profile = GENERATED_GAP_PIPE_PROFILE) {
  return [
    `Coincidence tolerance: ${profile.coincidenceToleranceMm} mm.`,
    `Endpoint-axis dot tolerance: ${profile.axisAlignmentDotTolerance}.`,
    'No hidden maximum gap length is applied; the approved explicit link defines the two endpoints.',
    'No proximity, name, renderer, or nearest-neighbour connection is accepted.',
  ].join(' ');
}
