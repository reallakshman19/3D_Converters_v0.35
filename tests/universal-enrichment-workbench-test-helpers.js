const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
let esmRoot = '';

function ensureEsmCopy() {
  if (esmRoot) return esmRoot;
  esmRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uew-esm-'));
  fs.writeFileSync(path.join(esmRoot, 'package.json'), '{"type":"module"}\n');
  fs.mkdirSync(path.join(esmRoot, 'tabs'), { recursive: true });
  fs.cpSync(path.join(root, 'tabs', 'universal-enrichment-workbench'), path.join(esmRoot, 'tabs', 'universal-enrichment-workbench'), { recursive: true });
  fs.copyFileSync(path.join(root, 'tabs', 'universal-enrichment-workbench-tab.js'), path.join(esmRoot, 'tabs', 'universal-enrichment-workbench-tab.js'));
  return esmRoot;
}

async function loadEsm(relativePath) {
  const file = path.join(ensureEsmCopy(), relativePath);
  return import(`${pathToFileURL(file).href}?test=${Date.now()}-${Math.random()}`);
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.listeners = new Map();
    this.children = [];
    this.dataset = {};
    this.value = '';
    this.files = [];
    this.disabled = false;
    this.textContent = '';
    this.parentNode = null;
    this.className = '';
    this.style = {};
    this.hidden = false;
    this.type = '';
    this.id = '';

  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || new Set();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  async dispatch(type, target = this) {
    const handlers = [...(this.listeners.get(type) || [])];
    const event = { type, target, preventDefault() {}, stopPropagation() {} };
    for (const handler of handlers) await handler(event);
  }

  click() { return this.dispatch('click'); }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head', this);
  }

  createElement(tagName) { return new FakeElement(tagName, this); }

  getElementById(id) {
    const visit = (node) => node.id === id ? node : node.children.map(visit).find(Boolean);
    return visit(this.head) || null;
  }
}

class FakeContainer extends FakeElement {
  constructor(ownerDocument) {
    super('div', ownerDocument);
    this.elements = new Map();
    this.markup = '';
  }

  set innerHTML(value) {
    this.markup = String(value);
    this.elements.clear();
    for (const match of this.markup.matchAll(/id="([^"]+)"/g)) {
      const tag = this.markup.slice(0, match.index).match(/<([a-z0-9-]+)[^<>]*$/i)?.[1] || 'div';
      const element = new FakeElement(tag, this.ownerDocument);
      element.id = match[1];
      if (element.id === 'uew-kind') element.value = 'auto';
      this.elements.set(element.id, element);
    }
  }

  get innerHTML() { return this.markup; }
  querySelector(selector) { return this.elements.get(selector.replace(/^#/, '')) || null; }
  replaceChildren(...children) { super.replaceChildren(...children); if (!children.length) this.markup = ''; }
}

function createUrlHarness() {
  let nextId = 1;
  const blobs = new Map();
  const revoked = [];
  return {
    blobs, revoked,
    api: {
      createObjectURL(blob) { const url = `blob:uew-${nextId++}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); blobs.delete(url); },
    },
  };
}

module.exports = { root, loadEsm, FakeContainer, FakeDocument, FakeElement, createUrlHarness };
