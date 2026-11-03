import { buildCustomInputModel, summarizeCustomInputModel } from '../../../converters/xml-cii2019-core/custom-input-model.js';
import { buildCustomInputXml } from '../../../converters/xml-cii2019-core/custom-input-xml-builder.js';
import { buildPsiXmlFromCustomInputXml } from '../../../converters/xml-cii2019-core/inputxml-to-psi-xml.js';
import { parseSelJsonToInputSource, selJsonTraceToCsv } from '../../../converters/xml-cii2019-core/custom-input-seljson-source.js';
import { decodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';

/**
 * Runs SelJson -> PSI XML directly through the Custom InputXML bridge.
 * Parameters: primary 3DV selection JSON plus explicit converter options.
 * Outputs: PipeStressExport XML, intermediate InputXML, audit JSON, and trace CSV.
 * Fallback: unsupported selected geometry is skipped and recorded in trace rows.
 */

function primaryInput(context) {
  const primary = context?.inputFiles?.find((file) => file.role === 'primary');
  if (!primary || !primary.bytes) throw new Error('Primary 3DV SelJson input is required for SelJson -> XML conversion.');
  return primary;
}

function writerOptions(options) {
  return {
    ...(options || {}),
    dropShortElementLengthNodes: options?.dropShortElementLengthNodes === true,
  };
}

export async function run(context) {
  const primary = primaryInput(context);
  const selJsonText = decodeTextUtf8(primary.bytes);
  const parsed = parseSelJsonToInputSource(selJsonText, context.options || {});
  const model = buildCustomInputModel(parsed.rows);
  const inputXmlText = buildCustomInputXml(model, writerOptions(context.options || {}));
  const xml = buildPsiXmlFromCustomInputXml(inputXmlText, { sourceName: primary.name, ...(context.options || {}) });
  const modelSummary = summarizeCustomInputModel(model);
  const stem = baseNameWithoutExtension(primary.name);
  const audit = {
    schema: 'seljson-to-xml-audit/v1',
    inputName: primary.name,
    converter: context.converterId || 'seljson_to_xml',
    source: parsed.summary,
    modelSummary,
    psiStats: xml.stats,
    diagnostics: parsed.diagnostics,
  };

  context.setStatus?.(`SelJson -> XML completed: ${modelSummary.nodes} node(s), ${modelSummary.restraints} restraint(s).`, 'ok');
  return {
    ok: true,
    outputs: [
      { name: `${stem}_seljson_to_xml.xml`, text: xml.xmlText, mime: 'application/xml;charset=utf-8' },
      { name: `${stem}_seljson_to_xml.inputxml.xml`, text: inputXmlText, mime: 'application/xml;charset=utf-8' },
      { name: `${stem}_seljson_to_xml.audit.json`, text: JSON.stringify(audit, null, 2), mime: 'application/json;charset=utf-8' },
      { name: `${stem}_seljson_to_xml.trace.csv`, text: selJsonTraceToCsv(parsed.trace), mime: 'text/csv;charset=utf-8' },
    ],
    logs: {
      stdout: [
        `SelJson source kind: ${parsed.summary.sourceKind}`,
        `Selected items: ${parsed.summary.selectedItems}`,
        `Emitted nodes: ${modelSummary.nodes}`,
        `Restraints: ${modelSummary.restraints}`,
        `PSI branches: ${xml.stats?.branches || 0}`,
      ],
      stderr: parsed.diagnostics.map((entry) => `${entry.severity || 'info'} ${entry.code || ''}: ${entry.message || ''}`),
    },
  };
}
