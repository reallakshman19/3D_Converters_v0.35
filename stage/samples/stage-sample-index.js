export const STAGE_SAMPLE_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'sample-rvm-stage-model-v1',
    label: 'Sample RvmStageModel.v1',
    schema: 'RvmStageModel.v1',
    href: './sample-rvm-stage-model-v1.json',
    description: 'Small staged model with pipe, elbow, tee, flange, support, foundation, and diagnostic fallback.',
  }),
]);

export function getStageSampleFixtureById(id) {
  return STAGE_SAMPLE_FIXTURES.find((fixture) => fixture.id === id);
}
