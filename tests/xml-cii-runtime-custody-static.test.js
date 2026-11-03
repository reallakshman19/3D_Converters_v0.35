const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const base = read('converters/scripts/xml_to_cii2019.py');
assert(base.includes('OPEN_END_STIFFNESS = 9.41952e19'));
assert(base.includes('if metadata.restrain_open_ends:'));
assert(base.includes('if degree != 1:'));

const runtime = read('converters/scripts/xml_to_cii2019_runtime_custody.py');
assert(runtime.includes('OPEN_END_COINCIDENT_TOLERANCE_MM = 0.5'));
assert(runtime.includes('topology_aware_open_end_degrees'));
assert(runtime.includes('coincident-retained-occurrence-is-not-physical-open-end'));
assert(runtime.includes('OPEN_END_ANC_SUPPRESSED'));
assert(runtime.includes('OPEN_END_ANC_CREATED'));
assert(runtime.includes('base._build_restraints = _topology_aware_build_restraints'));
assert(runtime.includes('base._build_bend_payload = _runtime_bend_payload'));

const invocation = read('converters/xml-cii-2019-standalone/invocation-builder.js');
assert(!invocation.includes("'/scripts/xml_to_cii2019_direction.py', '--input'"));
assert(invocation.includes("'/scripts/xml_to_cii2019_runtime_custody.py', '--input'"));
console.log('XML/CII runtime custody static checks passed.');
