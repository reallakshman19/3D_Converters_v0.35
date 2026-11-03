import { createEmptyRvmStageModel } from '../contracts/RvmStageModelContract.js';

export function createInvalidRenderKindStageModel() {
  const model = createMinimalStageModel();
  model.primitives[0].renderKind = 'SEMANTIC_SUPPORT_STAND';
  return model;
}

export function createInvalidBboxStageModel() {
  const model = createMinimalStageModel();
  model.primitives[0].transform.bboxWorld = [2, 0, 0, 1, 1, 1];
  return model;
}

export function createSemanticOnlySupportStageModel() {
  const model = createMinimalStageModel();
  model.components[0].semanticType = 'SUPPORT';
  model.components[0].confidence.geometry = 'semantic-proxy';
  model.primitives[0].confidence.geometry = 'semantic-proxy';
  model.primitives[0].renderKind = 'SUPPORT_ASSEMBLY';
  return model;
}

export function createUndecodedNativeVisibleStageModel() {
  const model = createMinimalStageModel();
  model.primitives[0].native.decoded = false;
  model.primitives[0].native.code = 99;
  model.primitives[0].native.kind = 'Unknown';
  model.primitives[0].renderKind = 'CYLINDER';
  return model;
}

function createMinimalStageModel() {
  const model = createEmptyRvmStageModel({
    fileName: 'invalid-fixture.rvm',
    fileSize: 128,
    fileHash: 'sha256-invalid-fixture',
  });
  model.hierarchy.nodes.push(createNode());
  model.components.push(createComponent());
  model.primitives.push(createPrimitive());
  return model;
}

function createNode() {
  return {
    id: 'node-000001',
    parentId: 'node-root',
    name: '/INVALID/PIPE-001',
    path: '/INVALID/PIPE-001',
    kind: 'RVM_STAGE_INVALID_FIXTURE_NODE',
    componentIds: ['comp-000001'],
    primitiveIds: ['prim-000001'],
    bboxWorld: [0, 0, 0, 1, 1, 1],
  };
}

function createComponent() {
  return {
    id: 'comp-000001',
    nodeId: 'node-000001',
    semanticType: 'PIPE',
    name: '/INVALID/PIPE-001',
    ownerPath: '/INVALID/PIPE-001',
    primitiveIds: ['prim-000001'],
    bboxWorld: [0, 0, 0, 1, 1, 1],
    confidence: { geometry: 'native', semantic: 'attribute' },
    renderPolicy: createRenderPolicy(),
    diagnostics: [],
  };
}

function createPrimitive() {
  return {
    id: 'prim-000001',
    nodeId: 'node-000001',
    componentId: 'comp-000001',
    native: { recordOffset: 128, code: 8, kind: 'CYLINDER', decoded: true },
    transform: {
      matrix3x4: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      bboxLocal: [0, 0, 0, 1, 1, 1],
      bboxWorld: [0, 0, 0, 1, 1, 1],
    },
    params: { radius: 0.1, length: 1 },
    confidence: { geometry: 'native', semantic: 'attribute' },
    renderKind: 'CYLINDER',
    materialId: 'mat-invalid-fixture',
    diagnostics: [],
  };
}

function createRenderPolicy() {
  return {
    full: 'native-primitives',
    medium: 'simplified-primitives',
    light: 'proxy-bbox',
    skeleton: 'centerline-or-icon',
    hidden: 'hide',
  };
}
