import { createStagePackageManifest } from '../contracts/RvmStageModelContract.js';

export function createSampleStagePackageManifestV1() {
  return createStagePackageManifest({
    source: {
      fileName: 'sample-rvm-stage-model-v1.rvm',
      fileSize: 4096,
      fileHash: 'sha256-sample-stage-v1',
      units: 'm',
      coordinateBasis: 'rvm-native',
    },
    converterVersion: '20260630-stage-package-v1-sample',
    artifacts: [
      {
        id: 'artifact-stage-model',
        kind: 'stage-model-json',
        href: './sample-rvm-stage-model-v1.json',
        schema: 'RvmStageModel.v1',
        byteLength: 0,
        required: true,
      },
      {
        id: 'artifact-diagnostics',
        kind: 'diagnostics-json',
        href: './sample-rvm-stage-model-v1.diagnostics.json',
        schema: 'RvmStageDiagnostics.v1',
        byteLength: 0,
        required: true,
      },
    ],
    chunks: [
      {
        id: 'geometry-0',
        kind: 'geometry-bin',
        href: './geometry-0.bin',
        encoding: 'float32-uint32-interleaved-v1',
        byteLength: 0,
        required: false,
      },
    ],
    diagnostics: {
      href: './sample-rvm-stage-model-v1.diagnostics.json',
      schema: 'RvmStageDiagnostics.v1',
      required: true,
    },
  });
}
