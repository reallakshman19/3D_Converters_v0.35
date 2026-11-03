function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function truthy(value) { if (value === true) return true; if (value === false || value === undefined || value === null) return false; if (typeof value === 'number') return value !== 0; return /^(1|true|yes|on)$/i.test(text(value)); }
function defaultTrue(value) { return value === undefined || value === null ? true : truthy(value); }
function numeric(value) { const match = text(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/); if (!match) return null; const number = Number(match[0]); return Number.isFinite(number) ? number : null; }
function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function childrenByName(parent, name) { return [...(parent?.childNodes || [])].filter((node) => node.nodeType === 1 && localName(node) === name); }
function firstChild(parent, name) { return childrenByName(parent, name)[0] || null; }
function childText(parent, name) { return text(firstChild(parent, name)?.textContent); }
function configFrom(options = {}) { return options?.config && typeof options.config === 'object' && !Array.isArray(options.config) ? options.config : options; }
function shouldDropGasket(config = {}) { return truthy(config.disableGasketNodes) || truthy(config.disableGasketInOutput) || (defaultTrue(config.dropGasketNodes) && defaultTrue(config.dropGasketsInEnrichment)); }
function shouldDropShort(config = {}) { return defaultTrue(config.dropShortElementLengthNodes); }
function diagnosticsForNode(node, stage, reason, thresholdMm = null) {
  const componentType = childText(node, 'ComponentType').toUpperCase();
  const elementLengthMm = numeric(childText(node, 'ElementLengthMm'));
  return {
    type: reason === 'gasket' ? 'gasket-node-dropped' : 'short-element-length-node-dropped',
    stage,
    nodeNumber: childText(node, 'NodeNumber'),
    componentType,
    componentRefNo: childText(node, 'ComponentRefNo'),
    elementLengthMm,
    thresholdMm,
    message: reason === 'gasket'
      ? 'Full GASK Node block removed by XML-CII invariant cleanup.'
      : `Full Node block removed because ElementLengthMm <= ${thresholdMm} mm by XML-CII invariant cleanup.`,
  };
}
function updateTypeCount(stats, componentType) { const key = text(componentType).toUpperCase() || 'UNKNOWN'; stats.shortElementLengthNodesDroppedByType[key] = (stats.shortElementLengthNodesDroppedByType[key] || 0) + 1; }
function cleanDom(xmlText, config, stage) {
  const stats = { gasketNodesDropped: 0, shortElementLengthNodesDropped: 0, shortElementLengthNodesDroppedByType: {} };
  const diagnostics = [];
  const document = new DOMParser().parseFromString(text(xmlText), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) return null;
  const thresholdMm = Math.max(0, Number(config.shortElementLengthDropThresholdMm ?? 6));
  const dropGask = shouldDropGasket(config);
  const dropShort = shouldDropShort(config) && thresholdMm > 0;
  for (const node of [...document.getElementsByTagName('Node')]) {
    const componentType = childText(node, 'ComponentType').toUpperCase();
    const length = numeric(childText(node, 'ElementLengthMm'));
    const isGasket = dropGask && componentType === 'GASK';
    const isShort = dropShort && length !== null && length <= thresholdMm;
    if (!isGasket && !isShort) continue;
    diagnostics.push(diagnosticsForNode(node, stage, isGasket ? 'gasket' : 'short', thresholdMm));
    if (isGasket) stats.gasketNodesDropped += 1;
    if (isShort) { stats.shortElementLengthNodesDropped += 1; updateTypeCount(stats, componentType); }
    node.parentNode?.removeChild(node);
  }
  return { xmlText: new XMLSerializer().serializeToString(document), stats, diagnostics };
}
function tagValue(block, name) { return text(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.replace(/<[^>]+>/g, '')); }
function cleanRegex(xmlText, config, stage) {
  const stats = { gasketNodesDropped: 0, shortElementLengthNodesDropped: 0, shortElementLengthNodesDroppedByType: {} };
  const diagnostics = [];
  const thresholdMm = Math.max(0, Number(config.shortElementLengthDropThresholdMm ?? 6));
  const dropGask = shouldDropGasket(config);
  const dropShort = shouldDropShort(config) && thresholdMm > 0;
  const out = text(xmlText).replace(/<Node\b[\s\S]*?<\/Node>/gi, (block) => {
    const componentType = tagValue(block, 'ComponentType').toUpperCase();
    const length = numeric(tagValue(block, 'ElementLengthMm'));
    const isGasket = dropGask && componentType === 'GASK';
    const isShort = dropShort && length !== null && length <= thresholdMm;
    if (!isGasket && !isShort) return block;
    diagnostics.push({
      type: isGasket ? 'gasket-node-dropped' : 'short-element-length-node-dropped', stage,
      nodeNumber: tagValue(block, 'NodeNumber'), componentType, componentRefNo: tagValue(block, 'ComponentRefNo'),
      elementLengthMm: length, thresholdMm,
      message: isGasket ? 'Full GASK Node block removed by XML-CII invariant regex cleanup.' : `Full Node block removed because ElementLengthMm <= ${thresholdMm} mm by XML-CII invariant regex cleanup.`,
    });
    if (isGasket) stats.gasketNodesDropped += 1;
    if (isShort) { stats.shortElementLengthNodesDropped += 1; updateTypeCount(stats, componentType); }
    return '';
  });
  return { xmlText: out, stats, diagnostics };
}
export function cleanXmlCiiNodeBlocks(xmlText, options = {}) {
  const config = configFrom(options);
  const stage = text(options.stage || config.stage || 'xml-cii-node-block-cleanup');
  if (!shouldDropGasket(config) && !shouldDropShort(config)) return { xmlText, stats: { gasketNodesDropped: 0, shortElementLengthNodesDropped: 0, shortElementLengthNodesDroppedByType: {} }, diagnostics: [] };
  if (typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
    try { const result = cleanDom(xmlText, config, stage); if (result) return result; } catch {}
  }
  return cleanRegex(xmlText, config, stage);
}
