/**
 * Converts the repository Custom InputXML dialect into PSI116-style XML.
 * Parameters: <Root><Branch><Node> XML text and explicit metadata options.
 * Outputs: <PipeStressExport> XML consumable by XML -> CII (2019).
 * Fallback: missing optional fields are emitted as zero/blank values while
 * Position remains mandatory for each emitted node.
 */

const XML_NS = 'http://aveva.com/pipeStress116.xsd';
const NODE_FIELDS = Object.freeze([
  'NodeNumber', 'NodeName', 'Endpoint', 'Rigid', 'ComponentType', 'Weight',
  'ComponentRefNo', 'ConnectionType', 'OutsideDiameter', 'WallThickness',
  'CorrosionAllowance', 'InsulationThickness', 'Position', 'BendRadius',
  'BendType', 'SIF', 'PipingClass', 'Rating', 'BoreMm', 'ElementLengthMm',
  'MaterialName', 'MaterialCode', 'DTXR_POS', 'DTXR_PS', 'DTXR', 'TEEDESC',
]);

function t(value) { return String(value ?? '').trim(); }
function esc(value) { return t(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function safeStem(name) { return t(name).replace(/[\\/]+/g, '/').split('/').pop().replace(/\.[^.]+$/, '') || 'inputxml'; }
function tag(name, value, indent) { return `${indent}<${name}>${esc(value)}</${name}>`; }
function groupTag(name, body, indent) { return `${indent}<${name}>\n${body.join('\n')}\n${indent}</${name}>`; }
function attrsFrom(raw) {
  const out = {};
  String(raw || '').replace(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g, (_, key, value) => { out[key] = value; return ''; });
  return out;
}
function cleanTagName(tagName) { return t(tagName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function collectBlocks(xml, tagName) {
  const tag = cleanTagName(tagName);
  const source = String(xml || '');
  const out = [];
  const start = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
  let match;
  while ((match = start.exec(source))) {
    const full = match[0] || '';
    const attrs = attrsFrom(match[1] || '');
    if (/\/\s*>$/.test(full)) { out.push({ attrs, body: '', raw: full }); continue; }
    const bodyStart = start.lastIndex;
    const close = new RegExp(`</${tag}>`, 'gi');
    close.lastIndex = bodyStart;
    const closeMatch = close.exec(source);
    if (!closeMatch) continue;
    const raw = source.slice(match.index, closeMatch.index + closeMatch[0].length);
    out.push({ attrs, body: source.slice(bodyStart, closeMatch.index), raw });
    start.lastIndex = closeMatch.index + closeMatch[0].length;
  }
  return out;
}
function childText(body, tagName) {
  const block = collectBlocks(body, tagName)[0];
  return t(block?.body).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
function firstText(body, names, fallback = '') {
  for (const name of names) {
    const value = childText(body, name);
    if (value) return value;
  }
  return fallback;
}
function pressureLines(branchBody) {
  const body = collectBlocks(branchBody, 'Pressure')[0]?.body || '';
  const lines = [];
  for (let index = 1; index <= 9; index += 1) lines.push(tag(`Pressure${index}`, childText(body, `Pressure${index}`), '        '));
  const hydro = childText(body, 'HydroPressure');
  if (hydro) lines.push(tag('HydroPressure', hydro, '        '));
  return lines;
}
function temperatureLines(branchBody) {
  const body = collectBlocks(branchBody, 'Temperature')[0]?.body || '';
  const lines = [];
  for (let index = 1; index <= 9; index += 1) lines.push(tag(`Temperature${index}`, childText(body, `Temperature${index}`), '        '));
  return lines;
}
function directionCosines(direction) {
  const value = t(direction).toUpperCase();
  if (value === '+X' || value === 'X') return ['1', '0', '0'];
  if (value === '-X') return ['-1', '0', '0'];
  if (value === '+Y' || value === 'Y' || value === 'REST') return ['0', '1', '0'];
  if (value === '-Y') return ['0', '-1', '0'];
  if (value === '+Z' || value === 'Z') return ['0', '0', '1'];
  if (value === '-Z') return ['0', '0', '-1'];
  return ['', '', ''];
}
function normalizedRestraintType(value) {
  const upper = t(value).toUpperCase();
  if (upper === 'REST' || upper === 'RESTING') return '+Y';
  return t(value);
}
function restraintType(blockBody) {
  return normalizedRestraintType(firstText(blockBody, ['Type', 'Direction', 'RestraintType'], ''));
}
function restraintLines(nodeBody) {
  const blocks = [...collectBlocks(nodeBody, 'CustomRestraint'), ...collectBlocks(nodeBody, 'Restraint')];
  return blocks.map((block) => {
    const type = restraintType(block.body);
    const direction = firstText(block.body, ['Direction'], type);
    const [cx, cy, cz] = directionCosines(direction);
    const rows = [
      tag('Type', type, '          '),
      tag('Stiffness', firstText(block.body, ['Stiffness'], ''), '          '),
      tag('Gap', firstText(block.body, ['Gap'], ''), '          '),
      tag('Friction', firstText(block.body, ['Friction'], ''), '          '),
    ];
    if (cx || cy || cz) {
      rows.push(tag('DirectionCosineX', cx, '          '));
      rows.push(tag('DirectionCosineY', cy, '          '));
      rows.push(tag('DirectionCosineZ', cz, '          '));
    }
    return groupTag('Restraint', rows, '        ');
  });
}
function normalizedNodeValue(nodeBody, fieldName) {
  if (fieldName === 'ComponentType') return firstText(nodeBody, ['ComponentType', 'Type'], 'PIPE');
  if (fieldName === 'Position') return firstText(nodeBody, ['Position', 'POS'], '');
  if (fieldName === 'OutsideDiameter') return firstText(nodeBody, ['OutsideDiameter', 'BoreMm'], '');
  if (fieldName === 'SIF') return firstText(nodeBody, ['SIF'], '0');
  if (fieldName === 'BendRadius') return firstText(nodeBody, ['BendRadius'], '0');
  return childText(nodeBody, fieldName);
}
function nodeXml(nodeBlock, stats) {
  const nodeBody = nodeBlock.body || '';
  const number = normalizedNodeValue(nodeBody, 'NodeNumber');
  const position = normalizedNodeValue(nodeBody, 'Position');
  if (!number || !position) {
    stats.skippedNodes += 1;
    return '';
  }
  const lines = ['      <Node>'];
  for (const field of NODE_FIELDS) {
    const value = normalizedNodeValue(nodeBody, field);
    if (!value && ['BendType', 'PipingClass', 'Rating', 'BoreMm', 'ElementLengthMm', 'MaterialName', 'MaterialCode', 'DTXR_POS', 'DTXR_PS', 'DTXR', 'TEEDESC'].includes(field)) continue;
    lines.push(tag(field, value, '        '));
  }
  for (const restraint of restraintLines(nodeBody)) lines.push(restraint);
  lines.push('      </Node>');
  stats.nodes += 1;
  return lines.join('\n');
}
function branchXml(branchBlock, stats) {
  const body = branchBlock.body || '';
  const name = firstText(body, ['Branchname', 'BranchName', 'LineNo'], '/INPUTXML/BRANCH-001');
  const nodeBlocks = collectBlocks(body, 'Node');
  const nodeRows = nodeBlocks.map((block) => nodeXml(block, stats)).filter(Boolean);
  if (!nodeRows.length) {
    stats.skippedBranches += 1;
    return '';
  }
  stats.branches += 1;
  return [
    '    <Branch>',
    tag('Branchname', name, '      '),
    groupTag('Temperature', temperatureLines(body), '      '),
    groupTag('Pressure', pressureLines(body), '      '),
    tag('MaterialNumber', firstText(body, ['MaterialNumber'], '0'), '      '),
    tag('InsulationDensity', firstText(body, ['InsulationDensity'], '0'), '      '),
    tag('FluidDensity', firstText(body, ['FluidDensity'], '0'), '      '),
    ...nodeRows,
    '    </Branch>',
  ].join('\n');
}

export function looksLikeCustomInputXml(xmlText) {
  return /<\s*Root\b/i.test(String(xmlText || '')) && /<\s*Branch\b/i.test(String(xmlText || '')) && /<\s*Node\b/i.test(String(xmlText || ''));
}

export function looksLikePsiXml(xmlText) {
  return /<\s*(?:[A-Za-z_][\w.-]*:)?PipeStressExport\b/i.test(String(xmlText || ''));
}

export function buildPsiXmlFromCustomInputXml(xmlText, options = {}) {
  const branchBlocks = collectBlocks(xmlText, 'Branch');
  if (!branchBlocks.length) throw new Error('Custom InputXML does not contain any Branch blocks.');
  const stats = { dialect: 'custom-inputxml-root', branches: 0, nodes: 0, skippedBranches: 0, skippedNodes: 0 };
  const project = safeStem(options.sourceName || 'custom_input');
  const branches = branchBlocks.map((block) => branchXml(block, stats)).filter(Boolean);
  if (!branches.length) throw new Error('Custom InputXML did not emit any positioned nodes.');
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<PipeStressExport xmlns="${XML_NS}">`,
    tag('DateTime', new Date().toISOString(), '  '),
    tag('Source', options.source || 'InputXML -> XML', '  '),
    tag('Version', options.version || '0.0.0.0', '  '),
    tag('UserName', options.userName || 'browser-runtime', '  '),
    tag('Purpose', options.purpose || 'InputXML bridge conversion', '  '),
    tag('ProjectName', options.projectName || project, '  '),
    tag('MDBName', options.mdbName || `/${project}`, '  '),
    tag('TitleLine', options.titleLine || 'InputXML converted XML', '  '),
    '  <!-- Configuration information -->',
    tag('RestrainOpenEnds', options.restrainOpenEnds || 'No', '  '),
    tag('AmbientTemperature', options.ambientTemperature || '0', '  '),
    '  <Pipe>',
    tag('FullName', options.pipeName || `/INPUTXML/${project}`, '    '),
    tag('Ref', options.pipeRef || '=INPUTXML/PIPE/1', '    '),
    ...branches,
    '  </Pipe>',
    '</PipeStressExport>',
  ];
  return { xmlText: `${lines.join('\n')}\n`, stats };
}
