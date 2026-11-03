// App-default Piping Class ↔ Material Code rows.
// No runtime fetch is used. Exact rows and wildcard pattern rows are generated inside the app.

export const DEFAULT_PIPING_CLASS_MATERIAL_CODE_SOURCE = 'app-default-v2';

const EXACT_ROWS = Object.freeze([
  ['11261', '106', 'CS', 'ASTM A106-B', '150', '1', 90, 'Exact seed: carbon steel base class'],
  ['11441', '106', 'CS Sour', 'ASTM A106-B', '150', '3', 90, 'Exact seed: carbon steel sour'],
  ['31441', '106', 'CS Sour', 'ASTM A106-B', '300', '3', 90, 'Exact seed: carbon steel sour'],
  ['61261', '106', 'CS', 'ASTM A106-B', '600', '1', 90, 'Exact seed: carbon steel rating family'],
  ['91261', '106', 'CS', 'ASTM A106-B', '900', '1', 90, 'Exact seed: carbon steel rating family'],
  ['11472', '177', 'LT CS', 'ASTM A333-6', '150', '', 90, 'Exact seed: low-temperature carbon steel'],
  ['11503', '177', 'LT CS Sour', 'ASTM A333-6', '150', '', 90, 'Exact seed: low-temperature sour carbon steel'],
  ['12021', '181', '1.25Cr-0.5Mo', 'ASTM A335-P11', '150', '', 90, 'Exact seed: alloy steel'],
  ['12040', '186', '5Cr-0.5Mo', 'ASTM A335-P5', '150', '', 90, 'Exact seed: alloy steel'],
  ['12090', '190', '9Cr-1Mo', 'ASTM A335-P9', '150', '', 90, 'Exact seed: alloy steel'],
  ['13021', '163', 'SS 316', 'ASTM A312-TP316', '150', '', 90, 'Exact seed: stainless steel 316'],
  ['13081', '155', 'SS 304', 'ASTM A312-TP304', '150', '', 90, 'Exact seed: stainless steel 304'],
]);

const PATTERN_GROUPS = Object.freeze([
  {
    patterns: ['?10*', '?11*', '?12*', '?13*', '?14*', '??10*', '??11*', '??12*', '??13*', '??14*'],
    materials: [
      ['106', 'Carbon steel', 'ASTM A106-B', 82, 'Pattern: CS seamless pipe family from CAPS material descriptions'],
      ['305', 'Carbon steel', 'API 5L-B', 76, 'Pattern: CS API 5L-B line-pipe family from CAPS material descriptions'],
      ['367', 'Carbon steel', 'ASTM A672-C65', 76, 'Pattern: CS welded pipe family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?108*', '?117*', '?118*', '?138*', '?148*', '?147*', '?150*', '??108*', '??117*', '??118*', '??138*', '??148*'],
    materials: [
      ['177', 'LT carbon steel', 'ASTM A333-6', 82, 'Pattern: LTCS seamless pipe family from CAPS material descriptions'],
      ['364', 'LT carbon steel', 'ASTM A671-CC65', 74, 'Pattern: LTCS welded pipe family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?2021', '??2021'],
    materials: [
      ['181', 'Alloy steel 1.25Cr-0.5Mo', 'ASTM A335-P11', 82, 'Pattern: alloy steel family from CAPS material descriptions'],
      ['379', 'Alloy steel 1.25Cr-0.5Mo', 'ASTM A691-1.25Cr', 74, 'Pattern: alloy welded family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?2040', '??2040'],
    materials: [
      ['186', 'Alloy steel 5Cr-0.5Mo', 'ASTM A335-P5', 82, 'Pattern: alloy steel family from CAPS material descriptions'],
      ['374', 'Alloy steel 5Cr-0.5Mo', 'ASTM A691-5Cr', 74, 'Pattern: alloy welded family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?2090', '?2093', '??2090', '??2093'],
    materials: [
      ['190', 'Alloy steel 9Cr-1Mo', 'ASTM A335-P9', 82, 'Pattern: alloy steel family from CAPS material descriptions'],
      ['375', 'Alloy steel 9Cr-1Mo', 'ASTM A691-9Cr', 74, 'Pattern: alloy welded family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?3012', '?3013', '?3015', '?3052', '?3055', '??3012', '??3013', '??3015', '??3052', '??3055'],
    materials: [
      ['168', 'Stainless steel 321/347', 'ASTM A312-TP321', 82, 'Pattern: SS 321/347 seamless pipe family from CAPS material descriptions'],
      ['225', 'Stainless steel 321/347', 'ASTM A358-321', 76, 'Pattern: SS 321/347 welded pipe family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?3021', '?3024', '?3032', '?3034', '?3060', '?3061', '?3197', '?3220', '?3411', '?3421', '?3430', '?3451', '?3461', '??3021', '??3024', '??3032', '??3034', '??3060', '??3061', '??3197', '??3220', '??3411', '??3421', '??3430', '??3451', '??3461'],
    materials: [
      ['163', 'Stainless steel 316', 'ASTM A312-TP316', 82, 'Pattern: SS 316 seamless pipe family from CAPS material descriptions'],
      ['213', 'Stainless steel 316', 'ASTM A358-316', 76, 'Pattern: SS 316 welded pipe family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?3081', '?3085', '?3086', '?3087', '?3092', '?3095', '?3097', '?3191', '?3500', '??3081', '??3085', '??3086', '??3087', '??3092', '??3095', '??3097', '??3191', '??3500'],
    materials: [
      ['155', 'Stainless steel 304', 'ASTM A312-TP304', 82, 'Pattern: SS 304 seamless pipe family from CAPS material descriptions'],
      ['192', 'Stainless steel 304', 'ASTM A358-304', 76, 'Pattern: SS 304 welded pipe family from CAPS material descriptions'],
    ],
  },
  {
    patterns: ['?3035', '??3035'],
    materials: [
      ['164', 'Stainless steel 317L', 'ASTM A312-TP317L', 82, 'Pattern: SS 317L seamless pipe family from CAPS material descriptions'],
      ['214', 'Stainless steel 317L', 'ASTM A358-317L', 76, 'Pattern: SS 317L welded pipe family from CAPS material descriptions'],
    ],
  },
]);

function makeRow(pipingClass, materialCode, materialCategory, materialName, rating, corrosion, confidence, note, capsMaterialCount = 1) {
  return { pipingClass, materialCode, materialCategory, materialName, rating, corrosion, confidence, capsMaterialCount, note };
}

function buildDefaultRows() {
  const rows = EXACT_ROWS.map(([pipingClass, materialCode, materialCategory, materialName, rating, corrosion, confidence, note]) => (
    makeRow(pipingClass, materialCode, materialCategory, materialName, rating, corrosion, confidence, note)
  ));
  for (const group of PATTERN_GROUPS) {
    for (const pattern of group.patterns) {
      for (const [materialCode, materialCategory, materialName, confidence, note] of group.materials) {
        rows.push(makeRow(pattern, materialCode, materialCategory, materialName, '', '', confidence, note));
      }
    }
  }
  return rows;
}

export const DEFAULT_PIPING_CLASS_MATERIAL_CODE_ROWS = Object.freeze(buildDefaultRows());
