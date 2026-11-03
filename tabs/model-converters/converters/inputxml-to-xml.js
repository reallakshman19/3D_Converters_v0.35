import { buildInputXmlDirectManagedStageJson } from '../../../converters/inputxml-managed-stage/InputXmlDirectManagedStageBuilder.js';
import { buildPsiXmlFromCustomInputXml, looksLikeCustomInputXml, looksLikePsiXml } from '../../../converters/xml-cii2019-core/inputxml-to-psi-xml.js';
import { decodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';
import { _buildPsiXmlFromRmssHierarchy } from './stagedjson-xml-helpers.js';
import { runInputXmlCompatibilityPreflight } from './inputxml-compatibility-gate.js';

/**
 * Runs InputXML -> PSI XML conversion for the Model Converters tab.
 * Parameters: primary XML input in custom <Root> or CAESARII InputXML dialect.
 * Outputs: PipeStressExport XML plus an audit JSON.
 * Fallback: PipeStressExport inputs pass through unchanged with audit metadata.
 */

function primaryInput(context) {
  const primary = context?.inputFiles?.find((file) => file.role === 'primary');
  if (!primary || !primary.bytes) throw new Error('Primary InputXML file is required for InputXML -> XML conversion.');
  return primary;
}

function isCaesarInputXml(text) {
  return /<\s*(?:[A-Za-z_][\w.-]*:)?CAESARII\b/i.test(String(text || '')) && /<\s*(?:[A-Za-z_][\w.-]*:)?PIPINGELEMENT\b/i.test(String(text || ''));
}

function convertCaesarInputXml(xmlText, sourceName, options) {
  const staged = buildInputXmlDirectManagedStageJson(xmlText, { sourceName, ...(options || {}) });
  const xml = _buildPsiXmlFromRmssHierarchy(staged.hierarchy || [], sourceName, {
    source: options?.source || 'InputXML -> XML',
    purpose: options?.purpose || 'CAESAR InputXML bridge conversion',
    titleLine: options?.titleLine || 'CAESAR InputXML converted XML',
    nodeStart: options?.nodeStart || 10,
    nodeStep: options?.nodeStep || 10,
    defaultDiameter: options?.defaultDiameter || 100,
    defaultWallThickness: options?.defaultWallThickness ?? 0,
    defaultInsulationThickness: options?.defaultInsulationThickness ?? 0,
    defaultCorrosionAllowance: options?.defaultCorrosionAllowance ?? 0,
  });
  return { dialect: 'caesar-inputxml', xmlText: xml.xmlText, stats: { ...staged.stats, psiBranches: xml.branchCount, psiNodes: xml.nodeCount, skippedComponents: xml.skippedComponents } };
}

function convertInputXml(xmlText, sourceName, options) {
  if (looksLikeCustomInputXml(xmlText)) {
    const result = buildPsiXmlFromCustomInputXml(xmlText, { sourceName, ...(options || {}) });
    return { dialect: 'custom-inputxml-root', xmlText: result.xmlText, stats: result.stats };
  }
  if (isCaesarInputXml(xmlText)) return convertCaesarInputXml(xmlText, sourceName, options || {});
  if (looksLikePsiXml(xmlText)) return { dialect: 'psi-xml-pass-through', xmlText, stats: { branches: (xmlText.match(/<Branch\b/g) || []).length, nodes: (xmlText.match(/<Node\b/g) || []).length } };
  throw new Error('InputXML -> XML requires custom <Root><Branch><Node> XML, CAESARII InputXML, or PipeStressExport XML.');
}

export async function run(context) {
  const primary = primaryInput(context);
  const inputText = decodeTextUtf8(primary.bytes);
  const stem = baseNameWithoutExtension(primary.name);
  const gated = await runInputXmlCompatibilityPreflight(context, {
    xmlText: inputText,
    sourceName: primary.name,
    outputName: `${stem}_canonical.input.xml`,
  });
  if (!gated.releaseEligible) {
    context.setStatus?.(`InputXML -> XML ${gated.status}; no XML output was released.`, 'warn');
    return {
      ok: false,
      outputs: gated.evidence,
      logs: {
        ...(gated.logs || {}),
        inputXmlCompatibilityRequest: gated.request,
      },
    };
  }
  const converted = convertInputXml(gated.canonicalOutput.text, primary.name, context.options || {});
  const positionTags = (converted.xmlText.match(/<Position>/g) || []).length;
  const audit = {
    schema: 'inputxml-to-xml-audit/v1',
    inputName: primary.name,
    converter: context.converterId || 'inputxml_to_xml',
    dialect: converted.dialect,
    stats: converted.stats,
    positionTags,
  };
  context.setStatus?.(`InputXML -> XML completed: dialect=${converted.dialect}, positions=${positionTags}.`, 'ok');
  return {
    ok: true,
    outputs: [
      { name: `${stem}_inputxml_to_xml.xml`, text: converted.xmlText, mime: 'application/xml;charset=utf-8' },
      { name: `${stem}_inputxml_to_xml.audit.json`, text: JSON.stringify(audit, null, 2), mime: 'application/json;charset=utf-8' },
      ...gated.evidence,
    ],
    logs: {
      stdout: [`Input dialect: ${converted.dialect}`, `Position tags: ${positionTags}`, `Stats: ${JSON.stringify(converted.stats)}`],
      stderr: [],
      preflight: gated.logs?.preflight,
      inputXmlCompatibilityRequest: gated.request,
    },
  };
}
