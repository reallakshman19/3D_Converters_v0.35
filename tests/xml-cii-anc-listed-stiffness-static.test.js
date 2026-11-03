const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../converters/scripts/xml_to_cii2019.py'), 'utf8');
assert(source.includes('OPEN_END_STIFFNESS = 9.41952e19'));
assert(source.includes('type_code=1'));
assert(source.includes('is_open_end=True'));
console.log('Historical ANC 9.41952E+19 formation basis retained as regression evidence.');
