/**
 * RvmPipelineRefResolver.js
 * Wave 4 – resolves Pipeline Ref from node attributes or ancestor hierarchy.
 * Pure JS: no DOM, no three.js.
 */

const PIPELINE_REF_KEYS = [
  'PIPELINE-REFERENCE', 'PIPELINE_REFERENCE', 'PIPELINE_REF', 'PIPELINE', 'LINE_REF', 'LINE_REFERENCE',
];

const LINE_NO_KEYS = [
  'LINE_NO', 'LINE_NUMBER', 'LINENO', 'LINE', 'OWNER',
];

const PIPE_KINDS = ['PIPE', 'TUBI'];
const BRANCH_KINDS = ['BRAN', 'BRANCH', 'LINE', 'PIPELINE', 'LINEGROUP', 'LINE_GROUP'];

function findAttrCaseInsensitive(attrs, keys) {
  const attrKeys = Object.keys(attrs);
  for (const key of keys) {
    const upper = key.toUpperCase();
    const found = attrKeys.find(k => k.toUpperCase() === upper);
    if (found !== undefined && attrs[found] != null && attrs[found] !== '') {
      return String(attrs[found]);
    }
  }
  return null;
}

export class RvmPipelineRefResolver {
  /**
   * @param {object} rvmIndex        – { nodes: [...] }
   * @param {object} options         – { selectedRootIds?: string[] }
   */
  constructor(rvmIndex, options = {}) {
    this._index = rvmIndex;
    this._selectedRootIds = options.selectedRootIds || [];

    // Build a map of canonicalObjectId → node for ancestor lookups
    const nodes = (rvmIndex && rvmIndex.nodes) || [];
    this._nodeById = new Map(nodes.map(n => [n.canonicalObjectId, n]));
  }

  /**
   * Resolves pipelineRef for a node.
   * @param {object} node            – the node object
   * @param {Array}  ancestorChain   – ancestor nodes closest-first (parent → root)
   * @returns {{ pipelineRef: string, source: string }}
   */
  resolve(node, ancestorChain = []) {
    const attrs = node.attributes || {};

    // Priority 1: direct pipeline reference attribute
    const directRef = findAttrCaseInsensitive(attrs, PIPELINE_REF_KEYS);
    if (directRef) {
      return { pipelineRef: directRef, source: 'PIPELINE-REF-DIRECT' };
    }

    // Priority 2: direct line number attribute
    const lineNo = findAttrCaseInsensitive(attrs, LINE_NO_KEYS);
    if (lineNo) {
      return { pipelineRef: lineNo, source: 'PIPELINE-REF-LINE-NO' };
    }

    // Priority 3: parent hierarchy
    for (const ancestor of ancestorChain) {
      const kind = (ancestor.kind || '').toUpperCase().trim();

      if (PIPE_KINDS.includes(kind)) {
        return { pipelineRef: ancestor.name || ancestor.canonicalObjectId, source: 'PIPELINE-REF-PARENT-PIPE' };
      }

      if (BRANCH_KINDS.includes(kind)) {
        return { pipelineRef: ancestor.name || ancestor.canonicalObjectId, source: 'PIPELINE-REF-PARENT-BRANCH' };
      }

      // Check if ancestor has a pipeline reference attribute
      const ancestorAttrs = ancestor.attributes || {};
      const ancestorRef = findAttrCaseInsensitive(ancestorAttrs, PIPELINE_REF_KEYS);
      if (ancestorRef) {
        return { pipelineRef: ancestorRef, source: 'PIPELINE-REF-PARENT-NAME' };
      }
    }

    // Priority 4: selected root
    if (this._selectedRootIds.length === 1) {
      const rootId = this._selectedRootIds[0];
      const inChain = ancestorChain.some(a => a.canonicalObjectId === rootId)
        || (node.canonicalObjectId === rootId);
      if (inChain) {
        const rootNode = this._nodeById.get(rootId);
        if (rootNode) {
          return { pipelineRef: rootNode.name || rootId, source: 'PIPELINE-REF-SELECTED-ROOT' };
        }
      }
    }

    // Priority 5: fallback
    return { pipelineRef: 'RVM-EXTRACT', source: 'PIPELINE-REF-FALLBACK' };
  }
}
