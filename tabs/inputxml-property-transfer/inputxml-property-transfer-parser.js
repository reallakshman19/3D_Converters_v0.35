import { normalizeInputXmlPropertyTransferOptions } from './inputxml-property-transfer-defaults.js';

const POSITION_RE = {
  e: /\bE\s*([-+]?\d+(?:\.\d+)?)\s*mm?\b/i,
  s: /\bS\s*([-+]?\d+(?:\.\d+)?)\s*mm?\b/i,
  u: /\bU\s*([-+]?\d+(?:\.\d+)?)\s*mm?\b/i,
};

const CORE_NODE_PROPS = Object.freeze([
  'OutsideDiameter',
  'WallThickness',
  'CorrosionAllowance',
  'InsulationThickness',
  'Weight',
  'MaterialCode',
  'MaterialNumber',
  'BendRadius',
  'BendType',
  'AlphaAngle',
]);

const CORE_BRANCH_PROPS = Object.freeze([
  'Temperature1', 'Temperature2', 'Temperature3', 'Temperature4', 'Temperature5', 'Temperature6', 'Temperature7', 'Temperature8', 'Temperature9',
  'Pressure1', 'Pressure2', 'Pressure3', 'Pressure4', 'Pressure5', 'Pressure6', 'Pressure7', 'Pressure8', 'Pressure9',
  'FluidDensity', 'FluidDensity1', 'FluidDensity2', 'FluidDensity3', 'HydrotestPressure', 'MaterialNumber',
]);

export function parseInputXmlPropertyTransferModel(xmlText, options = {}) {
  const normalizedOptions = normalizeInputXmlPropertyTransferOptions(options);
  const side = String(options.side || 'xml').trim() || 'xml';
  const xml = String(xmlText || '');
  const diagnostics = [];
  const branches = [];
  const branchRe = /<Branch\b[^>]*>([\s\S]*?)<\/Branch>/gi;
  let branchMatch;
  let branchIndex = 0;

  while ((branchMatch = branchRe.exec(xml))) {
    const branchXml = branchMatch[1];
    const branchName = textBetween(branchXml, 'BranchName');
    const branch = {
      side,
      branchIndex,
      branchId: `${side}:B${branchIndex + 1}`,
      branchName,
      lineFamily: extractLineFamily(branchName, side, normalizedOptions),
      props: collectProps(branchXml, CORE_BRANCH_PROPS.concat(normalizedOptions.selectedBranchProperties || [])),
      rawXml: branchXml,
      nodes: [],
    };

    const nodeRe = /<Node\b[^>]*>([\s\S]*?)<\/Node>/gi;
    let nodeMatch;
    let nodeIndex = 0;
    while ((nodeMatch = nodeRe.exec(branchXml))) {
      const nodeXml = nodeMatch[1];
      const rawPosition = textBetween(nodeXml, 'Position');
      const positionResult = parsePosition(rawPosition);
      if (!positionResult.position) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_POSITION',
          side,
          branchName,
          nodeIndex,
          message: positionResult.reason || `Invalid Position: ${rawPosition}`,
        });
      }
      const nodeProps = collectProps(nodeXml, CORE_NODE_PROPS.concat(normalizedOptions.selectedNodeProperties || []));
      const node = {
        side,
        id: `${side}:B${branchIndex + 1}:N${nodeIndex + 1}`,
        branch,
        branchIndex,
        nodeIndex,
        nodeNumber: textBetween(nodeXml, 'NodeNumber'),
        nodeName: textBetween(nodeXml, 'NodeName'),
        componentType: textBetween(nodeXml, 'ComponentType'),
        rawPosition,
        position: positionResult.position,
        coordinateKey: positionResult.position ? coordinateKey(positionResult.position, normalizedOptions.coordinateDecimals) : '',
        outsideDiameter: numberOrNull(nodeProps.OutsideDiameter),
        wallThickness: numberOrNull(nodeProps.WallThickness),
        weight: numberOrNull(nodeProps.Weight),
        materialCode: nodeProps.MaterialCode || '',
        props: nodeProps,
        rawXml: nodeXml,
      };
      branch.nodes.push(node);
      nodeIndex += 1;
    }

    branches.push(branch);
    branchIndex += 1;
  }

  if (!branches.length) {
    diagnostics.push({ severity: 'warning', code: 'NO_BRANCHES', side, message: 'No <Branch> elements found.' });
  }

  return {
    side,
    branches,
    nodes: branches.flatMap((branch) => branch.nodes),
    diagnostics,
    options: normalizedOptions,
  };
}

export function textBetween(xml, tag) {
  const match = String(xml || '').match(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i'));
  return match ? decodeXmlText(match[1].trim()) : '';
}

export function parsePosition(value) {
  const text = String(value || '');
  const e = text.match(POSITION_RE.e);
  const s = text.match(POSITION_RE.s);
  const u = text.match(POSITION_RE.u);
  if (!e || !s || !u) return { position: null, reason: `Position must contain E, S, and U coordinates: ${text}` };
  return { position: { e: Number(e[1]), s: Number(s[1]), u: Number(u[1]) }, reason: '' };
}

export function coordinateKey(position, decimals = 3) {
  if (!position) return '';
  const d = Math.max(0, Math.min(9, Math.trunc(Number(decimals) || 0)));
  return `${Number(position.e).toFixed(d)}|${Number(position.s).toFixed(d)}|${Number(position.u).toFixed(d)}`;
}

export function extractLineFamily(branchName, side = 'source', options = {}) {
  const source = String(branchName || '');
  const regexValue = side === 'target'
    ? (options.targetLineFamilyRegex || options.lineFamilyRegex || options.sourceLineFamilyRegex)
    : (options.sourceLineFamilyRegex || options.lineFamilyRegex || options.targetLineFamilyRegex);
  const regex = toRegExp(regexValue);
  if (!regex) return '';
  const match = source.match(regex);
  return (match?.[1] || match?.[0] || '').trim().toUpperCase();
}

export function numberOrNull(value) {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function collectProps(xml, props) {
  const seen = new Set();
  const out = {};
  for (const prop of props) {
    const key = String(prop || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out[key] = textBetween(xml, key);
  }
  return out;
}

function toRegExp(value) {
  if (value instanceof RegExp) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  return new RegExp(text, 'i');
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
