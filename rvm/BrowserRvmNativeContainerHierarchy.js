export const BROWSER_RVM_NATIVE_CONTAINER_HIERARCHY_SCHEMA = 'browser-rvm-native-container-hierarchy/v1';

const MAX_RVM_RECORDS = 50000;
const CONTAINER_NAME_MAX_SCAN_BYTES = 8192;

export function buildNativeRvmContainerHierarchy(patchedHierarchy = [], arrayBuffer, options = {}) {
  if (!(arrayBuffer instanceof ArrayBuffer)) return emptyResult('missing-array-buffer');
  const view = new DataView(arrayBuffer);
  const firstOffset = findFirstWideTag(view, ['HEAD', 'MODL', 'CNTB', 'PRIM']);
  if (firstOffset < 0) return emptyResult('missing-rvm-tags');

  const leafByOffset = collectPrimitiveLeaves(patchedHierarchy);
  if (!leafByOffset.size) return emptyResult('missing-primitive-leaves');

  const sourceRoot = Array.isArray(patchedHierarchy) ? patchedHierarchy[0] : null;
  const root = makeRootNode(sourceRoot, options);
  const stack = [root];
  const seenOffsets = new Set();
  const usedPrimitiveOffsets = new Set();
  let offset = firstOffset;
  let recordCount = 0;
  let containerCount = 0;
  let primitiveCount = 0;
  let recoveredNameCount = 0;
  const tagCounts = {};

  while (offset >= 0 && offset + 32 <= view.byteLength && recordCount < MAX_RVM_RECORDS) {
    if (seenOffsets.has(offset)) break;
    seenOffsets.add(offset);
    const tag = readWideTag(view, offset);
    if (!isRvmRecordTag(tag)) break;

    const nextOffset = view.getUint32(offset + 16, false);
    const code = view.getUint32(offset + 28, false);
    if (!Number.isFinite(nextOffset) || nextOffset <= offset || nextOffset > view.byteLength + 32) break;

    const safeEnd = Math.min(nextOffset, view.byteLength);
    recordCount += 1;
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;

    if (tag === 'CNTB' || tag === 'MODL') {
      const recordStrings = scanPrintableStringsInRange(new Uint8Array(arrayBuffer), offset + 32, Math.min(safeEnd, offset + 32 + CONTAINER_NAME_MAX_SCAN_BYTES));
      const name = bestContainerName(recordStrings) || `${tag}@${offset}`;
      if (name !== `${tag}@${offset}`) recoveredNameCount += 1;
      if (tag === 'CNTB') {
        const branch = makeContainerNode(name, stack, offset, code);
        top(stack).children.push(branch);
        stack.push(branch);
        containerCount += 1;
      } else if (name && root.name === root.attributes.SOURCE_FILE_BASENAME) {
        root.name = name;
        root.attributes.NAME = name;
      }
    } else if (tag === 'PRIM') {
      const leaf = clonePrimitiveLeaf(leafByOffset.get(offset), stack, offset, code);
      if (leaf) {
        top(stack).children.push(leaf);
        usedPrimitiveOffsets.add(offset);
        primitiveCount += 1;
      }
    } else if (tag === 'CNTE') {
      if (stack.length > 1) stack.pop();
    } else if (tag === 'END:') {
      break;
    }

    offset = nextOffset;
  }

  const unmatchedLeaves = [];
  for (const [leafOffset, leaf] of leafByOffset.entries()) {
    if (!usedPrimitiveOffsets.has(leafOffset)) unmatchedLeaves.push(clonePrimitiveLeaf(leaf, [root], leafOffset, Number(leaf?.attributes?.RVM_PRIMITIVE_CODE || 0)));
  }
  if (unmatchedLeaves.length) {
    const unmatchedNode = makeContainerNode('Unmatched PRIM records', [root], -1, 0);
    unmatchedNode.attributes.RVM_BROWSER_BRANCH_KIND = 'UNMATCHED_PRIMITIVES';
    unmatchedNode.children.push(...unmatchedLeaves.filter(Boolean));
    root.children.push(unmatchedNode);
  }

  assignRecursiveBounds(root);
  root.attributes.BROWSER_RVM_NATIVE_CONTAINER_HIERARCHY_SCHEMA = BROWSER_RVM_NATIVE_CONTAINER_HIERARCHY_SCHEMA;
  root.attributes.BROWSER_RVM_NATIVE_CONTAINER_COUNT = String(containerCount);
  root.attributes.BROWSER_RVM_NATIVE_PRIMITIVE_COUNT = String(primitiveCount);
  root.attributes.BROWSER_RVM_NATIVE_UNMATCHED_PRIMITIVE_COUNT = String(unmatchedLeaves.length);

  const applied = primitiveCount > 0 && containerCount > 0;
  return {
    applied,
    hierarchy: applied ? [root] : [],
    diagnostics: {
      schemaVersion: BROWSER_RVM_NATIVE_CONTAINER_HIERARCHY_SCHEMA,
      applied,
      reason: applied ? 'native-cntb-cnte-hierarchy' : 'no-native-container-tree-built',
      recordCount,
      containerCount,
      primitiveCount,
      recoveredNameCount,
      unmatchedPrimitiveCount: unmatchedLeaves.length,
      tagCounts,
    },
  };
}

