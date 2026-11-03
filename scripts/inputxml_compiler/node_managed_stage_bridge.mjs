#!/usr/bin/env node

import fs from 'node:fs';
import { TextDecoder } from 'node:util';
import {
  buildComponentTopologyArtifacts,
} from '../../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import { buildTopologySourceModel } from '../../tabs/model-converters/converters/component-topology/topology-source-model.js';
import { buildTopologyEngineeringProjection } from '../../tabs/model-converters/converters/component-topology/topology-engineering-projection.js';
import { rigidWeightEvidence } from '../../tabs/model-converters/converters/component-topology/topology-rigid-weight.js';
import {
  SUPPORT_PROJECTION_TOLERANCE_MM,
  TOPOLOGY_TOLERANCE_MM,
} from '../../tabs/model-converters/converters/component-topology/topology-values.js';
import { parseStrictJson } from './strict_json_request.mjs';

const REQUEST_SCHEMA = 'InputXmlManagedStageBridgeRequest.v1';
const RESULT_SCHEMA = 'InputXmlManagedStageBridgeResult.v1';
const ENGINE_IDENTITY = 'component-topology-artifact-producer';
const ENGINE_VERSION = '1.0.0';
const MAX_STDIN_BYTES = 12 * 1024 * 1024;
const REQUEST_FIELDS = new Set([
  'schema', 'profileId', 'adapterId', 'sourceHashSha256', 'sourceText',
  'sourceName', 'sourceContext', 'sourceIntake', 'producerPolicy',
  'requestedArtifacts',
]);
const CONTEXT_FIELDS = new Set([
  'version', 'jobName', 'north', 'sourceRevision', 'time', 'issueNo', 'enrichmentConfig',
]);
const CONTEXT_REQUIRED = new Set(['version', 'jobName', 'north', 'sourceRevision']);
const INTAKE_FIELDS = new Set([
  'rootForm', 'rootPath', 'branchCollectionPath', 'branchCount', 'sourceOccurrenceCount',
]);
const PRODUCER_POLICY_FIELDS = new Set([
  'engineIdentity', 'engineVersion', 'hashAlgorithm', 'sourceIdentitySchema', 'entityIdentitySchema',
]);

