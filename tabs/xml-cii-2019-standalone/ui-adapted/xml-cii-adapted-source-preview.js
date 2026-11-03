import { createElement } from './xml-cii-adapted-dom.js';
import { detectXmlCiiWorkflowSourceKind } from '../xml-cii-workflow-source-detect.js';

export function renderStandaloneSourcePreviewPanel(card, state) {
  if (!state.sourceText) {
    card.appendChild(createElement('div', 'No source text loaded. Go to Tab 0 to load XML or InputXML.', 'xml-cii-file-summary'));
    return;
  }
  const detected = detectXmlCiiWorkflowSourceKind(state.sourceText, state.sourceKind);
  const actual = state.sourceKind === 'auto' ? detected : state.sourceKind;
  try {
    const doc = new DOMParser().parseFromString(state.sourceText, 'application/xml');
    if (renderParserError(card, doc)) return;
    if (actual === 'xml') renderXmlPreview(card, doc);
    else renderInputXmlPreview(card, doc);
  } catch (err) {
    card.appendChild(createElement('div', `Error parsing source: ${err.message}`, 'xml-cii-invalid'));
  }
}

function renderParserError(card, doc) {
  const err = doc.querySelector('parsererror');
  if (!err) return false;
  card.appendChild(createElement('div', 'Invalid XML format detected.', 'xml-cii-invalid'));
  const pre = createElement('pre');
  pre.textContent = err.textContent;
  card.appendChild(pre);
  return true;
}

function createTh(text) {
  const th = createElement('th', text);
  Object.assign(th.style, { borderBottom: '1px solid rgba(145,160,180,.3)', padding: '8px', textAlign: 'left', opacity: '0.8' });
  return th;
}

// Helper td creation with inline borders and styles
function createTd(text) {
  const td = createElement('td', text);
  Object.assign(td.style, { borderBottom: '1px solid rgba(145,160,180,.15)', padding: '8px' });
  return td;
}

function findNodeText(p, name) {
  const el = Array.from(p?.querySelectorAll('*') || []).find(x => (x.localName || '').toLowerCase() === name.toLowerCase());
  return el ? el.textContent || '' : '';
}

function renderXmlTree(card, branches) {
  card.appendChild(createElement('h3', `Hierarchy Preview (Branches: ${branches.length})`));
  const treeContainer = createElement('div', '', 'xml-cii-tree-container');
  Object.assign(treeContainer.style, {
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    padding: '12px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    whiteSpace: 'pre',
    border: '1px solid #444',
    lineHeight: '1.4',
    height: '50vh',
    maxHeight: '50vh',
    overflowY: 'auto'
  });

  const getIcon = (type) => {
    switch (type.toLowerCase()) {
      case 'branch': return '🌿';
      case 'node': return '🔵';
      case 'component': return '⚙️';
      default: return '📄';
    }
  };

  const lines = [];
  branches.slice(0, 50).forEach((branch, bIdx) => {
    const branchName = branch.getAttribute('NAME') || branch.getAttribute('name') || findNodeText(branch, 'Branchname') || 'Unnamed';
    lines.push(createElement('div', `${getIcon('branch')} Branch: ${branchName}`, 'xml-cii-tree-branch'));
    
    const nodes = Array.from(branch.querySelectorAll('*')).filter(el => el.localName && el.localName.toLowerCase() === 'node');
    if (nodes.length === 0) {
      const empty = createElement('div', `    └─ (Empty)`);
      empty.style.color = '#f48771';
      lines.push(empty);
      return;
    }

    const maxNodesToShow = 3;
    nodes.slice(0, maxNodesToShow).forEach((node, nIdx) => {
      const isLastNode = nIdx === Math.min(nodes.length, maxNodesToShow) - 1 && nodes.length <= maxNodesToShow;
      const nodePrefix = isLastNode ? '    └─' : '    ├─';
      
      const num = findNodeText(node, 'NodeNumber') || '?';
      const type = findNodeText(node, 'ComponentType') || '';
      const od = findNodeText(node, 'OutsideDiameter') || '';
      const wt = findNodeText(node, 'WallThickness') || '';
      const mat = findNodeText(node, 'Material') || '';
      const restraint = findNodeText(node, 'RestraintType') || findNodeText(node, 'Restraint') || '';
      
      let details = `Node ${num}`;
      if (type) details += ` [${type}]`;
      if (od) details += ` (OD: ${od})`;
      
      const nodeLine = createElement('div', `${nodePrefix} ${getIcon('node')} ${details}`);
      nodeLine.style.color = '#9cdcfe';
      lines.push(nodeLine);

      // Third level nested details
      const subDetails = [];
      if (od || wt) subDetails.push(`Dimensions: OD ${od || '?'}, WT ${wt || '?'}`);
      if (mat) subDetails.push(`Material: ${mat}`);
      if (restraint) subDetails.push(`Restraint: ${restraint}`);
      
      if (subDetails.length > 0) {
        const subPrefix = isLastNode ? '        ' : '    │   ';
        subDetails.forEach((detail, dIdx) => {
          const isLastDetail = dIdx === subDetails.length - 1;
          const detailPrefix = isLastDetail ? `${subPrefix}└─` : `${subPrefix}├─`;
          const detailLine = createElement('div', `${detailPrefix} ${detail}`);
          detailLine.style.color = '#808080';
          lines.push(detailLine);
        });
      }
    });
    
    if (nodes.length > maxNodesToShow) {
      const extra = createElement('div', `    └─ ... and ${nodes.length - maxNodesToShow} more nodes`);
      extra.style.color = '#808080';
      lines.push(extra);
    }
  });

  if (branches.length > 50) {
    const extraBranch = createElement('div', `... and ${branches.length - 50} more branches`);
    extraBranch.style.color = '#808080';
    extraBranch.style.marginTop = '8px';
    lines.push(extraBranch);
  }

  lines.forEach(l => treeContainer.appendChild(l));
  card.appendChild(treeContainer);
}

