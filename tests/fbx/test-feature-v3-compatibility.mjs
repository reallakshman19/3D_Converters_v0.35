import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { getFbxFeatureCapabilityRegistry } from '../../tabs/model-converters/converters/fbx/feature-capability-registry.js';
import { buildFbxFeatureReport, buildFbxFeatureReportV2 } from '../../tabs/model-converters/converters/fbx/feature-report.js';
import { buildFbxFeatureReportV3 } from '../../tabs/model-converters/converters/fbx/feature-report-v3.js';
import { fixtureBytes } from './helpers.mjs';
import { parseFbxBytesNode, parseFbxGeometryBundleNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { repositoryParserEvidence } from './mapping-package-helpers.mjs';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';

const bytes = await fixtureBytes();
const graph = await parseFbxBytesNode(bytes);
const parserIdentity = await repositoryParserEvidence();
const sourceIdentity = { sha256: await sha256Hex(bytes), byteLength: bytes.byteLength,
  fbxVersion: graph.file.version };
const registryBefore = canonicalJson(getFbxFeatureCapabilityRegistry());
const v1Before = canonicalJson(buildFbxFeatureReport({ graph, sourceIdentity, parserIdentity }));
const v2Before = canonicalJson(buildFbxFeatureReportV2({ graph, sourceIdentity, parserIdentity }));
const geometryBundle = await parseFbxGeometryBundleNode(bytes, { sourceIdentity, parserIdentity });
await buildFbxFeatureReportV3({ graph, geometryBundle });
assert.equal(canonicalJson(getFbxFeatureCapabilityRegistry()), registryBefore);
assert.equal(canonicalJson(buildFbxFeatureReport({ graph, sourceIdentity, parserIdentity })), v1Before);
assert.equal(canonicalJson(buildFbxFeatureReportV2({ graph, sourceIdentity, parserIdentity })), v2Before);
console.log('test-feature-v3-compatibility: PASS');
