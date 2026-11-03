import { applyBakedRestraintGlyph as applyGuideCosineLateralGlyph } from './BakedRestraintGlyphBmCiiGuideCosineLateral.js';

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function firstPositive(...values) {
  for (const value of values) {
    const n = number(value);
    if (n !== null) return n;
  }
  return null;
}

function attrsFrom(object, comp = {}) {
  return {
    ...(comp.raw || {}),
    ...(comp.attributes || {}),
    ...(object?.userData || {}),
    ...comp,
  };
}

function outsideDiameterFrom(object, comp = {}) {
  const attrs = attrsFrom(object, comp);
  return firstPositive(
    attrs.OutsideDiameter,
    attrs.OUTSIDE_DIAMETER,
    attrs.outsideDiameter,
    attrs.outside_diameter,
    attrs.OD,
    attrs.od,
    attrs.outerDiameter,
    attrs.DIAMETER,
    attrs.diameter,
  );
}

function withOdAsGlyphDiameter(object, comp = {}) {
  const od = outsideDiameterFrom(object, comp);
  if (!od) return comp;
  return {
    ...comp,
    // The downstream BM_CII glyph builder historically names this value `bore`,
    // but the visual contract requires R = OD / 2 for all restraint contact
    // points.  Force the glyph sizing diameter to the actual outside diameter
    // when InputXML provides it.
    bore: od,
    OutsideDiameter: od,
    raw: {
      ...(comp.raw || {}),
      OutsideDiameter: od,
    },
    attributes: {
      ...(comp.attributes || {}),
      OutsideDiameter: od,
    },
    bmCiiOdTouchDiameter: od,
    bmCiiOdTouchRadius: od / 2,
  };
}

export function applyBakedRestraintGlyph(object, comp = {}, options = {}) {
  const odComp = withOdAsGlyphDiameter(object, comp);
  const result = applyGuideCosineLateralGlyph(object, odComp, options);
  const od = outsideDiameterFrom(result, odComp);
  if (result?.userData && od) {
    result.userData.bmCiiOdTouchDiameter = od;
    result.userData.bmCiiOdTouchRadius = od / 2;
    result.userData.odTouchContract = 'all-restraint-symbol-tips-and-contact-geometry-use-R=OD/2';
  }
  return result;
}