function renderXmlPreview(card, doc) {
  const allElements = doc.querySelectorAll('*');
  const branches = Array.from(allElements).filter(el => el.localName && el.localName.toLowerCase() === 'branch');
  renderXmlTree(card, branches);
}

function renderInputXmlTree(card, elements) {
  card.appendChild(createElement('h3', `Hierarchy Preview (Elements: ${elements.length})`));
  const treeContainer = createElement('div', '', 'xml-cii-tree-container');
  Object.assign(treeContainer.style, {
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    padding: '12px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    whiteSpace: 'pre',
    border: '1px solid #444',
    lineHeight: '1.4',
    height: '50vh',
    maxHeight: '50vh',
    overflowY: 'auto'
  });

  const getIcon = (type) => {
    switch ((type || '').toLowerCase()) {
      case 'pipe': return '🪈';
      case 'bend': return '↪️';
      case 'valve': return '🎛️';
      case 'flange': return '🔗';
      case 'rigid': return '🧱';
      case 'tee': return '┳';
      case 'reducer': return '🔽';
      default: return '⚙️';
    }
  };

  const lines = [];
  elements.slice(0, 100).forEach((element, eIdx) => {
    const isLast = eIdx === Math.min(elements.length, 100) - 1;
    const prefix = isLast ? '└─' : '├─';
    
    const name = element.getAttribute('NAME') || element.getAttribute('name') || 'Unnamed';
    const type = element.getAttribute('TYPE') || element.getAttribute('type') || 'PIPE';
    const fromNode = element.getAttribute('FROM_NODE') || element.getAttribute('from_node') || '-';
    const toNode = element.getAttribute('TO_NODE') || element.getAttribute('to_node') || '-';
    
    const line = createElement('div', `${prefix} ${getIcon(type)} Element: ${name} [${type}] (${fromNode} → ${toNode})`);
    lines.push(line);
    
    // Child attributes (Restraints)
    const restraints = [];
    for (let i = 1; i <= 4; i++) {
      const rType = element.getAttribute(`RESTRAINT_${i}_TYPE`) || element.getAttribute(`restraint_${i}_type`);
      if (rType) restraints.push(rType);
    }
    
    if (restraints.length > 0) {
      const rLine = createElement('div', `    └─ ⚓ Restraints: ${restraints.join(', ')}`);
      rLine.style.color = '#c586c0';
      lines.push(rLine);
    }
  });

  if (elements.length > 100) {
    const extra = createElement('div', `└─ ... and ${elements.length - 100} more elements`);
    extra.style.color = '#808080';
    extra.style.marginTop = '8px';
    lines.push(extra);
  }

  if (elements.length === 0) {
    const empty = createElement('div', 'No PIPINGELEMENT elements found.');
    empty.style.color = '#f48771';
    lines.push(empty);
  }

  lines.forEach(l => treeContainer.appendChild(l));
  card.appendChild(treeContainer);
}

function renderInputXmlPreview(card, doc) {
  const allElements = doc.querySelectorAll('*');
  const pipingElements = Array.from(allElements).filter(el => el.localName && el.localName.toLowerCase() === 'pipingelement');
  renderInputXmlTree(card, pipingElements);
}

function wrapAndAppend(card, table) {
  const wrapper = createElement('div');
  wrapper.style.overflowX = 'auto';
  wrapper.style.maxHeight = '250px';
  wrapper.style.marginBottom = '20px';
  wrapper.style.border = '1px solid rgba(145,160,180,.15)';
  wrapper.style.borderRadius = '8px';
  wrapper.appendChild(table);
  card.appendChild(wrapper);
}
