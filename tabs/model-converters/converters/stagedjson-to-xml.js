import { decodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';
import { normalizeStagedJson } from '../../../contracts/stagedjson-contract.js';
import {
  _looksLikeStagedHierarchy,
  _filterStagedHierarchyByScope,
  _buildPsiXmlFromRmssHierarchy
} from './stagedjson-xml-helpers.js';

function _toText(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

export function _buildXmlFromStagedJsonText(stagedJsonText, inputName, options) {
  let parsed;
  try {
    parsed = JSON.parse(_toText(stagedJsonText));
  } catch (error) {
    throw new Error(`Staged JSON parse failed: ${_toText(error?.message || error)}`);
  }

  let normalized;
  try {
    normalized = normalizeStagedJson(parsed);
  } catch (error) {
    throw new Error(`JSON payload is not staged hierarchy format (branch -> children -> attributes): ${_toText(error?.message || error)}`);
  }
  const hierarchy = normalized.branches;
  if (!_looksLikeStagedHierarchy(hierarchy)) {
    throw new Error('JSON payload is not staged hierarchy format (branch -> children -> attributes).');
  }
  const scope = _filterStagedHierarchyByScope(hierarchy, options?.rvmScope);
  const scopedHierarchy = scope.hierarchy;
  if (!scopedHierarchy.length) {
    throw new Error(`Scope filter ${JSON.stringify(scope.pattern)} did not match any staged branch/site.`);
  }
  const xmlBuild = _buildPsiXmlFromRmssHierarchy(scopedHierarchy, inputName, options);
  return {
    xmlText: xmlBuild.xmlText,
    stageJsonText: JSON.stringify(scopedHierarchy, null, 2),
    branchCount: xmlBuild.branchCount,
    nodeCount: xmlBuild.nodeCount,
    skippedComponents: xmlBuild.skippedComponents,
    supportMapperStats: xmlBuild.supportMapperStats,
    scopeStats: scope.stats,
    scopePattern: scope.pattern,
    rvmScope: scope.scope,
    stagedEnvelope: normalized.envelope,
  };
}

export async function run(context) {
  const primary = context.inputFiles.find(f => f.role === 'primary');
  if (!primary || !primary.bytes) {
    throw new Error('Primary staged JSON input is required for StagedJSON -> XML conversion.');
  }
  const stagedJsonText = decodeTextUtf8(primary.bytes);
  const stagedResult = _buildXmlFromStagedJsonText(stagedJsonText, primary.name, context.options);

  const outputName = `${baseNameWithoutExtension(primary.name)}_stagedjson_to_xml.xml`;

  context.setStatus(
    `Staged hierarchy parsed: ${stagedResult.branchCount} branch(es). Generated ${stagedResult.nodeCount} node(s) into PSI-style XML.`,
    'ok'
  );

  return {
    ok: true,
    outputs: [
      {
        name: outputName,
        text: stagedResult.xmlText,
        mime: 'text/xml;charset=utf-8'
      }
    ],
    logs: {
      stdout: [
        `Staged hierarchy parsed: ${stagedResult.branchCount} branch(es).`,
        `Generated ${stagedResult.nodeCount} node(s) into PSI-style XML.`,
        `Support mapper conversion pass: scanned=${stagedResult.supportMapperStats?.scanned || 0}, mapped=${stagedResult.supportMapperStats?.mapped || 0}.`
      ],
      stderr: stagedResult.skippedComponents > 0
        ? [`Skipped ${stagedResult.skippedComponents} component(s) with incomplete coordinates.`]
        : []
    }
  };
}
