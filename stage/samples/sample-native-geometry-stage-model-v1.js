import {
  createComponentAssemblyRef,
  createDiagnosticFallback,
  createNativeGeometryMetadata,
  createNativeRecordRef,
} from '../contracts/RvmStageModelContract.js';
import { createSampleRvmStageModelV1 } from './sample-rvm-stage-model-v1.js';

export function createSampleNativeGeometryStageModelV1() {
  const model = createSampleRvmStageModelV1();
  addNativeMetadataExample(model);
  addComponentAssemblyExample(model);
  addDiagnosticFallbackExample(model);
  return model;
}

function addNativeMetadataExample(model) {
  const primitive = model.primitives[0];
  const bboxWorld = primitive.transform.bboxWorld;
  const bboxLocal = primitive.transform.bboxLocal;
  primitive.nativeRecord = createNativeRecordRef({
    source: 'sample-fixture',
    recordType: 'SAMPLE_NATIVE',
    recordOffset: primitive.native.recordOffset,
    nativeCode: primitive.native.code,
    decoded: true,
  });
  primitive.nativeParams = { ...primitive.params, sampleOnly: true };
  primitive.transform3x4 = primitive.transform.matrix3x4;
  primitive.bboxLocal = bboxLocal;
  primitive.bboxWorld = bboxWorld;
  primitive.recipeSource = { source: 'native', quality: 'full', output: 'procedural', recipeId: 'sample-native-cylinder' };
  primitive.nativeGeometry = createNativeGeometryMetadata({
    nativeRecord: primitive.nativeRecord,
    nativeParams: primitive.nativeParams,
    transform3x4: primitive.transform3x4,
    bboxLocal,
    bboxWorld,
  });
}

function addComponentAssemblyExample(model) {
  const component = model.components[0];
  component.componentAssembly = createComponentAssemblyRef({
    id: 'assembly-sample-pipe-001',
    componentId: component.id,
    primitiveIds: [...component.primitiveIds],
  });
  component.recipeSource = { source: 'component-assembly', quality: 'full', recipeId: 'sample-component-assembly' };
}

function addDiagnosticFallbackExample(model) {
  const primitive = model.primitives.at(-1);
  const component = model.components.find((item) => item.id === primitive.componentId);
  const fallback = createDiagnosticFallback({
    kind: 'unknown-native-code',
    visible: true,
    message: 'Sample unknown native code remains diagnostic fallback only.',
  });
  primitive.diagnosticFallback = fallback;
  primitive.recipeSource = { source: 'diagnostic-fallback', quality: 'full', output: 'bbox', recipeId: 'sample-diagnostic-bbox' };
  component.diagnosticFallback = fallback;
  component.recipeSource = { source: 'diagnostic-fallback', quality: 'full', output: 'bbox', recipeId: 'sample-component-diagnostic-bbox' };
}
