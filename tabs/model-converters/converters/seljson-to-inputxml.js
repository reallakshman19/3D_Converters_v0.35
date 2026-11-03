import { buildCustomInputModel, summarizeCustomInputModel } from '../../../converters/xml-cii2019-core/custom-input-model.js';
import { buildCustomInputXml } from '../../../converters/xml-cii2019-core/custom-input-xml-builder.js';
import { parseSelJsonToInputSource, selJsonTraceToCsv } from '../../../converters/xml-cii2019-core/custom-input-seljson-source.js';
import { applyXmlCiiTopologyElementLengths } from '../../../converters/xml-cii2019-core/topology/xml-cii-topology-element-length.js';
import { buildXmlCiiTopologyDisconnectAudit } from '../../../converters/xml-cii2019-core/topology/xml-cii-topology-disconnect-audit.js';
import { decodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';
import { gateProducedInputXml } from './inputxml-compatibility-gate.js';

/**
 * Runs SelJson -> InputXML from 3DV Conv JSON exports.
 * Parameters: converter context with a primary rvm-converter-stage/v1 JSON file.
 * Outputs: generated custom InputXML, audit JSON, trace CSV, and topology audit JSON.
 * Fallback: unsupported geometry is audited and skipped; short-node dropping is
 * disabled unless explicitly enabled so Position records remain available.
 */

const SUPPORT_COMPONENT_TYPES = ['ATTA', 'SUPPORT'];
const RESTRAINT_TAG_NAMES = ['Restraint', 'CustomRestraint'];

function primaryInput(context) {
  const primary = context?.inputFiles?.find((file) => file.role === 'primary');
  if (!primary || !primary.bytes) throw new Error('Primary 3DV Conv JSON input is required for SelJson -> InputXML conversion.');
  return primary;
}

function writerOptions(options) {
  return {
    ...(options || {}),
    dropShortElementLengthNodes: options?.dropShortElementLengthNodes === true,
  };
}

function resolveTopologyMode(options = {}) {
  const config = options.config || {};
  const raw = String(options.topologyElementLengthMode ?? config.topologyElementLengthMode ?? 'off').trim().toLowerCase();
  if (['off', 'false', '0', 'legacy'].includes(raw)) return 'off';
  if (['apply', 'on', 'true', '1'].includes(raw)) return 'apply';
  return 'shadow';
}

function topologyOptions(options = {}) {
  return {
    ...(options || {}),
    supportComponentTypes: SUPPORT_COMPONENT_TYPES,
    restraintTagNames: RESTRAINT_TAG_NAMES,
  };
}

export async function run(context) {
  const primary = primaryInput(context);
  const selJsonText = decodeTextUtf8(primary.bytes);
  const parsed = parseSelJsonToInputSource(selJsonText, context.options || {});
  const model = buildCustomInputModel(parsed.rows);
  const builtXmlText = buildCustomInputXml(model, writerOptions(context.options || {}));
  const modelSummary = summarizeCustomInputModel(model);
  const stem = baseNameWithoutExtension(primary.name);

  const topoOptions = topologyOptions(context.options || {});
  const topologyMode = resolveTopologyMode(context.options || {});
  const topology = topologyMode === 'off'
    ? null
    : applyXmlCiiTopologyElementLengths(builtXmlText, { ...topoOptions, mode: topologyMode });
  const xmlText = topologyMode === 'apply' && topology ? topology.xmlText : builtXmlText;
  const topologyAudit = topologyMode === 'off' ? null : buildXmlCiiTopologyDisconnectAudit(xmlText, topoOptions);

  const audit = {
    schema: 'seljson-to-inputxml-audit/v1',
    inputName: primary.name,
    converter: context.converterId || 'seljson_to_inputxml',
    source: parsed.summary,
    modelSummary,
    diagnostics: parsed.diagnostics,
    topologyElementLengthMode: topologyMode,
    topologySummary: topology ? { assignmentCount: topology.assignments.length, skippedCount: topology.skipped.length, changed: topology.changed } : null,
    topologyAuditSummary: topologyAudit ? { rows: topologyAudit.rows.length, disconnectedRows: topologyAudit.disconnectedRows.length, orphanRows: topologyAudit.stats.topologyOrphanRows } : null,
  };

  const statusSuffix = topologyAudit ? `, ${topologyAudit.disconnectedRows.length} topology disconnect/orphan row(s)` : '';
  context.setStatus?.(`SelJson parsed: ${parsed.summary.emittedItems} item(s), ${modelSummary.nodes} node(s), ${modelSummary.branches} branch(es)${statusSuffix}.`, topologyAudit && topologyAudit.disconnectedRows.length ? 'warn' : 'ok');

  const outputs = [
    { name: `${stem}_seljson_to_inputxml.xml`, text: xmlText, mime: 'application/xml;charset=utf-8' },
    { name: `${stem}_seljson_to_inputxml.audit.json`, text: JSON.stringify(audit, null, 2), mime: 'application/json;charset=utf-8' },
    { name: `${stem}_seljson_to_inputxml.trace.csv`, text: selJsonTraceToCsv(parsed.trace), mime: 'text/csv;charset=utf-8' },
  ];
  if (topologyAudit) outputs.push({ name: `${stem}_seljson_topology_audit.json`, text: JSON.stringify(topologyAudit, null, 2), mime: 'application/json;charset=utf-8' });
  const produced = outputs[0];
  const gated = await gateProducedInputXml(context, {
    xmlText: produced.text,
    sourceName: produced.name,
    outputName: produced.name,
  });
  if (!gated.releaseEligible) context.setStatus?.(`SelJson -> InputXML ${gated.status}; no InputXML was released.`, 'warn');
  const verifiedOutputs = [...gated.outputs, ...outputs.slice(1)];

  const stdout = [
    `SelJson source kind: ${parsed.summary.sourceKind}`,
    `Selected items: ${parsed.summary.selectedItems}`,
    `Emitted items: ${parsed.summary.emittedItems}`,
    `Emitted nodes: ${modelSummary.nodes}`,
    `Branches: ${modelSummary.branches}`,
  ];
  if (topology) stdout.push(`Topology ElementLengthMm assignments (${topologyMode}): ${topology.assignments.length} assigned, ${topology.skipped.length} skipped.`);
  if (topologyAudit) stdout.push(`Topology audit: ${topologyAudit.disconnectedRows.length} disconnected/orphan row(s) of ${topologyAudit.rows.length}.`);

  return {
    ok: gated.releaseEligible,
    outputs: verifiedOutputs,
    logs: {
      stdout,
      stderr: parsed.diagnostics.map((entry) => `${entry.severity || 'info'} ${entry.code || ''}: ${entry.message || ''}`),
      preflight: gated.logs?.preflight,
      inputXmlCompatibilityRequest: gated.request,
    },
  };
}
