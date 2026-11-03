#!/usr/bin/env node
'use strict';

const fs = require('fs');
const {
  resolveStrictTopology,
} = require('./strict_root_topology.cjs');

const MAX_STDIN_BYTES = 8 * 1024 * 1024;

function readRequest() {
  const raw = fs.readFileSync(0);
  if (raw.length > MAX_STDIN_BYTES) {
    throw new Error(`Bridge request exceeds ${MAX_STDIN_BYTES} bytes.`);
  }
  const text = raw.toString('utf8');
  const request = JSON.parse(text);
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Bridge request must be one JSON object.');
  }
  return request;
}

try {
  const request = readRequest();
  const result = resolveStrictTopology(request);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
