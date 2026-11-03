const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const toggle = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-bend-radius-toggle.js');
assert(toggle.includes('Bend radius: 1.5D'));
assert(toggle.includes('bend.publishOnePointFiveD === true'), 'default must be OFF unless explicitly true');
assert(toggle.includes("next.bendRadius.publishOnePointFiveD = event.target.checked === true"));
assert(toggle.includes("default = 'CAESAR_WHEN_OFF'"));

const panels = read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels.js');
assert(panels.includes("import { appendBendRadiusConfigToggle }"));
assert(panels.includes('appendBendRadiusConfigToggle(card, stateRef, render)'));

const engine = read('converters/xml-cii-2019-standalone/engine.js');
assert(engine.includes("'xml_to_cii2019_bend_radius_policy.py'"));
assert(engine.includes("'xml_to_cii2019_runtime_custody.py'"));
assert(engine.includes('apply_bend_radius_policy(final_xml, support_config, Path(job_output_path))'));

const invocation = read('converters/xml-cii-2019-standalone/invocation-builder.js');
assert(invocation.includes("/scripts/xml_to_cii2019_runtime_custody.py"));

const runtime = read('converters/scripts/xml_to_cii2019_runtime_custody.py');
assert(runtime.includes('radius = 1.5 * base._element_outside_diameter(edge) if _PUBLISH_BEND_RADIUS_1_5D else 0.0'));
assert(runtime.includes('OPEN_END_ANC_SUPPRESSED'));
assert(runtime.includes('OPEN_END_ANC_CREATED'));
console.log('XML/CII bend-radius Config and runtime activation checks passed.');