function validateClosedRecord(value, label, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be one JSON object.`);
  }
  const missing = [...required].filter((field) => !Object.hasOwn(value, field));
  const extra = Object.keys(value).filter((field) => !allowed.has(field));
  if (missing.length || extra.length) {
    throw new TypeError(`${label} fields mismatch: missing=${missing}; extra=${extra}.`);
  }
  return value;
}

function readRequest() {
  const raw = fs.readFileSync(0);
  if (raw.length > MAX_STDIN_BYTES) throw new TypeError('Managed-stage request exceeds its byte limit.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const request = validateClosedRecord(
    parseStrictJson(text),
    'Managed-stage request',
    REQUEST_FIELDS,
  );
  validateClosedRecord(request.sourceContext, 'Managed-stage sourceContext', CONTEXT_FIELDS, CONTEXT_REQUIRED);
  validateClosedRecord(request.sourceIntake, 'Managed-stage sourceIntake', INTAKE_FIELDS);
  validateClosedRecord(request.producerPolicy, 'Managed-stage producerPolicy', PRODUCER_POLICY_FIELDS);
  if (!Array.isArray(request.requestedArtifacts)
      || request.requestedArtifacts.some((value) => typeof value !== 'string' || !value)) {
    throw new TypeError('Managed-stage requestedArtifacts must be a nonblank string array.');
  }
  if (request.schema !== REQUEST_SCHEMA) throw new TypeError('Managed-stage request schema mismatch.');
  if (request.profileId !== 'managed-stage-json') throw new TypeError('Managed-stage profile identity mismatch.');
  if (request.adapterId !== 'managed-stage-to-canonical') throw new TypeError('Managed-stage adapter identity mismatch.');
  if (!/^[a-f0-9]{64}$/.test(request.sourceHashSha256 || '')) throw new TypeError('Managed-stage source hash is invalid.');
  if (typeof request.sourceText !== 'string' || !request.sourceText) throw new TypeError('Managed-stage sourceText is required.');
  if (typeof request.sourceName !== 'string' || !request.sourceName.trim()) throw new TypeError('Managed-stage sourceName is required.');
  return request;
}

function engineeringArtifact(engineering, sourceIdentity) {
  const records = [...engineering.recordBySourceEntityId.entries()].map(([sourceEntityId, record]) => ({
    sourceEntityId,
    sourcePath: Array.isArray(record.path) ? record.path : [],
    componentType: String(record.componentType || ''),
    status: String(record.status || ''),
    needsReview: record.needsReview === true,
    attrs: record.attrs || {},
    resolved: record.resolved || {},
    sourceWeightKg: Number.isFinite(record.sourceWeightKg) ? record.sourceWeightKg : null,
    supportTag: String(record.supportTag || ''),
  }));
  const rigids = engineering.rigids.map((row) => ({
    sourceEntityId: row.component.sourceEntityId,
    sourcePath: row.component.sourcePath,
    componentType: String(row.record.componentType || ''),
    position: row.position,
    ...rigidWeightEvidence(row.record),
  }));
  return {
    schema: 'TopologyEngineeringProjection.v1',
    sourceIdentity,
    records,
    supports: engineering.supports,
    deferredSupports: engineering.deferredSupports,
    rigids,
    metrics: engineering.metrics,
  };
}

function sourceEntityRows(sourceModel) {
  return sourceModel.entities.map((entity) => ({
    sourceEntityId: entity.sourceEntityId,
    sourcePath: entity.sourcePath,
    sourceType: entity.sourceType,
    name: entity.name,
    sourceRef: entity.sourceRef,
    sourceBranchEntityId: entity.sourceBranchEntityId || '',
    sourceBranchName: entity.sourceBranchName || '',
    attributes: entity.attributes || {},
    enrichedAttributes: entity.enrichedAttributes || {},
    geometryClassification: entity.geometryClassification || 'BRANCH',
    finiteSpan: entity.finiteSpan === true,
    spanLengthMm: Number.isFinite(entity.spanLengthMm) ? entity.spanLengthMm : null,
    supportProjection: entity.supportProjection || null,
    ports: entity.ports || [],
  }));
}

function resultBase(request) {
  return {
    schema: RESULT_SCHEMA,
    resolutionStatus: 'BLOCKED',
    engineIdentity: ENGINE_IDENTITY,
    engineVersion: ENGINE_VERSION,
    profileId: request.profileId,
    adapterId: request.adapterId,
    sourceHashSha256: request.sourceHashSha256,
    sourceIdentity: {}, sourceModel: {}, sourceEntities: [], sourcePorts: [],
    canonicalTopology: {}, engineeringProjection: {}, traceLedger: {},
    topologyInputXml: '', parsedInputXmlTopology: {}, topologySvgScene: {},
    topologyParityReport: {}, metrics: {}, buildIssues: [], diagnostics: [],
  };
}

async function buildResult(request) {
  const context = request.sourceContext;
  const sourceModel = await buildTopologySourceModel(request.sourceText, {
    sourceName: request.sourceName,
    sourceRevision: context.sourceRevision,
    toleranceMm: TOPOLOGY_TOLERANCE_MM,
  });
  const engineering = buildTopologyEngineeringProjection(request.sourceText, sourceModel, {
    enrichmentConfig: context.enrichmentConfig && typeof context.enrichmentConfig === 'object'
      ? context.enrichmentConfig : {},
    supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
  });
  const artifacts = await buildComponentTopologyArtifacts(request.sourceText, {
    sourceName: request.sourceName,
    sourceRevision: context.sourceRevision,
    jobName: context.jobName,
    version: context.version,
    north: context.north,
    time: context.time,
    issueNo: context.issueNo,
    toleranceMm: TOPOLOGY_TOLERANCE_MM,
    supportProjectionToleranceMm: SUPPORT_PROJECTION_TOLERANCE_MM,
    enrichmentConfig: context.enrichmentConfig && typeof context.enrichmentConfig === 'object'
      ? context.enrichmentConfig : {},
  });
  return {
    ...resultBase(request),
    resolutionStatus: 'RESOLVED',
    sourceIdentity: sourceModel.sourceIdentity,
    sourceModel,
    sourceEntities: sourceEntityRows(sourceModel),
    sourcePorts: sourceModel.sourcePorts,
    canonicalTopology: artifacts.canonicalTopology,
    engineeringProjection: engineeringArtifact(engineering, sourceModel.sourceIdentity),
    traceLedger: artifacts.traceLedger,
    topologyInputXml: artifacts.topologyInputXml,
    parsedInputXmlTopology: artifacts.parsedInputXmlTopology,
    topologySvgScene: artifacts.topologySvgScene,
    topologyParityReport: artifacts.topologyParityReport,
    metrics: artifacts.metrics,
    buildIssues: artifacts.buildIssues,
  };
}

async function main() {
  let request;
  try {
    request = readRequest();
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  try {
    const result = await buildResult(request);
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    const result = resultBase(request);
    result.diagnostics = [{
      code: error?.name === 'TopologyParityError'
        ? 'MANAGED_STAGE_PARITY_FAILED' : 'MANAGED_STAGE_PRODUCER_BLOCKED',
      message: error?.message || String(error),
      sourceEntityId: '$',
      blocking: true,
    }];
    process.stdout.write(JSON.stringify(result));
  }
}

await main();

export const _test = Object.freeze({
  REQUEST_SCHEMA,
  RESULT_SCHEMA,
  ENGINE_IDENTITY,
  ENGINE_VERSION,
  engineeringArtifact,
  sourceEntityRows,
  validateClosedRecord,
});
