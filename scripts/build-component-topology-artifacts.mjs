#!/usr/bin/env node
/**
 * Generates canonical topology, trace ledger, and topology InputXML files.
 * Parameters: --input <managed.json> --output-dir <directory>.
 * Output: three deterministic artifacts; blocking build findings raise before write.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildComponentTopologyArtifacts,
  topologyArtifactOutputs,
} from '../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import {
  SUPPORT_PROJECTION_TOLERANCE_MM,
  TOPOLOGY_TOLERANCE_MM,
} from '../tabs/model-converters/converters/component-topology/topology-values.js';

/** @param {string[]} argv @returns {{input:string,outputDir:string}} */
function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new TypeError(`Invalid CLI argument near ${key ?? '(end)'}.`);
    values.set(key.slice(2), value);
  }
  const input = values.get('input'), outputDir = values.get('output-dir');
  if (!input || !outputDir) throw new TypeError('Usage: --input <managed.json> --output-dir <directory>');
  return { input: path.resolve(input), outputDir: path.resolve(outputDir) };
}

/** @param {string} input @returns {string} */
function sourceStem(input) {
  return path.basename(input).replace(/\.json$/i, '');
}

/** @param {{input:string,outputDir:string}} args @returns {Promise<void>} */
async function run(args) {
  const sourceText = await readFile(args.input, 'utf8');
  const stem = sourceStem(args.input);
  const artifacts = await buildComponentTopologyArtifacts(sourceText, {
    sourceName: path.basename(args.input),
    jobName: stem,
    toleranceMm: TOPOLOGY_TOLERANCE_MM,
    supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
    enrichmentConfig: {},
  });
  const blocking = artifacts.buildIssues.filter((issue) => issue.blocking !== false);
  if (blocking.length) throw new Error(`Topology build has ${blocking.length} blocking finding(s): ${JSON.stringify(blocking.slice(0, 10))}`);
  await mkdir(args.outputDir, { recursive: true });
  for (const output of topologyArtifactOutputs(artifacts, { stem })) {
    await writeFile(path.join(args.outputDir, output.name), output.text, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(artifacts.metrics, null, 2)}\n`);
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirect) run(parseArguments(process.argv.slice(2))).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
