// Minimal HTML DOM shim shared by standalone UI-adapted tests that render real innerHTML
// templates and then query them back out (id / class / attribute selectors only — the actual
// surface area production code in tabs/xml-cii-2019-standalone/ui-adapted/*.js uses).
'use strict';

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'col', 'area', 'base', 'embed', 'track', 'wbr']);

function decodeEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

class ClassList {
  constructor(el) { this.el = el; }
  _set() {
    const classes = String(this.el.attributes.class || '').split(/\s+/).filter(Boolean);
    return new Set(classes);
  }
  _write(set) { this.el.attributes.class = Array.from(set).join(' '); this.el.className = this.el.attributes.class; }
  add(...names) { const s = this._set(); for (const n of names) s.add(n); this._write(s); }
  remove(...names) { const s = this._set(); for (const n of names) s.delete(n); this._write(s); }
  toggle(name, force) {
    const s = this._set();
    const has = s.has(name);
    const next = force === undefined ? !has : !!force;
    if (next) s.add(name); else s.delete(name);
    this._write(s);
    return next;
  }
  contains(name) { return this._set().has(name); }
}

function datasetProxy(el) {
  const toCamel = (kebab) => kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const toKebab = (camel) => camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return new Proxy({}, {
    get(_, prop) { return el.attributes[`data-${toKebab(String(prop))}`]; },
    set(_, prop, value) { el.attributes[`data-${toKebab(String(prop))}`] = String(value); return true; },
    ownKeys() { return Object.keys(el.attributes).filter((k) => k.startsWith('data-')).map((k) => toCamel(k.slice(5))); },
    has(_, prop) { return `data-${toKebab(String(prop))}` in el.attributes; },
    getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; },
  });
}

class MiniElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this._listeners = {};
    this._text = '';
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.className = '';
    this.classList = new ClassList(this);
    this.dataset = datasetProxy(this);
  }

  get children() { return this.childNodes.filter((n) => n.nodeType !== 'text'); }
  get id() { return this.attributes.id || ''; }
  set id(value) { this.attributes.id = String(value); }
  get type() { return this.attributes.type || ''; }
  set type(value) { this.attributes.type = String(value); }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = this.attributes[name];
    if (name === 'value') this.value = this.attributes[name];
    if (name === 'checked') this.checked = true;
  }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }

  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  append(...items) { for (const item of items) this.appendChild(typeof item === 'string' ? textNode(item) : item); }
  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.childNodes.indexOf(this);
    if (idx >= 0) this.parentNode.childNodes.splice(idx, 1);
    this.parentNode = null;
  }

  addEventListener(type, handler) { (this._listeners[type] = this._listeners[type] || []).push(handler); }
  removeEventListener(type, handler) { this._listeners[type] = (this._listeners[type] || []).filter((h) => h !== handler); }
  dispatch(type) { for (const h of this._listeners[type] || []) h({ target: this }); }
  click() { this.dispatch('click'); }

  get textContent() {
    if (this.childNodes.length) return this.childNodes.map((n) => n.nodeType === 'text' ? n._text : n.textContent).join('');
    return this._text;
  }
  set textContent(value) { this.childNodes = []; this._text = String(value ?? ''); }

  get innerHTML() { return this.childNodes.map(serializeNode).join(''); }
  set innerHTML(html) {
    const frag = parseHtmlFragment(String(html ?? ''));
    this.childNodes = frag;
    for (const child of frag) child.parentNode = this;
  }

  querySelectorAll(selector) { return queryAll(this, selector); }
  querySelector(selector) { return queryAll(this, selector)[0] || null; }
}

function textNode(text) { return { nodeType: 'text', _text: String(text ?? '') }; }

function matchesSimpleSelector(el, selector) {
  const sel = selector.trim();
  if (sel.startsWith('#')) return el.attributes.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  const attrMatch = sel.match(/^\[([\w-]+)(?:=("([^"]*)"|'([^']*)'|([^\]]*)))?\]$/);
  if (attrMatch) {
    const name = attrMatch[1];
    if (attrMatch[2] === undefined) return name in el.attributes;
    const expected = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5];
    return el.attributes[name] === expected;
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function walkElements(root, out) {
  for (const node of root.childNodes || []) {
    if (node.nodeType === 'text') continue;
    out.push(node);
    walkElements(node, out);
  }
  return out;
}

function queryAll(root, selector) {
  const all = walkElements(root, []);
  return all.filter((el) => matchesSimpleSelector(el, selector));
}

function serializeNode(node) {
  if (node.nodeType === 'text') return escapeText(node._text);
  const attrs = Object.entries(node.attributes).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  const tag = node.tagName.toLowerCase();
  if (VOID_TAGS.has(tag) && !node.childNodes.length) return `<${tag}${attrs}/>`;
  return `<${tag}${attrs}>${node.childNodes.map(serializeNode).join('')}</${tag}>`;
}

function parseHtmlFragment(html) {
  const stack = [{ childNodes: [] }];
  const tagPattern = /<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
  let match;
  while ((match = tagPattern.exec(html))) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    if (!token.startsWith('<')) {
      const decoded = decodeEntities(token);
      if (decoded.trim() || decoded.includes(' ')) stack[stack.length - 1].childNodes.push(textNode(decoded));
      continue;
    }
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const selfClosing = /\/\s*>$/.test(token);
    const body = token.slice(1, selfClosing ? -2 : -1).trim();
    const nameMatch = body.match(/^([a-zA-Z][\w-]*)/);
    if (!nameMatch) continue;
    const tagName = nameMatch[1];
    const el = new MiniElement(tagName);
    const attrText = body.slice(tagName.length);
    const attrPattern = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attrText))) {
      const key = attrMatch[1];
      const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      el.setAttribute(key, decodeEntities(value));
    }
    if (el.attributes.type) el.type = el.attributes.type;
    if (el.attributes.value !== undefined) el.value = el.attributes.value;
    if ('checked' in el.attributes) el.checked = true;
    stack[stack.length - 1].childNodes.push(el);
    el.parentNode = stack[stack.length - 1];
    if (!selfClosing && !VOID_TAGS.has(tagName.toLowerCase())) stack.push(el);
  }
  return stack[0].childNodes;
}

function installMiniDom() {
  globalThis.document = {
    createElement: (tag) => new MiniElement(tag),
    createTextNode: (text) => textNode(text),
  };
  return { MiniElement };
}

module.exports = { installMiniDom, MiniElement };
