import { enrichHierarchyWithMapperKinds } from '../../../converters/xml-cii2019-core/support-mapping.js';
import { baseNameWithoutExtension } from '../core/output-utils.js';

function _toText(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

function _toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

function _esc(value) {
  return _toText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function _parseNumericMm(value) {
  const text = _toText(value).replace(/mm/gi, ' ').trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function _normalizePoint(point) {
  if (point === undefined || point === null || point === '') return null;
  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X);
    const y = Number(point.y ?? point.Y);
    const z = Number(point.z ?? point.Z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
  }
  const text = _toText(point).trim();
  if (!text) return null;
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function _formatDecimal(value, decimals) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  const text = numeric.toFixed(decimals);
  return text.replace(/\.?0+$/, '') || '0';
}

function _formatPosition(point) {
  return `${_formatDecimal(point.x, 2)} ${_formatDecimal(point.y, 2)} ${_formatDecimal(point.z, 2)}`;
}

const RMSS_BORE_FIELDS = Object.freeze(['HBOR', 'TBOR', 'ABORE', 'LBORE', 'DTXR']);

function _resolveBoreMm(attributes, fallback) {
  for (const field of RMSS_BORE_FIELDS) {
    const parsed = _parseNumericMm(attributes?.[field]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function _buildXmlNodeBlock(lines, node) {
  lines.push('      <Node>');
  lines.push(`        <NodeNumber>${node.nodeNumber}</NodeNumber>`);
  lines.push(`        <NodeName>${_esc(node.nodeName)}</NodeName>`);
  lines.push(`        <Endpoint>${node.endpoint}</Endpoint>`);
  if (node.rigid !== null) {
    lines.push(`        <Rigid>${node.rigid}</Rigid>`);
  }
  lines.push(`        <ComponentType>${_esc(node.componentType)}</ComponentType>`);
  lines.push(`        <Weight>${_formatDecimal(node.weight ?? 0, 3)}</Weight>`);
  lines.push(`        <ComponentRefNo>${_esc(node.componentRefNo)}</ComponentRefNo>`);
  lines.push(`        <ConnectionType>${_esc(node.connectionType)}</ConnectionType>`);
  lines.push(`        <OutsideDiameter>${_formatDecimal(node.outsideDiameter, 3)}</OutsideDiameter>`);
  lines.push(`        <WallThickness>${_formatDecimal(node.wallThickness, 3)}</WallThickness>`);
  lines.push(`        <CorrosionAllowance>${_formatDecimal(node.corrosionAllowance, 3)}</CorrosionAllowance>`);
  lines.push(`        <InsulationThickness>${_formatDecimal(node.insulationThickness, 3)}</InsulationThickness>`);
  lines.push(`        <Position>${_formatPosition(node.position)}</Position>`);
  lines.push(`        <BendRadius>${_formatDecimal(node.bendRadius ?? 0, 3)}</BendRadius>`);
  if (node.bendType !== undefined && node.bendType !== null && node.bendType !== '') {
    lines.push(`        <BendType>${node.bendType}</BendType>`);
  }
  lines.push(`        <SIF>${node.sif}</SIF>`);
  lines.push('      </Node>');
}

function _emptySupportMapperStats() {
  return { scanned: 0, mapped: 0 };
}

function _supportKindForOutput(attrs) {
  return _toText(attrs?.SUPPORT_TYPE || attrs?.SUPPORT_KIND || '').trim().toUpperCase();
}

const RMSS_XML_TYPE_PATTERNS = Object.freeze([
  [/WELDOLET|SOCKOLET|THREDOLET|SWEEPOLET|\bOLET\b/i, 'OLET'],
  [/\bVALV(E)?\b/i, 'VALV'],
  [/\bFLAN(GE)?\b/i, 'FLAN'],
  [/\bGASK(ET)?\b/i, 'GASK'],
  [/\b(ELBO(W)?|BEND)\b/i, 'ELBO'],
  [/\bTEE\b/i, 'TEE'],
  [/\bREDU(CER)?\b/i, 'REDU'],
  [/\b(ATTA|ANCI|SUPP|SUPPORT)\b/i, 'ATTA'],
  [/\b(PIPE|TUBI)\b/i, 'PIPE'],
]);
const RMSS_XML_ENDPOINT_TYPES = new Set(['PIPE', 'VALV', 'FLAN', 'GASK', 'REDU', 'TEE', 'OLET', 'ELBO', 'ATTA']);

function _firstAttr(attrs, keys) {
  for (const key of keys) {
    const value = attrs?.[key];
    if (value !== undefined && value !== null && _toText(value).trim() !== '') return value;
  }
  return '';
}

function _xmlComponentTypeForChild(child) {
  const attrs = child?.attributes || {};
  const source = [child?.type, child?.kind, child?.name, attrs.TYPE, attrs.RAW_TYPE, attrs.STYP, attrs.SPRE, attrs.PTYPE, attrs.GTYPE, attrs.CATL, attrs.DETAIL]
    .map(_toText)
    .join(' ');
  for (const [pattern, type] of RMSS_XML_TYPE_PATTERNS) {
    if (pattern.test(source)) return type;
  }
  const fallback = _toText(child?.type || attrs.TYPE || '').toUpperCase();
  return fallback || 'UNKNOWN';
}

function _pointFromAttrs(child, attrs, keys) {
  for (const key of keys) {
    const point = _normalizePoint(attrs?.[key] ?? child?.[key]);
    if (point) return point;
  }
  return null;
}

function _xmlPointsForChild(child) {
  const attrs = child?.attributes || {};
  return {
    apos: _pointFromAttrs(child, attrs, ['APOS', 'A_POS', 'EP1', 'END1', 'START', 'START_POINT', 'POS_START', 'POSSTART']),
    lpos: _pointFromAttrs(child, attrs, ['LPOS', 'L_POS', 'EP2', 'END2', 'END', 'END_POINT', 'POS_END', 'POSEND']),
    pos: _pointFromAttrs(child, attrs, ['POS', 'POSITION', 'COORDS', 'CO_ORDS', 'CO_ORD', 'POSS']),
    cpos: _pointFromAttrs(child, attrs, ['CPOS', 'CP', 'CENTER', 'CENTRE', 'CENTER_POINT', 'CENTRE_POINT']),
    bpos: _pointFromAttrs(child, attrs, ['BPOS', 'BP', 'BRANCH_POINT', 'BRANCH1_POINT', 'BPOS1', 'TEE_POINT']),
  };
}

function _pointDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function _bendRadiusForChild(child, points) {
  const attrs = child?.attributes || {};
  const explicit = _parseNumericMm(_firstAttr(attrs, ['BENDRADIUS', 'BEND_RADIUS', 'BRAD', 'RADI', 'RADIUS']));
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const center = points.cpos || points.pos;
  if (center && points.apos && points.lpos) return Math.min(_pointDistance(center, points.apos), _pointDistance(center, points.lpos));
  return 0;
}

function _xmlNodeBaseForChild(child, type, componentRefNo, defaults) {
  const attrs = child?.attributes || {};
  const nodeName = _toText(_firstAttr(attrs, ['NAME', 'TAG', 'TAGNO', 'ITEMCODE', 'PARTNO']) || child?.name || type).trim() || type;
  return {
    nodeName,
    rigid: null,
    componentType: type,
    componentRefNo: _toText(_firstAttr(attrs, ['REF', 'REFNO', 'COMPONENTREFNO', 'DBREF', 'CA97', 'CA98']) || child?.ref || child?.id || componentRefNo) || componentRefNo,
    connectionType: _toText(_firstAttr(attrs, ['CONNECTIONTYPE', 'CONN', 'CONNECTION', 'CTYP']) || 'BW'),
    outsideDiameter: _resolveBoreMm(attrs, defaults.defaultDiameter),
    wallThickness: Math.max(0, _parseNumericMm(_firstAttr(attrs, ['WTHK', 'WALLTHK', 'WALL_THICKNESS'])) ?? defaults.defaultWallThickness),
    corrosionAllowance: Math.max(0, _parseNumericMm(_firstAttr(attrs, ['CORA', 'CORROSIONALLOWANCE'])) ?? defaults.defaultCorrosionAllowance),
    insulationThickness: Math.max(0, _parseNumericMm(_firstAttr(attrs, ['INSU', 'INSULATIONTHICKNESS'])) ?? defaults.defaultInsulationThickness),
    weight: _toFiniteNumber(attrs.WEIG ?? attrs.WEIGHT, 0),
    bendRadius: 0,
    sif: _toFiniteNumber(attrs.SIF, 0),
  };
}

function _expandRmssChildToPsiXmlNodes(child, componentRefNo, defaults) {
  const attrs = child?.attributes || {};
  const type = _xmlComponentTypeForChild(child);
  if (!RMSS_XML_ENDPOINT_TYPES.has(type)) return [];
  const points = _xmlPointsForChild(child);
  const basePoint = points.pos || points.cpos || points.apos || points.lpos || points.bpos;
  if (!basePoint) return [];
  const base = _xmlNodeBaseForChild(child, type, componentRefNo, defaults);
  const nodes = [];
  const push = (endpoint, position, extra = {}) => {
    if (!position) return;
    nodes.push({ ...base, endpoint, position, ...extra });
  };

  if (type === 'ELBO') {
    const bendRadius = _bendRadiusForChild(child, points);
    push(1, points.apos || basePoint, { bendRadius, bendType: 0 });
    push(0, points.cpos || points.pos || basePoint, { nodeName: '', bendRadius, bendType: 1 });
    push(2, points.lpos || basePoint, { bendRadius, bendType: 0 });
    return nodes;
  }

  if (type === 'TEE') {
    const center = points.pos || points.cpos || basePoint;
    push(1, points.apos || center);
    push(3, points.bpos || center);
    push(0, center, { nodeName: '' });
    push(2, points.lpos || center);
    return nodes;
  }

  if (type === 'OLET') {
    const header = points.pos || points.cpos || points.apos || basePoint;
    push(1, points.apos || header);
    push(3, points.bpos || points.lpos || header);
    push(0, header, { nodeName: '' });
    push(2, points.lpos || header);
    return nodes;
  }

  if (type === 'ATTA') {
    const supportKind = _supportKindForOutput(attrs);
    push(0, basePoint, { rigid: 1, connectionType: supportKind, componentType: 'ATTA' });
    return nodes;
  }

  if (points.apos && points.lpos) {
    push(1, points.apos);
    push(2, points.lpos);
    return nodes;
  }

  push(0, basePoint);
  return nodes;
}

export function _buildPsiXmlFromRmssHierarchy(hierarchy, inputName, options) {
  const normalizedHierarchy = Array.isArray(hierarchy) ? hierarchy : [];
  const supportMapperStats = enrichHierarchyWithMapperKinds(normalizedHierarchy);
  const branches = normalizedHierarchy.filter((entry) => entry && Array.isArray(entry.children) && entry.children.length > 0);
  if (!branches.length) {
    throw new Error('ATT/TXT parser returned no branch topology. Cannot generate XML.');
  }

  const source = _toText(options?.source).trim() || 'AVEVA PSI';
  const purpose = _toText(options?.purpose).trim() || 'RMSS attribute conversion';
  const titleLine = _toText(options?.titleLine).trim() || 'RMSS Attribute Output';
  const nodeStart = Math.max(1, Math.trunc(_toFiniteNumber(options?.nodeStart, 10)));
  const nodeStep = Math.max(1, Math.trunc(_toFiniteNumber(options?.nodeStep, 10)));
  const defaultDiameter = Math.max(0.001, _toFiniteNumber(options?.defaultDiameter, 100));
  const defaultWallThickness = Math.max(0, _toFiniteNumber(options?.defaultWallThickness, 0.01));
  const defaultCorrosionAllowance = Math.max(0, _toFiniteNumber(options?.defaultCorrosionAllowance, 0));
  const defaultInsulationThickness = Math.max(0, _toFiniteNumber(options?.defaultInsulationThickness, 0));

  let nodeNumber = nodeStart;
  let componentRefCounter = 1;
  let nodeCount = 0;
  let skippedComponents = 0;
  const lines = [];

  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">');
  lines.push(`  <DateTime>${_esc(new Date().toISOString())}</DateTime>`);
  lines.push(`  <Source>${_esc(source)}</Source>`);
  lines.push('  <Version>0.0.0.0</Version>');
  lines.push('  <UserName>browser-runtime</UserName>');
  lines.push(`  <Purpose>${_esc(purpose)}</Purpose>`);
  lines.push(`  <ProjectName>${_esc(baseNameWithoutExtension(inputName || 'RMSS_ATTRIBUTE'))}</ProjectName>`);
  lines.push(`  <MDBName>/${_esc(baseNameWithoutExtension(inputName || 'RMSS_ATTRIBUTE'))}</MDBName>`);
  lines.push(`  <TitleLine>${_esc(titleLine)}</TitleLine>`);
  lines.push('  <!-- Configuration information -->');
  lines.push('  <RestrainOpenEnds>No</RestrainOpenEnds>');
  lines.push('  <AmbientTemperature>0</AmbientTemperature>');
  lines.push('  <Pipe>');
  lines.push(`    <FullName>/RMSS/${_esc(baseNameWithoutExtension(inputName || 'ATTRIBUTES'))}</FullName>`);
  lines.push('    <Ref>=ATT/PIPE/1</Ref>');

  for (const branch of branches) {
    const branchName = _toText(branch.name).trim() || 'UNSPECIFIED-BRANCH';
    const branchChildren = Array.isArray(branch.children) ? branch.children : [];

    lines.push('    <Branch>');
    lines.push(`      <Branchname>${_esc(branchName)}</Branchname>`);
    lines.push('      <Temperature>');
    for (let idx = 1; idx <= 9; idx += 1) lines.push(`        <Temperature${idx}>0</Temperature${idx}>`);
    lines.push('      </Temperature>');
    lines.push('      <Pressure>');
    for (let idx = 1; idx <= 9; idx += 1) lines.push(`        <Pressure${idx}>0</Pressure${idx}>`);
    lines.push('      </Pressure>');
    lines.push('      <MaterialNumber>0</MaterialNumber>');
    lines.push('      <InsulationDensity>0</InsulationDensity>');
    lines.push('      <FluidDensity>0</FluidDensity>');

    const xmlDefaults = {
      defaultDiameter,
      defaultWallThickness,
      defaultCorrosionAllowance,
      defaultInsulationThickness,
    };

    for (const child of branchChildren) {
      const componentRefNo = `=ATT/${componentRefCounter}`;
      componentRefCounter += 1;
      const expandedNodes = _expandRmssChildToPsiXmlNodes(child, componentRefNo, xmlDefaults);
      if (!expandedNodes.length) {
        skippedComponents += 1;
        continue;
      }
      for (const expandedNode of expandedNodes) {
        _buildXmlNodeBlock(lines, { ...expandedNode, nodeNumber });
        nodeCount += 1;
        nodeNumber += nodeStep;
      }
    }

    lines.push('    </Branch>');
  }

  lines.push('  </Pipe>');
  lines.push('</PipeStressExport>');

  return {
    xmlText: `${lines.join('\n')}\n`,
    branchCount: branches.length,
    nodeCount,
    skippedComponents,
    supportMapperStats,
  };
}

export function _isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function _looksLikeBranchNode(entry) {
  if (!_isObjectRecord(entry)) return false;
  const typeToken = _toText(entry?.type || entry?.attributes?.TYPE || '').toUpperCase();
  const hasBranchType = typeToken === 'BRANCH' || typeToken === 'BRAN';
  const hasChildren = Array.isArray(entry.children);
  return hasBranchType && hasChildren;
}

export function _looksLikeStagedHierarchy(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  let branchCount = 0;
  for (const entry of payload) {
    if (_looksLikeBranchNode(entry)) branchCount += 1;
  }
  return branchCount > 0;
}

export function _normalizeRvmScopePattern(pattern) {
  return _toText(pattern).trim();
}

export function _normalizeRvmScope(scope) {
  if (typeof scope === 'string') {
    const wildcard = _normalizeRvmScopePattern(scope);
    return { wildcard, selectedIds: [], enabled: !!wildcard };
  }
  const wildcard = _normalizeRvmScopePattern(scope?.wildcard ?? scope?.pattern ?? '');
  const selectedIds = Array.isArray(scope?.selectedIds)
    ? scope.selectedIds.map((id) => _toText(id)).filter(Boolean)
    : [];
  return { wildcard, selectedIds, enabled: !!wildcard || selectedIds.length > 0 };
}

export function _rvmScopeRegex(pattern) {
  const normalized = _normalizeRvmScopePattern(pattern);
  if (!normalized) return null;
  const escaped = normalized
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const source = normalized.includes('*') ? `^${escaped}$` : escaped;
  return new RegExp(source, 'i');
}

export function _rvmBranchKey(branch) {
  const attrs = branch?.attributes || {};
  return _toText(branch?.name || attrs.NAME || branch?.id || '').trim();
}

export function _rvmScopeText(value) {
  if (!value || typeof value !== 'object') return _toText(value);
  const attrs = value.attributes || {};
  const parts = [
    value.label,
    value.name,
    value.id,
    value.type,
    value.kind,
    attrs.NAME,
    attrs.OWNER,
    attrs.OWNER_SITE,
    attrs.SITE,
    attrs.ZONE,
    attrs.PIPE,
    attrs.BRANCH,
    attrs.HREF,
    attrs.TREF,
    attrs.CREF,
  ];
  return parts.map((part) => _toText(part)).filter(Boolean).join(' ');
}

export function _matchesRvmScope(value, pattern) {
  const regex = _rvmScopeRegex(pattern);
  if (!regex) return true;
  return regex.test(_rvmScopeText(value));
}

export function _branchScopeIds(branch) {
  const attrs = branch?.attributes || {};
  const ids = new Set();
  const branchKey = _rvmBranchKey(branch);
  if (branchKey) ids.add(`branch:${branchKey}`);
  const site = _toText(attrs.OWNER_SITE || attrs.SITE).trim();
  if (site) ids.add(`site:${site}`);
  const owner = _toText(attrs.OWNER).trim();
  if (owner) {
    ids.add(`owner:${owner}`);
    const parts = owner.split(/[\\/>]+/).map((part) => part.trim()).filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      ids.add(`owner:${acc}`);
    }
  }
  return ids;
}

export function _filterStagedHierarchyByScope(hierarchy, rawScope) {
  const scope = _normalizeRvmScope(rawScope);
  const source = Array.isArray(hierarchy) ? hierarchy : [];
  if (!scope.enabled) {
    return {
      hierarchy: source,
      scope,
      pattern: '',
      stats: { scanned: source.length, matched: source.length, filtered: 0 },
    };
  }

  const selectedIds = new Set(scope.selectedIds);
  const matches = source.filter((branch) => {
    if (selectedIds.size > 0) {
      const ids = _branchScopeIds(branch);
      for (const id of ids) {
        if (selectedIds.has(id)) return true;
      }
    }
    if (scope.wildcard) {
      const match = _matchesRvmScope(branch, scope.wildcard);
      if (match) return true;
    }
    return false;
  });

  return {
    hierarchy: matches,
    scope,
    pattern: scope.wildcard || [...selectedIds].join(', '),
    stats: {
      scanned: source.length,
      matched: matches.length,
      filtered: source.length - matches.length,
    },
  };
}