function emptyResult(reason) {
  return {
    applied: false,
    hierarchy: [],
    diagnostics: {
      schemaVersion: BROWSER_RVM_NATIVE_CONTAINER_HIERARCHY_SCHEMA,
      applied: false,
      reason,
      recordCount: 0,
      containerCount: 0,
      primitiveCount: 0,
      recoveredNameCount: 0,
      unmatchedPrimitiveCount: 0,
      tagCounts: {},
    },
  };
}

function collectPrimitiveLeaves(roots = []) {
  const out = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const attrs = node.attributes || {};
    const offset = Number.parseInt(String(attrs.RVM_BYTE_OFFSET ?? ''), 10);
    const isPrim = attrs.RVM_RECORD_TAG === 'PRIM' || attrs.RVM_PRIMITIVE_CODE !== undefined;
    if (isPrim && Number.isFinite(offset) && offset >= 0) out.set(offset, node);
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child);
  };
  for (const root of Array.isArray(roots) ? roots : [roots]) walk(root);
  return out;
}

function makeRootNode(sourceRoot, options = {}) {
  const fileName = String(options.fileName || sourceRoot?.attributes?.SOURCE_FILE || sourceRoot?.name || 'RVM Native Hierarchy');
  const rootName = stripExtension(fileName) || 'RVM Native Hierarchy';
  return {
    name: rootName,
    type: 'BRANCH',
    bbox: Array.isArray(sourceRoot?.bbox) ? sourceRoot.bbox : undefined,
    attributes: {
      ...(sourceRoot?.attributes || {}),
      TYPE: 'BRANCH',
      NAME: rootName,
      SOURCE_FILE_BASENAME: rootName,
      SOURCE_FORMAT: 'RVM_BINARY_NATIVE_CONTAINER_HIERARCHY',
      BROWSER_RVM_HIERARCHY_GROUPED: 'true',
      BROWSER_RVM_HIERARCHY_SCHEMA: BROWSER_RVM_NATIVE_CONTAINER_HIERARCHY_SCHEMA,
      RVM_BROWSER_BRANCH_KIND: 'MODEL_GROUP',
      RVM_BROWSER_BRANCH_DEPTH: '0',
      RVM_BROWSER_BRANCH_PATH: rootName,
      RVM_CANONICAL_PATH: rootName,
    },
    children: [],
  };
}

function makeContainerNode(name, stack, offset, code) {
  const parentPath = stackPath(stack);
  const path = parentPath ? `${parentPath} / ${name}` : name;
  const depth = Math.max(stack.length - 1, 0);
  return {
    name,
    type: 'BRANCH',
    attributes: {
      TYPE: 'BRANCH',
      NAME: name,
      SOURCE_FORMAT: 'RVM_BINARY_NATIVE_CONTAINER_HIERARCHY',
      RVM_RECORD_TAG: offset >= 0 ? 'CNTB' : 'SYNTHETIC',
      RVM_BYTE_OFFSET: offset >= 0 ? String(offset) : '',
      RVM_PRIMITIVE_CODE: code ? String(code) : '',
      RVM_BROWSER_BRANCH_KIND: classifyBranchSegment(name, depth),
      RVM_BROWSER_BRANCH_DEPTH: String(depth + 1),
      RVM_BROWSER_BRANCH_PATH: path,
      RVM_CANONICAL_PATH: `${path}@${offset}`,
    },
    children: [],
  };
}

