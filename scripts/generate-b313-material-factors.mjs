#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'docs', 'Masters', 'b313-material-factor-master.json');
const target = path.join(ROOT, 'converters', 'b313-material-factors', 'default-b313-material-factor-data.js');
const data = JSON.parse(fs.readFileSync(source, 'utf8'));

const runtimeHelpers = `
function expandScreeningBasis(source) {
  const master = JSON.parse(JSON.stringify(source));
  const factors = master.factors || {};
  for (const [basisId, basis] of Object.entries(master.screeningBases || {})) {
    const temperatures = basis.temperaturesC || [];
    for (const [materialId, material] of Object.entries(basis.materials || {})) {
      temperatures.forEach((temperatureC, index) => {
        const common = { materialId, temperatureC, status: basis.status, sourceAuthority: basis.sourceAuthority, basisId };
        const s = material.Sksi?.[index];
        if (s !== null && s !== undefined && s !== '' && Number.isFinite(Number(s))) factors.S.records.push({ ...common, value: Number(s), unit: 'ksi' });
        for (const [manufacturingRoute, value] of Object.entries(material.EByRoute || {})) {
          factors.E.records.push({ ...common, productForm: 'PIPE', manufacturingRoute, value: Number(value) });
        }
        if (basis.commonFactors?.W != null) factors.W.records.push({ ...common, productForm: 'PIPE', value: Number(basis.commonFactors.W) });
        if (basis.commonFactors?.Y != null) factors.Y.records.push({ ...common, productForm: 'PIPE', value: Number(basis.commonFactors.Y) });
      });
    }
  }
  for (const factor of ['S', 'E', 'W', 'Y']) if (factors[factor]) factors[factor].coveragePlaceholders = [];
  return master;
}
`;
const out = '// Generated from docs/Masters/b313-material-factor-master.json. Do not hand-edit.\n\n' +
  'const B313_MATERIAL_FACTOR_SOURCE = Object.freeze(' + JSON.stringify(data) + ');\n' + runtimeHelpers +
  '\nexport const B313_MATERIAL_FACTOR_MASTER = Object.freeze(expandScreeningBasis(B313_MATERIAL_FACTOR_SOURCE));\n';

const mode = process.argv[2] || '--check';
if (mode === '--write') {
  fs.writeFileSync(target, out);
  console.log('Wrote runtime material-factor registry.');
} else {
  if (fs.readFileSync(target, 'utf8') !== out) {
    console.error('B31.3 material factor runtime registry is out of sync.');
    process.exit(1);
  }
  console.log('B31.3 material factor runtime registry matches canonical master.');
}
