import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildXmlCiiServiceProcessFallback,
  numericXmlCiiServiceProcessValue,
} from '../converters/xml-cii2019-core/service-process-fallback.js';

test('service process fallback accepts numeric values with trailing units and rejects labels', () => {
  assert.equal(numericXmlCiiServiceProcessValue('260 °C'), '260');
  assert.equal(numericXmlCiiServiceProcessValue('4,140 kPa(g)'), '4140');
  assert.equal(numericXmlCiiServiceProcessValue('-29 degC'), '-29');
  assert.equal(numericXmlCiiServiceProcessValue('Water'), '');
  assert.equal(numericXmlCiiServiceProcessValue('Steam'), '');
});

test('non-numeric Hydro/Test labels cannot become service fallback pressure overrides', () => {
  const config = {
    linelist: {
      masterRows: [
        { Service: 'STEAM', 'Hydro/Test Pressure': 'Water', T1: '200', Density: '5.2' },
        { Service: 'STEAM', 'Hydro/Test Pressure': 'Water', T1: '200 °C', Density: '5.2 kg/m3' },
      ],
    },
    serviceProcessFallback: { minRows: 2, threshold: 0.7 },
  };

  const result = buildXmlCiiServiceProcessFallback({
    branchName: '/STEAM/B1',
    lineRow: { Service: 'STEAM' },
    config,
  });

  assert.equal(result.fields.hydroPressure, undefined);
  assert.equal(result.fields.t1.value, '200');
  assert.equal(result.fields.density.value, '5.2');
});
