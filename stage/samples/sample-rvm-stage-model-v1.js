import {
  addStageDiagnostic,
  createEmptyRvmStageModel,
  makeStageId,
} from '../contracts/RvmStageModelContract.js';

export function createSampleRvmStageModelV1() {
  const model = createEmptyRvmStageModel({
    fileName: 'sample-rvm-stage-model-v1.rvm',
    fileSize: 4096,
    fileHash: 'sha256-sample-stage-v1',
    units: 'm',
  });

  const definitions = createDefinitions();
  for (const item of definitions) addComponentWithPrimitives(model, item);
  addUnknownDiagnosticPrimitive(model);
  return model;
}

function createDefinitions() {
  return [
    {
      name: '/RMSS/PIPE-001',
      semanticType: 'PIPE',
      bboxWorld: [0, -0.15, -0.15, 4, 0.15, 0.15],
      primitives: [nativePrimitive('CYLINDER', 8, [0, -0.15, -0.15, 4, 0.15, 0.15], { radius: 0.15, length: 4 })],
    },
    {
      name: '/RMSS/ELBOW-001',
      semanticType: 'ELBOW',
      bboxWorld: [3.85, -0.15, -0.15, 4.35, 0.65, 0.15],
      primitives: [nativePrimitive('ELBOW', 4, [3.85, -0.15, -0.15, 4.35, 0.65, 0.15], { radius: 0.15, bendRadius: 0.5, angleDeg: 90 })],
    },
    {
      name: '/RMSS/TEE-001',
      semanticType: 'TEE',
      bboxWorld: [4.35, -0.15, -0.15, 6.15, 1.1, 0.15],
      primitives: [
        nativePrimitive('CYLINDER', 8, [4.35, -0.15, -0.15, 6.15, 0.15, 0.15], { radius: 0.15, length: 1.8 }),
        nativePrimitive('CYLINDER', 8, [5.1, 0, -0.12, 5.4, 1.1, 0.12], { radius: 0.12, length: 1.1 }),
      ],
    },
    {
      name: '/RMSS/FLANGE-001',
      semanticType: 'FLANGE',
      bboxWorld: [6.15, -0.32, -0.32, 6.45, 0.32, 0.32],
      primitives: [nativePrimitive('CYLINDER', 8, [6.15, -0.32, -0.32, 6.45, 0.32, 0.32], { radius: 0.32, length: 0.3 })],
    },
    {
      name: '/RMSS/SUPPORT-PLATE-001',
      semanticType: 'SUPPORT',
      bboxWorld: [2.2, -0.4, -0.35, 2.8, -0.2, 0.35],
      primitives: [nativePrimitive('FACET_GROUP', 11, [2.2, -0.4, -0.35, 2.8, -0.2, 0.35], { facets: 12 })],
    },
    {
      name: '/RMSS/FOUNDATION-001',
      semanticType: 'FOUNDATION',
      bboxWorld: [1.8, -0.8, -0.5, 3.2, -0.4, 0.5],
      primitives: [nativePrimitive('BOX', 2, [1.8, -0.8, -0.5, 3.2, -0.4, 0.5], { size: [1.4, 0.4, 1] })],
    },
  ];
}

function addComponentWithPrimitives(model, definition) {
  const nodeId = makeStageId('node', model.hierarchy.nodes.length + 1);
  const componentId = makeStageId('comp', model.components.length + 1);
  const firstPrimitiveIndex = model.primitives.length + 1;
  const primitiveIds = definition.primitives.map((_, index) => makeStageId('prim', firstPrimitiveIndex + index));

  model.hierarchy.nodes.push(createNode(nodeId, definition, componentId, primitiveIds));
  model.components.push(createComponent(componentId, nodeId, definition, primitiveIds));

  for (const primitive of definition.primitives) {
    const primitiveId = primitiveIds.shift();
    model.primitives.push(createPrimitive(primitiveId, nodeId, componentId, primitive));
  }
}

function addUnknownDiagnosticPrimitive(model) {
  const nodeId = makeStageId('node', model.hierarchy.nodes.length + 1);
  const componentId = makeStageId('comp', model.components.length + 1);
  const primitiveId = makeStageId('prim', model.primitives.length + 1);
  const bboxWorld = [7, -0.25, -0.25, 7.5, 0.25, 0.25];
  const diagnostic = {
    severity: 'warning',
    code: 'STAGE_FALLBACK_UNKNOWN_NATIVE_CODE',
    message: 'Native primitive code 99 is not decoded; emitting diagnostic bbox only.',
    ref: { nodeId, componentId, primitiveId, nativeCode: 99, recordOffset: 9001 },
    fallback: { reason: 'unknown-native-code', renderKind: 'UNKNOWN_DIAGNOSTIC', recipe: 'bbox-wireframe' },
  };
  const definition = {
    name: '/RMSS/UNKNOWN-CODE-99',
    semanticType: 'UNKNOWN',
    bboxWorld,
    geometryConfidence: 'diagnostic',
    semanticConfidence: 'unknown',
    diagnostics: [diagnostic],
  };

  model.hierarchy.nodes.push(createNode(nodeId, definition, componentId, [primitiveId]));
  model.components.push(createComponent(componentId, nodeId, definition, [primitiveId]));
  model.primitives.push({
    id: primitiveId,
    nodeId,
    componentId,
    native: { recordOffset: 9001, code: 99, kind: 'Unknown', decoded: false },
    transform: { matrix3x4: identityMatrix3x4(), bboxLocal: bboxWorld, bboxWorld },
    params: { diagnosticBBox: true },
    confidence: { geometry: 'diagnostic', semantic: 'unknown' },
    renderKind: 'UNKNOWN_DIAGNOSTIC',
    materialId: 'mat-diagnostic',
    diagnostics: [diagnostic],
  });
  model.diagnostics = addStageDiagnostic(model.diagnostics, diagnostic);
}

function nativePrimitive(renderKind, code, bboxWorld, params) {
  return { renderKind, code, bboxWorld, params };
}

function createNode(id, definition, componentId, primitiveIds) {
  return {
    id,
    parentId: 'node-root',
    name: definition.name,
    path: definition.name,
    kind: 'RVM_STAGE_SAMPLE_NODE',
    componentIds: [componentId],
    primitiveIds: [...primitiveIds],
    bboxWorld: definition.bboxWorld,
  };
}

function createComponent(id, nodeId, definition, primitiveIds) {
  return {
    id,
    nodeId,
    semanticType: definition.semanticType,
    name: definition.name,
    ownerPath: definition.name,
    primitiveIds: [...primitiveIds],
    bboxWorld: definition.bboxWorld,
    confidence: {
      geometry: definition.geometryConfidence || 'native',
      semantic: definition.semanticConfidence || 'attribute',
    },
    renderPolicy: createRenderPolicy(),
    diagnostics: definition.diagnostics || [],
  };
}

function createPrimitive(id, nodeId, componentId, primitive) {
  return {
    id,
    nodeId,
    componentId,
    native: { recordOffset: Number(id.split('-').at(-1)) * 128, code: primitive.code, kind: primitive.renderKind, decoded: true },
    transform: { matrix3x4: identityMatrix3x4(), bboxLocal: primitive.bboxWorld, bboxWorld: primitive.bboxWorld },
    params: primitive.params,
    confidence: { geometry: 'native', semantic: 'attribute' },
    renderKind: primitive.renderKind,
    materialId: 'mat-sample-steel',
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

function identityMatrix3x4() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
}
