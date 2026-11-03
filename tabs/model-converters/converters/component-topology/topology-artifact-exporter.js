/**
 * Functionality: build numbered topology, InputXML, parity, and compatibility-request artifacts.
 * Parameters: exact source text, topology tolerances, engineering options, and optional edit evidence.
 * Outputs: hash-bound topology release artifacts and downloadable projections.
 * Fallback: none; blocking topology/parity findings prevent release-ready artifacts.
 */
import { buildTopologySourceModel } from './topology-source-model.js';
import { buildExplicitConnectivity } from './topology-connectivity.js';
import { buildCanonicalTopology } from './topology-canonical-builder.js';
import { buildTopologyTraceLedger } from './topology-ledger-builder.js';
import { buildTopologyInputXml } from './topology-inputxml-writer.js';
import { buildTopologyEngineeringProjection } from './topology-engineering-projection.js';
import { materializeTopologyEditDraft } from './topology-edit-engine.js';
import {
  enrichCanonicalTopologyIdentity,
  enrichTopologyTraceLedgerIdentity,
} from './topology-artifact-identity.js';
import { stampArtifactHash } from './topology-deterministic-hash.js';
import {
  applyNumberedTopologyProjection,
  buildTopologyNumberingArtifacts,
  canonicalTopologyV2FromLegacy,
  legacyNumberMap,
  stampCanonicalTopologyV2,
} from './topology-numbering-projection.js';
import { buildTopologySvgScene } from './topology-svg-scene-builder.js';
import { parseTopologyInputXml } from './topology-inputxml-topology-parser.js';
import {
  buildTopologyParityReport,
  topologyParityMismatchesCsv,
  TopologyParityError,
} from './topology-parity-engine.js';
import {
  buildParsedInputXmlTopologyV1,
  buildTopologyParityReportV2,
} from './topology-parity-report-v2.js';
import { cleanText, componentCategory, pointDistance } from './topology-values.js';
import { buildInputXmlCompatibilityRequest } from '../../../../converters/inputxml-release/inputxml-compatibility-request.js';

