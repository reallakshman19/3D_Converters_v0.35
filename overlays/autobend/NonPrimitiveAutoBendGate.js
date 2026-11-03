import {
  isRvmPrimitiveSourceKind,
  isRvmSourcePreviewKind,
  normalizeRvmSourceKind,
  sourceKindFromContext as resolveSourceKindFromContext,
  sourceKindFromFileName as resolveSourceKindFromFileName,
} from '../../RvmSourceKindPolicy.js';

const NON_PRIMITIVE_AUTO_BEND_KINDS = new Set(['json', 'jscon', 'inputxml', 'txt', 'stagedjson']);

export function normalizeSourceKind(value) {
  return normalizeRvmSourceKind(value);
}

export function sourceKindFromFileName(fileName = '') {
  return resolveSourceKindFromFileName(fileName);
}

export function sourceKindFromContext(context = {}) {
  return resolveSourceKindFromContext(context);
}

export function canUseAutoBend(context = {}) {
  const sourceKind = sourceKindFromContext(context);
  if (!isRvmSourcePreviewKind(sourceKind) || !NON_PRIMITIVE_AUTO_BEND_KINDS.has(sourceKind)) return false;
  if (isRvmPrimitiveSourceKind(sourceKind)) return false;
  if (context.modelPrimitiveMode === 'rvm-native') return false;
  if (context.modelPrimitiveMode === 'glb-native') return false;
  if (context.viewerMode === 'rvm') return false;
  if (context.viewerMode === 'glb') return false;
  return true;
}

export const NON_PRIMITIVE_AUTO_BEND_SOURCE_KINDS = Object.freeze({
  nonPrimitive: [...NON_PRIMITIVE_AUTO_BEND_KINDS],
  primitive: ['rvm', 'rev', 'glb', 'gltf'],
});
