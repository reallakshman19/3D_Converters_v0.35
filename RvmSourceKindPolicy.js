export const RVM_SOURCE_KIND_POLICY_VERSION = '20260628-rvm-source-kind-policy-2';

export const RVM_PRIMITIVE_SOURCE_KINDS = Object.freeze(['rvm', 'rev', 'glb', 'gltf']);
export const RVM_SOURCE_PREVIEW_KINDS = Object.freeze(['json', 'jscon', 'inputxml', 'txt', 'source-preview', 'stagedjson']);

const PRIMITIVE_SOURCE_KIND_SET = new Set(RVM_PRIMITIVE_SOURCE_KINDS);
const SOURCE_PREVIEW_KIND_SET = new Set(RVM_SOURCE_PREVIEW_KINDS);

export function normalizeRvmSourceKind(value = '') {
  const kind = String(value || '').trim().toLowerCase().replace(/^\./, '');
  if (!kind) return '';
  if (kind === 'aveva-json') return 'json';
  if (kind === 'xml' || kind === 'uxml') return 'inputxml';
  if (kind === 'staged-json' || kind === 'staged_json' || kind === 'staged.json') return 'stagedjson';
  if (kind === 'rvm_binary' || kind === 'rvm-binary') return 'rvm';
  return kind;
}

export function sourceKindFromFileName(fileName = '') {
  const lower = String(fileName || '').trim().toLowerCase();
  if (!lower) return '';
  if (lower.endsWith('.stagedjson') || lower.endsWith('.staged.json') || /managed[_-]stage\.json$/i.test(lower)) return 'stagedjson';
  if (lower.endsWith('.uxml') || lower.endsWith('.uxml.json') || lower.endsWith('.inputxml')) return 'inputxml';
  if (lower.endsWith('.jscon')) return 'jscon';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.rev')) return 'rev';
  if (lower.endsWith('.rvm')) return 'rvm';
  if (lower.endsWith('.glb')) return 'glb';
  if (lower.endsWith('.gltf')) return 'gltf';
  if (lower.endsWith('.json')) return 'json';
  return '';
}

export function sourceKindFromContext(context = {}) {
  const explicitKind = context.sourceKind || context.loadedSourceKind;
  if (explicitKind) return normalizeRvmSourceKind(explicitKind);
  const fileNameKind = sourceKindFromFileName(context.fileName);
  return normalizeRvmSourceKind(fileNameKind || context.fileExtension || '');
}

export function isRvmPrimitiveSourceKind(kind) {
  return PRIMITIVE_SOURCE_KIND_SET.has(normalizeRvmSourceKind(kind));
}

export function isRvmSourcePreviewKind(kind) {
  return SOURCE_PREVIEW_KIND_SET.has(normalizeRvmSourceKind(kind));
}

export function isRvmNonPrimitiveSourceKind(kind) {
  const normalized = normalizeRvmSourceKind(kind);
  return isRvmSourcePreviewKind(normalized) && !isRvmPrimitiveSourceKind(normalized);
}
