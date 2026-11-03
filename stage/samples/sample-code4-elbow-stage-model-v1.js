import { createEmptyRvmStageModel } from '../contracts/RvmStageModelContract.js';

export const SAMPLE_CODE4_ELBOW_STAGE_MODEL_NOTE = 'Staged fixture only; not binary decoded and not GAS/RMSS evidence.';

const MATRIX = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
const BBOX = Object.freeze([0, 0, -0.125, 0.75, 0.75, 0.125]);
const PARAMS = Object.freeze({ radius: 0.125, bendRadius: 0.5, angleDeg: 90, sweepRadians: Math.PI / 2, plane: 'XY' });

export function createSampleCode4ElbowStageModelV1() {
  const model = createEmptyRvmStageModel({ fileName: 'sample-code4-elbow-stage-model-v1.rvm', fileSize: 0, fileHash: 'sha256-stage-code4-elbow-fixture', units: 'm' });
  model.hierarchy.nodes.push({
    id: 'node-code4-elbow-001',
    parentId: 'node-root',
    name: 'CODE4_ELBOW_STAGED_FIXTURE',
    path: '/STAGED-FIXTURE/CODE4_ELBOW',
    kind: 'STAGED_CODE4_ELBOW_FIXTURE',
    componentIds: ['comp-code4-elbow-001'],
    primitiveIds: ['prim-code4-elbow-001'],
    bboxWorld: [...BBOX],
  });
  model.components.push({
    id: 'comp-code4-elbow-001',
    nodeId: 'node-code4-elbow-001',
    semanticType: 'ELBOW',
    name: 'Code 4 elbow staged fixture',
    ownerPath: '/STAGED-FIXTURE/CODE4_ELBOW',
    primitiveIds: ['prim-code4-elbow-001'],
    bboxWorld: [...BBOX],
    confidence: { geometry: 'native', semantic: 'attribute' },
    renderPolicy: { full: 'native-primitives', medium: 'simplified-primitives', light: 'proxy-bbox', skeleton: 'centerline-or-icon', hidden: 'hide' },
    diagnostics: [],
  });
  model.primitives.push(createCode4ElbowPrimitive('prim-code4-elbow-001'));
  return model;
}

export function createIncompleteCode4ElbowPrimitiveFixture() {
  const primitive = createCode4ElbowPrimitive('prim-code4-elbow-incomplete');
  primitive.nativeParams = { radius: 0.125, angleDeg: 90 };
  primitive.nativeGeometry.nativeParams = primitive.nativeParams;
  primitive.params = primitive.nativeParams;
  return primitive;
}

function createCode4ElbowPrimitive(id) {
  const nativeRecord = { schema: 'StageNativeGeometryContract.v1', source: 'stage-fixture', recordType: 'RVM_PRIMITIVE', recordOffset: 512, nativeCode: 4, recordLength: 96, decoded: true };
  return {
    id,
    nodeId: 'node-code4-elbow-001',
    componentId: 'comp-code4-elbow-001',
    native: { recordOffset: 512, code: 4, kind: 'ELBOW', decoded: true },
    nativeRecord,
    nativeParams: { ...PARAMS },
    nativeGeometry: { schema: 'StageNativeGeometryContract.v1', provenance: 'native', nativeRecord, nativeParams: { ...PARAMS }, transform3x4: [...MATRIX], bboxLocal: [...BBOX], bboxWorld: [...BBOX], recipeSource: { source: 'native', output: 'procedural', recipeId: 'code4-elbow-staged-fixture' } },
    recipeSource: { source: 'native', output: 'procedural', recipeId: 'code4-elbow-staged-fixture' },
    transform: { matrix3x4: [...MATRIX], bboxLocal: [...BBOX], bboxWorld: [...BBOX] },
    transform3x4: [...MATRIX],
    bboxLocal: [...BBOX],
    bboxWorld: [...BBOX],
    params: { ...PARAMS },
    confidence: { geometry: 'native', semantic: 'attribute' },
    renderKind: 'ELBOW',
    materialId: 'mat-code4-fixture-steel',
    diagnostics: [],
  };
}
