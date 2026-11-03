import { AvevaJsonLoader } from './AvevaJsonLoader.js';
import { state } from '../core/state.js';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-inputxml-auto-connect-override-v1');
const INPUTXML_RX = /INPUTXML/i;

function textHasInputXml(value) {
  return typeof value === 'string' && INPUTXML_RX.test(value);
}

function hasInputXmlMarker(value, seen = new WeakSet()) {
  if (value == null) return false;
  if (textHasInputXml(value)) return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => hasInputXmlMarker(item, seen));
  }

  for (const [key, child] of Object.entries(value)) {
    if (textHasInputXml(key) || textHasInputXml(child)) return true;
    if (child && typeof child === 'object' && hasInputXmlMarker(child, seen)) return true;
  }
  return false;
}

function upper(value) {
  return String(value || '').trim().toUpperCase();
}

function isBranchNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const attrs = node.attributes && typeof node.attributes === 'object' ? node.attributes : {};
  const type = upper(node.type || node.kind || attrs.TYPE || attrs.RAW_TYPE);
  return type === 'BRANCH' || type === 'BRAN' || (Array.isArray(node.children) && node.children.length > 0);
}

function markInputXmlRoutePreserve(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);

  let marked = 0;
  if (Array.isArray(value)) {
    for (const item of value) marked += markInputXmlRoutePreserve(item, seen);
    return marked;
  }

  if (isBranchNode(value)) {
    const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : (value.attributes = {});
    if (attrs.SOURCE_FORMAT && upper(attrs.SOURCE_FORMAT) !== 'REV_XML') {
      attrs.SOURCE_FORMAT_ORIGINAL = attrs.SOURCE_FORMAT;
    }
    // AvevaJsonLoader already treats REV_XML branches as explicit route-bearing
    // data and skips synthetic fitting-to-fitting pipes. Reuse that proven gate
    // for InputXML-derived staged JSON/UXML sources.
    attrs.SOURCE_FORMAT = 'REV_XML';
    attrs.AUTO_CONNECT_FITTINGS = 'OFF';
    attrs.AUTO_CONNECT_FITTINGS_REASON = 'INPUTXML_SOURCE_DETECTED';
    attrs.INPUTXML_ROUTE_PRESERVE = 'true';
    marked += 1;
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') marked += markInputXmlRoutePreserve(child, seen);
  }
  return marked;
}

export function installAvevaJsonAutoConnectOverride() {
  const proto = AvevaJsonLoader?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  const originalLoad = proto.load;
  if (typeof originalLoad !== 'function') return;

  proto.load = async function inputXmlAutoConnectOverrideLoad(jsonData, ctx = {}, asyncSession) {
    const inputXmlDetected = hasInputXmlMarker(jsonData);
    const markedBranches = inputXmlDetected ? markInputXmlRoutePreserve(jsonData) : 0;

    state.rvm.routing = {
      ...(state.rvm.routing || {}),
      autoConnectFittings: !inputXmlDetected,
      autoConnectFittingsMode: inputXmlDetected ? 'OFF_INPUTXML_AUTO' : 'ON_DEFAULT',
      autoConnectFittingsMarkedBranches: markedBranches,
    };

    if (ctx && typeof ctx === 'object') {
      ctx.autoConnectFittings = !inputXmlDetected;
      ctx.autoConnectFittingsMode = state.rvm.routing.autoConnectFittingsMode;
      ctx.autoConnectFittingsMarkedBranches = markedBranches;
    }

    const payload = await originalLoad.call(this, jsonData, ctx, asyncSession);
    if (payload?.manifest) {
      payload.manifest.routing = {
        ...(payload.manifest.routing || {}),
        autoConnectFittings: !inputXmlDetected,
        autoConnectFittingsMode: state.rvm.routing.autoConnectFittingsMode,
        autoConnectFittingsMarkedBranches: markedBranches,
      };
    }
    return payload;
  };

  Object.defineProperty(proto, PATCH_FLAG, {
    value: true,
    configurable: true,
  });
}

installAvevaJsonAutoConnectOverride();