function componentCounts(model) {
  const counts = {};
  for (const component of model.components) {
    const category = componentCategory(component.sourceType);
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function referenceCounts(model) {
  const branches = new Set(model.branches.map((branch) => cleanText(branch.name)));
  const aliases = new Set(model.components.flatMap(
    (component) => [component.sourceRef, component.name],
  ).map(cleanText).filter(Boolean));
  const branchReferences = model.branches.flatMap((branch) => (
    ['HREF', 'TREF'].flatMap((field) => {
      const value = cleanText(branch.attributes[field]);
      return value ? [{ value, resolved: branches.has(value) || aliases.has(value) }] : [];
    })
  ));
  const crefReferences = model.components.flatMap((component) => {
    const value = cleanText(component.attributes.CREF);
    return value ? [{ value, resolved: branches.has(value) }] : [];
  });
  return {
    cref: crefReferences.length,
    resolvedCref: crefReferences.filter((row) => row.resolved).length,
    hrefTref: branchReferences.length,
    resolvedHrefTref: branchReferences.filter((row) => row.resolved).length,
    externalReferences: branchReferences.filter((row) => !row.resolved).length,
  };
}

function artifactMetrics(model, canonical, ledger, engineering, parsed, scene, parity, toleranceMm) {
  const nodes = new Map(canonical.nodes.map((node) => [node.id, node]));
  const zeroLengthEdges = canonical.edges.filter((edge) => pointDistance(
    nodes.get(edge.fromNodeId)?.position ?? null,
    nodes.get(edge.toNodeId)?.position ?? null,
  ) <= toleranceMm).length;
  return Object.freeze({
    source: Object.freeze({
      branches: model.branches.length,
      childRecords: model.components.length,
      routeComponents: model.components.filter((component) => component.isRouteComponent).length,
      supports: model.components.filter(
        (component) => componentCategory(component.sourceType) === 'SUPPORT',
      ).length,
      componentCounts: Object.freeze(componentCounts(model)),
    }),
    references: Object.freeze(referenceCounts(model)),
    canonical: Object.freeze({
      nodes: canonical.nodes.length,
      edges: canonical.edges.length,
      pointFeatures: canonical.pointFeatures.length,
      junctions: canonical.junctions.length,
      boundaries: canonical.boundaries.length,
      supports: canonical.supports.length,
      rigids: canonical.rigids.length,
      zeroLengthEdges,
    }),
    ledger: Object.freeze({
      records: ledger.records.length,
      routeRecords: ledger.summary.routeRecords,
      blockedRecords: ledger.summary.blockedRecords,
      deferredSupports: ledger.records.filter(
        (row) => row.primaryDisposition === 'DEFER_SUPPORT',
      ).length,
    }),
    engineering: engineering.metrics,
    inputXml: Object.freeze({
      elements: canonical.edges.length,
      restraints: canonical.supports.reduce(
        (sum, support) => sum + support.restraints.length,
        0,
      ),
      rigids: new Set(canonical.rigids.map((rigid) => rigid.edgeId)).size,
      rigidBodies: canonical.rigids.length,
    }),
    parsedInputXml: Object.freeze({
      nodes: parsed.nodes.length,
      elements: parsed.elements.length,
      restraints: parsed.restraints.length,
      rigids: parsed.rigids.length,
      parseIssues: parsed.issues.length,
    }),
    svgScene: scene.summary,
    parity: parity.summary,
  });
}

async function buildProducerState(sourceText, options) {
  const model = await buildTopologySourceModel(sourceText, {
    sourceName: options.sourceName,
    sourceRevision: options.sourceRevision ?? 1,
    toleranceMm: options.toleranceMm,
  });
  const engineering = buildTopologyEngineeringProjection(sourceText, model, {
    enrichmentConfig: options.enrichmentConfig,
    supportProjectionToleranceMm: options.supportProjectionToleranceMm,
  });
  const connectivity = buildExplicitConnectivity(model, options.toleranceMm);
  const built = buildCanonicalTopology(
    model,
    connectivity,
    engineering,
    options.toleranceMm,
    options.supportProjectionToleranceMm,
  );
  const canonicalTopologyV2 = await stampCanonicalTopologyV2(
    enrichCanonicalTopologyIdentity(built, model),
  );
  const numbering = await buildTopologyNumberingArtifacts(canonicalTopologyV2, model, null);
  const canonicalTopology = stampArtifactHash(
    applyNumberedTopologyProjection(canonicalTopologyV2, numbering.numberedTopologyProjection),
    'canonicalTopologyHash',
  );
  return Object.freeze({ model, engineering, canonicalTopology, canonicalTopologyV2, ...numbering });
}

async function buildArtifactsFromState(state, options, editMetadata, failOnParity) {
  const {
    model, engineering, canonicalTopology, canonicalTopologyV2,
    topoNodePlan, numberedTopologyProjection, numberingShadowReport,
  } = state;
  const builtLedger = buildTopologyTraceLedger(model, canonicalTopology);
  const traceLedger = stampArtifactHash(
    enrichTopologyTraceLedgerIdentity(
      builtLedger,
      canonicalTopology,
      model,
      engineering,
      {
        sourceName: options.sourceName,
        topologyToleranceMm: options.toleranceMm,
        supportProjectionToleranceMm: options.supportProjectionToleranceMm,
      },
    ),
    'topologyTraceLedgerHash',
  );
  const topologyInputXml = buildTopologyInputXml(canonicalTopologyV2, engineering, numberedTopologyProjection, {
    jobName: options.jobName,
    inputXmlCompatibilityMode: 'CANONICAL_STRICT',
    legacyCanonicalTopologyHash: canonicalTopology.canonicalTopologyHash,
    topologyTraceLedgerHash: traceLedger.topologyTraceLedgerHash,
    topologyEditDraftHash: editMetadata?.editDraft?.topologyEditDraftHash,
    topologyEditLedgerHash: editMetadata?.editLedger?.topologyEditLedgerHash,
  });
  const inputXmlCompatibilityRequest = await buildInputXmlCompatibilityRequest({
    converterId: 'component_topology_inputxml_writer',
    sourceName: `${options.sourceName}.topology.input.xml`,
    sourceBytes: new TextEncoder().encode(topologyInputXml),
    options: {
      inputXmlCompatibilityMode: 'CANONICAL_STRICT',
      approvedSemanticSplitId: '',
    },
  });
  const parsedInputXmlTopology = parseTopologyInputXml(topologyInputXml);
  const parsedInputXmlTopologyV2 = await buildParsedInputXmlTopologyV1({
    parsedInputXmlTopology,
    topologyInputXml,
    inputXmlCompatibilityRequest,
    canonicalTopologyV2,
  });
  const topologySvgScene = buildTopologySvgScene(canonicalTopology, traceLedger, []);
  const topologyParityReport = buildTopologyParityReport({
    canonicalTopology,
    traceLedger,
    parsedInputXmlTopology,
    topologySvgScene,
  });
  const topologyParityReportV2 = await buildTopologyParityReportV2({
    topologyParityReportV1: topologyParityReport,
    canonicalTopologyV2,
    topoNodePlan,
    numberedTopologyProjection,
    numberingShadowReport,
    topologyInputXml,
    parsedInputXmlTopologyV2,
    topologySvgScene,
  });
  const metrics = artifactMetrics(
    model,
    canonicalTopology,
    traceLedger,
    engineering,
    parsedInputXmlTopology,
    topologySvgScene,
    topologyParityReport,
    options.toleranceMm,
  );
  const artifacts = Object.freeze({
    sourceIdentity: model.sourceIdentity,
    canonicalTopology,
    canonicalTopologyV2,
    topoNodePlan,
    numberedTopologyProjection,
    numberingShadowReport,
    traceLedger,
    topologyInputXml,
    parsedInputXmlTopology,
    parsedInputXmlTopologyV2,
    topologySvgScene,
    topologyParityReport,
    topologyParityReportV2,
    topologyParityMismatchesCsv: topologyParityMismatchesCsv(topologyParityReport),
    metrics,
    buildIssues: canonicalTopology.buildIssues,
    ...(editMetadata ?? {}),
  });
  if (failOnParity && (!topologyParityReport.ok || topologyParityReportV2.status !== 'PASS')) {
    throw new TopologyParityError(topologyParityReport);
  }
  return artifacts;
}

export async function buildComponentTopologyArtifacts(sourceText, options) {
  const state = await buildProducerState(sourceText, options);
  return buildArtifactsFromState(state, options, null, true);
}

export async function buildEditedComponentTopologyArtifacts(sourceText, draft, options) {
  const baseState = await buildProducerState(sourceText, options);
  const materialized = materializeTopologyEditDraft(baseState.canonicalTopology, draft);
  const editValidation = materialized.validation;
  const canonicalTopologyV2 = await canonicalTopologyV2FromLegacy(materialized.canonicalTopology);
  const numbering = await buildTopologyNumberingArtifacts(
    canonicalTopologyV2,
    baseState.model,
    legacyNumberMap(materialized.canonicalTopology),
  );
  const state = Object.freeze({
    ...baseState,
    canonicalTopology: materialized.canonicalTopology,
    canonicalTopologyV2,
    ...numbering,
  });
  const artifacts = await buildArtifactsFromState(state, options, {
    editDraft: draft,
    editLedger: materialized.editLedger,
    editValidation,
  }, false);
  const parityBlocking = artifacts.topologyParityReport.ok ? [] : [Object.freeze({
    code: 'TOPOLOGY_PARITY_BLOCKING',
    blocking: true,
    message: `${artifacts.topologyParityReport.summary.topologyMismatchCount} independent topology parity mismatches remain.`,
    objectIds: Object.freeze([]),
  })];
  const findings = Object.freeze([...editValidation.findings, ...parityBlocking]);
  const blockingCount = findings.filter((finding) => finding.blocking).length;
  return Object.freeze({
    ...artifacts,
    editValidation: Object.freeze({
      ...editValidation,
      ok: blockingCount === 0,
      findings,
      summary: Object.freeze({ findingCount: findings.length, blockingCount }),
    }),
  });
}

export function topologyArtifactOutputs(artifacts, options) {
  const outputs = [
    ['canonical-topology.json', artifacts.canonicalTopology, 'application/json;charset=utf-8'],
    ['canonical-topology-v2.json', artifacts.canonicalTopologyV2, 'application/json;charset=utf-8'],
    ['topo-node-plan.json', artifacts.topoNodePlan, 'application/json;charset=utf-8'],
    ['numbered-topology-projection.json', artifacts.numberedTopologyProjection, 'application/json;charset=utf-8'],
    ['topology-numbering-shadow-report.json', artifacts.numberingShadowReport, 'application/json;charset=utf-8'],
    ['topology-trace-ledger.json', artifacts.traceLedger, 'application/json;charset=utf-8'],
    ['topology.input.xml', artifacts.topologyInputXml, 'application/xml;charset=utf-8'],
    ['topology.inputxml-compatibility-request.json', artifacts.inputXmlCompatibilityRequest, 'application/json;charset=utf-8'],
    ['topology-svg-scene.json', artifacts.topologySvgScene, 'application/json;charset=utf-8'],
    ['parsed-inputxml-topology.json', artifacts.parsedInputXmlTopology, 'application/json;charset=utf-8'],
    ['parsed-inputxml-topology-v2.json', artifacts.parsedInputXmlTopologyV2, 'application/json;charset=utf-8'],
    ['topology-parity-report.json', artifacts.topologyParityReport, 'application/json;charset=utf-8'],
    ['topology-parity-report-v2.json', artifacts.topologyParityReportV2, 'application/json;charset=utf-8'],
    ['topology-parity-mismatches.csv', artifacts.topologyParityMismatchesCsv, 'text/csv;charset=utf-8'],
  ].map(([suffix, value, mime]) => Object.freeze({
    name: `${options.stem}.${suffix}`,
    text: typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
    mime,
  }));
  if (artifacts.editDraft) outputs.unshift(Object.freeze({
    name: `${options.stem}.topology-edit-draft.json`,
    text: `${JSON.stringify(artifacts.editDraft, null, 2)}\n`,
    mime: 'application/json;charset=utf-8',
  }));
  if (artifacts.editLedger) outputs.push(Object.freeze({
    name: `${options.stem}.topology-edit-ledger.json`,
    text: `${JSON.stringify(artifacts.editLedger, null, 2)}\n`,
    mime: 'application/json;charset=utf-8',
  }));
  return Object.freeze(outputs);
}

export const _test = Object.freeze({
  componentCounts,
  referenceCounts,
  artifactMetrics,
  buildProducerState,
  buildArtifactsFromState,
});
