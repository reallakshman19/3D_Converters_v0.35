import { applyBakedRestraintGlyph as applyBaseBakedRestraintGlyph } from './BakedRestraintGlyphCanvasAxisOverride.js';

function text(value) { return String(value ?? '').trim(); }
function upper(value) { return text(value).toUpperCase(); }

function supportKindOf(object = {}, comp = {}) {
  return upper(
    comp.kind
      || comp.supportKind
      || comp.normalizedKind
      || comp.restraintType
      || comp.sourceComponentType
      || object.userData?.supportKind
      || object.userData?.sourceComponentType
      || object.userData?.TYPE
      || object.userData?.type,
  );
}

function removeSpringArrowMeshes(object) {
  const removed = [];
  object.traverse?.((node) => {
    const name = text(node.name);
    if (!node.parent || !node.isMesh) return;
    if (!/spring-hanger-arrow/i.test(name)) return;
    removed.push(name || node.uuid);
    node.parent.remove(node);
  });
  return removed;
}

function stampSpringCoilOnly(object, removed = []) {
  object.traverse?.((node) => {
    const kind = upper(node.userData?.supportKind || node.userData?.bmCiiLayer?.supportKind);
    if (kind !== 'SPRING' && kind !== 'HANGER') return;
    node.userData = {
      ...(node.userData || {}),
      springSymbolContract: 'spring-coil-only-no-arrow',
      springArrowRemoved: removed.length > 0,
      removedSpringArrowMeshNames: removed,
    };
    if (node.userData.bmCiiTrace) {
      node.userData.bmCiiTrace = {
        ...node.userData.bmCiiTrace,
        springSymbolContract: 'spring-coil-only-no-arrow',
        springArrowRemoved: removed.length > 0,
      };
    }
  });
}

/**
 * BM_CII support symbol wrapper.
 *
 * Type/kind remains the symbol family:
 * - LIMIT / LINESTOP = axial arrow symbols
 * - GUIDE = lateral arrow symbols
 * - SPRING / HANGER = coil only; no arrow head/shaft
 */
export function applyBakedRestraintGlyph(object, comp = {}, options = {}) {
  const result = applyBaseBakedRestraintGlyph(object, comp, options);
  const kind = supportKindOf(result, comp);
  if (kind !== 'SPRING' && kind !== 'HANGER') return result;

  const removed = removeSpringArrowMeshes(result);
  stampSpringCoilOnly(result, removed);
  result.userData = {
    ...(result.userData || {}),
    springSymbolContract: 'spring-coil-only-no-arrow',
    springArrowRemoved: removed.length > 0,
    removedSpringArrowMeshNames: removed,
  };
  return result;
}