function clonePrimitiveLeaf(sourceLeaf, stack, offset, code) {
  const parent = top(stack);
  const ownerPath = stackPath(stack);
  const ownerName = parent?.name || ownerPath || 'RVM Objects';
  const name = String(sourceLeaf?.name || sourceLeaf?.attributes?.NAME || `PRIM ${code || ''}@${offset}`).trim();
  const ownerSemantic = semanticFromName(`${ownerPath} ${ownerName} ${name}`);
  const attrs = {
    ...(sourceLeaf?.attributes || {}),
    TYPE: ownerSemantic?.type || sourceLeaf?.attributes?.TYPE || sourceLeaf?.type || classifyPrimCode(code),
    NAME: name,
    SOURCE_FORMAT: 'RVM_BINARY_NATIVE_CONTAINER_HIERARCHY',
    RVM_RECORD_TAG: 'PRIM',
    RVM_BYTE_OFFSET: String(offset),
    RVM_PRIMITIVE_CODE: String(code || sourceLeaf?.attributes?.RVM_PRIMITIVE_CODE || ''),
    RVM_OWNER_NAME: ownerName,
    RVM_OWNER_PATH: ownerPath,
    RVM_OWNER_DEPTH: String(Math.max(stack.length - 1, 0)),
    RVM_NATIVE_CONTAINER_PARENT: parent?.attributes?.RVM_CANONICAL_PATH || '',
    RVM_CANONICAL_PATH: `${ownerPath ? `${ownerPath} / ` : ''}${name}@${offset}`,
  };
  if (ownerSemantic) {
    attrs.RVM_PRIMITIVE_KIND = ownerSemantic.kind;
    attrs.RVM_BROWSER_PRIMITIVE_CLASS = ownerSemantic.primitiveClass;
    attrs.RVM_BROWSER_PRIMITIVE_SEMANTIC_SOURCE = 'native-container-path';
  }
  return {
    ...(sourceLeaf || {}),
    name,
    type: attrs.TYPE,
    bbox: Array.isArray(sourceLeaf?.bbox) ? sourceLeaf.bbox : undefined,
    attributes: attrs,
    children: Array.isArray(sourceLeaf?.children) ? sourceLeaf.children : [],
  };
}

function assignRecursiveBounds(node) {
  if (!node || typeof node !== 'object') return null;
  let bounds = normalizeBbox(node.bbox);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const childBounds = assignRecursiveBounds(child);
    bounds = unionBounds(bounds, childBounds);
  }
  if (bounds) {
    node.bbox = bounds;
    node.attributes = { ...(node.attributes || {}), RVM_BROWSER_BBOX: JSON.stringify(bounds.map((value) => Number(fixed(value)))) };
  }
  return bounds;
}

function readWideTag(view, offset) {
  if (!view || offset < 0 || offset + 16 > view.byteLength) return null;
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    const value = view.getUint32(offset + i * 4, false);
    if (value < 32 || value > 126) return null;
    out += String.fromCharCode(value);
  }
  return out;
}

function isRvmRecordTag(tag) {
  return tag === 'HEAD' || tag === 'MODL' || tag === 'CNTB' || tag === 'CNTE' || tag === 'PRIM' || tag === 'END:';
}

function findFirstWideTag(view, tags) {
  const maxScan = Math.min(view.byteLength - 16, 64 * 1024);
  for (let offset = 0; offset <= maxScan; offset += 4) {
    const tag = readWideTag(view, offset);
    if (tags.includes(tag)) return offset;
  }
  return -1;
}

function scanPrintableStringsInRange(bytes, start, end) {
  const strings = [];
  let chars = [];
  let stringStart = -1;
  const flush = (at) => {
    if (chars.length >= 2) {
      const text = chars.join('').replace(/\s+/g, ' ').trim();
      if (text.length >= 2) strings.push({ offset: stringStart, endOffset: at, text });
    }
    chars = [];
    stringStart = -1;
  };
  for (let i = Math.max(0, start); i < Math.min(bytes.length, end); i += 1) {
    const b = bytes[i];
    const printable = (b >= 32 && b <= 126) || b === 9;
    if (printable) {
      if (stringStart < 0) stringStart = i;
      chars.push(String.fromCharCode(b));
    } else {
      flush(i);
    }
  }
  flush(end);
  return strings;
}

function bestContainerName(recordStrings = []) {
  for (const entry of recordStrings) {
    const text = String(entry.text || '').replace(/\s+/g, ' ').trim();
    if (isLikelyContainerName(text)) return text;
  }
  return '';
}

