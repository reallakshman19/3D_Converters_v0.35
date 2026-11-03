export function parseCiiElements(text) {
  const lines = (text || '').split('\n').map(l => l.trimEnd());
  const elementsIdx = lines.findIndex(l => l.includes('CII-ELEMENTS-PAYLOAD') || l.includes('ELEMENTS'));
  if (elementsIdx === -1) return [];

  const elementBlocks = [];
  let currentBlock = [];
  
  for (let i = elementsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-Z_]+$/.test(line) && line !== 'ELEMENTS') {
      break;
    }
    if (line === '') continue;
    currentBlock.push(line);
    if (currentBlock.length === 14) {
      elementBlocks.push(currentBlock);
      currentBlock = [];
    }
  }
  
  return elementBlocks.map(block => {
    const numbers = [];
    block.forEach((line, idx) => {
      if (idx === 10) return;
      const matches = line.match(/-?\d+(?:\.\d+)?(?:E[+-]?\d+)?/gi) || [];
      numbers.push(...matches.map(Number));
    });
    return numbers;
  });
}

export function parseCiiRestraints(text) {
  const lines = (text || '').split('\n').map(l => l.trimEnd());
  const idx = lines.findIndex(l => l.includes('RESTRANT'));
  if (idx === -1) return [];

  const restraints = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-Z_]+$/.test(line) && line !== 'RESTRANT') break;
    if (line === '') continue;
    
    const parts1 = lines[i].match(/-?\d+(?:\.\d+)?(?:E[+-]?\d+)?/gi) || [];
    const parts2 = lines[i+1]?.match(/-?\d+(?:\.\d+)?(?:E[+-]?\d+)?/gi) || [];
    
    if (parts1.length >= 5) {
      restraints.push({
        node: Number(parts1[0]),
        type: Number(parts1[1]),
        stiffness: Number(parts1[2]),
        gap: Number(parts1[3]),
        friction: Number(parts1[4]),
        cx: parts2[0] ? Number(parts2[0]) : 0,
        cy: parts2[1] ? Number(parts2[1]) : 0,
        cz: parts2[2] ? Number(parts2[2]) : 0
      });
    }
    i += 3;
  }
  return restraints;
}

export function parseEnrichedXmlNodes(xmlText) {
  const nodes = [];
  const matches = (xmlText || '').matchAll(/<Node>([\s\S]*?)<\/Node>/g);
  for (const m of matches) {
    const nt = m[1];
    const nodeNumber = nt.match(/<NodeNumber>(.*?)<\/NodeNumber>/)?.[1];
    const type = nt.match(/<ComponentType>(.*?)<\/ComponentType>/)?.[1];
    const elLen = nt.match(/<ElementLengthMm>(.*?)<\/ElementLengthMm>/)?.[1];
    const pos = nt.match(/<Position>(.*?)<\/Position>/)?.[1];
    if (nodeNumber) {
      nodes.push({
        nodeNumber: Number(nodeNumber.trim()),
        componentType: type ? type.trim() : '',
        elementLengthMm: elLen ? Number(elLen.trim()) : null,
        position: pos ? pos.trim() : ''
      });
    }
  }
  return nodes;
}