function isLikelyContainerName(text) {
  if (!text || text.length < 2 || text.length > 240) return false;
  if (/^(HEAD|MODL|CNTB|CNTE|PRIM|END:)$/i.test(text)) return false;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return false;
  if (!/^\/?[A-Za-z0-9][A-Za-z0-9_/"'.:() -]*$/.test(text)) return false;
  if (/^\//.test(text)) return true;
  return /\b(BRANCH|PIPE|CYLI|FLANGE|FLAN|ELBOW|BEND|VALVE|VALV|TEE|GASK|SUPPORT|PS-|BTRM|ASIM|P\d{4,})\b/i.test(text);
}

function classifyBranchSegment(segment, depth) {
  const upper = String(segment || '').toUpperCase();
  if (/^ZONE\b|^\//.test(upper)) return 'ZONE';
  if (/^PIPE\b/.test(upper)) return 'PIPE_GROUP';
  if (/^BRANCH\b/.test(upper)) return 'BRANCH_GROUP';
  if (/^EQUIPMENT\b|^SUBEQUIPMENT\b/.test(upper)) return 'EQUIPMENT_GROUP';
  if (/^STRUCTURE\b|^FRAME\b|^STEEL\b|^PLATFORM\b/.test(upper)) return 'STRUCTURE_GROUP';
  if (/^GASKET\b|^FLANGE\b|^VALVE\b|^ELBOW\b|^TEE\b|^RTORUS\b|^TORUS\b|^INSTRUMENT\b|^REDUCER\b|^CONE\b|^NOZZLE\b|^CAP\b|^STRAINER\b|^SUPPORT\b|^\/PS-/.test(upper)) return 'COMPONENT_GROUP';
  return depth === 0 ? 'MODEL_GROUP' : 'RVM_GROUP';
}

function semanticFromName(value) {
  const upper = String(value || '').toUpperCase();
  if (/\bRTORUS\b|\bTORUS\b/.test(upper)) return { type: 'GASK', kind: 'TORUS', primitiveClass: 'TORUS' };
  if (/\bGASKET\b|\bGASK\b/.test(upper)) return { type: 'GASK', kind: 'GASKET', primitiveClass: 'GASKET' };
  if (/\bFLANGE\b|\bFLAN\b/.test(upper)) return { type: 'FLANGE', kind: 'FLANGE', primitiveClass: 'FLANGE' };
  if (/\bVALVE\b|\bVALV\b/.test(upper)) return { type: 'VALVE', kind: 'VALVE', primitiveClass: 'VALVE' };
  if (/\bELBOW\b|\bBEND\b/.test(upper)) return { type: 'ELBOW', kind: 'ELBOW', primitiveClass: 'ELBOW' };
  if (/\bTEE\b/.test(upper)) return { type: 'TEE', kind: 'TEE', primitiveClass: 'TEE' };
  if (/\bREDUCER\b|\bCONE\b|\bCONI\b|\bFRUSTUM\b/.test(upper)) return { type: 'REDUCER', kind: 'CONE', primitiveClass: 'CONE' };
  if (/\bNOZZLE\b|\bNOZZ\b/.test(upper)) return { type: 'NOZZLE', kind: 'NOZZLE', primitiveClass: 'NOZZLE' };
  if (/\bCAP\b|\bCLOSURE\b/.test(upper)) return { type: 'CAP', kind: 'CAP', primitiveClass: 'CAP' };
  if (/\bSTRAINER\b|\bFILTER\b/.test(upper)) return { type: 'STRAINER', kind: 'STRAINER', primitiveClass: 'STRAINER' };
  if (/\bINSTRUMENT\b|\bINST\b/.test(upper)) return { type: 'INSTRUMENT', kind: 'INSTRUMENT', primitiveClass: 'INSTRUMENT' };
  if (/\bSUPPORT\b|\bSUPP\b|\bANCHOR\b|\bGUIDE\b|\/PS-/.test(upper)) return { type: 'SUPPORT', kind: 'SUPPORT', primitiveClass: 'SUPPORT' };
  if (/\bPIPE\b|\bCYLI\b|\bTUBE\b/.test(upper)) return { type: 'PIPE', kind: 'CYLINDER', primitiveClass: 'CYLINDER' };
  if (/\bBOX\b|\bEQUIPMENT\b|\bSUBEQUIPMENT\b|\bOBST\b/.test(upper)) return { type: 'BOX', kind: 'BOX', primitiveClass: 'BOX' };
  if (/\bSTRUCTURE\b|\bFRAME\b|\bSTEEL\b|\bPLATFORM\b|\bSTAIR\b|\bLADDER\b/.test(upper)) return { type: 'STRUCTURE', kind: 'STRUCTURE', primitiveClass: 'STRUCTURE' };
  return null;
}

function classifyPrimCode(code) {
  if (code === 2) return 'BOX';
  if (code === 4) return 'ELBOW';
  if (code === 7) return 'FLANGE';
  if (code === 8) return 'PIPE';
  if (code === 11) return 'INSTRUMENT';
  return 'UNKNOWN';
}

function stackPath(stack = []) {
  return stack.slice(1).map((node) => node?.name).filter(Boolean).join(' / ');
}

function top(stack) {
  return stack[stack.length - 1];
}

function stripExtension(value) {
  return String(value || '').replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
}

function normalizeBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 6) return null;
  const nums = bbox.map(Number);
  if (nums.some((value) => !Number.isFinite(value))) return null;
  return [
    Math.min(nums[0], nums[3]), Math.min(nums[1], nums[4]), Math.min(nums[2], nums[5]),
    Math.max(nums[0], nums[3]), Math.max(nums[1], nums[4]), Math.max(nums[2], nums[5]),
  ];
}

function unionBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]),
    Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5]),
  ];
}

function fixed(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(6) : '0.000000';
}
