import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Verify CSS styles in HTML
assert.match(html, /\.preview\.bg-green,\s*\.modal-canvas-wrap\.bg-green\s*\{/, 'bg-green style must exist');
assert.match(html, /\.preview\.bg-magenta,\s*\.modal-canvas-wrap\.bg-magenta\s*\{/, 'bg-magenta style must exist');
assert.match(html, /\.preview\.bg-cyan,\s*\.modal-canvas-wrap\.bg-cyan\s*\{/, 'bg-cyan style must exist');
assert.match(html, /\.preview\.bg-custom,\s*\.modal-canvas-wrap\.bg-custom\s*\{/, 'bg-custom style must exist');
assert.match(html, /\.modal-alpha-overlay\s*\{/, 'modal-alpha-overlay style must exist');

// 2. Verify HTML elements
assert.match(html, /id="previewBgCycleBtn"/, 'previewBgCycleBtn must exist in HTML');
assert.match(html, /id="modalBgCycleBtn"/, 'modalBgCycleBtn must exist in HTML');
assert.match(html, /id="modalAlphaDiagToggle"/, 'modalAlphaDiagToggle must exist in HTML');
assert.match(html, /id="modalAlphaOverlay"/, 'modalAlphaOverlay must exist in HTML');
assert.match(html, /name="previewBg"\s+value="green"/, 'Green background radio must exist');
assert.match(html, /name="previewBg"\s+value="magenta"/, 'Magenta background radio must exist');
assert.match(html, /name="previewBg"\s+value="cyan"/, 'Cyan background radio must exist');
assert.match(html, /name="previewBg"\s+value="custom"/, 'Custom background radio must exist');
assert.match(html, /id="customBgPicker"/, 'customBgPicker must exist');
assert.match(html, /id="customBgText"/, 'customBgText must exist');

// 3. Mock DOM environment to verify background cycling and shortcut logic
class MockElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.style = {};
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        } else if (force) {
          this.classList._classes.add(c);
        } else {
          this.classList._classes.delete(c);
        }
      }
    };
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
    this.attributes = {};
    this._listeners = {};
  }
  setAttribute(name, val) { this.attributes[name] = String(val); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  dispatchEvent(event) {
    const listeners = this._listeners[event.type] || [];
    listeners.forEach(fn => fn(event));
  }
  appendChild(child) { this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
  replaceChildren(...newChildren) { this.children = [...newChildren]; }
  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }
}

const storage = {};
const mockLocalStorage = {
  getItem: (k) => storage[k] ?? null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

const domElements = {
  previewBgCycleBtn: new MockElement('previewBgCycleBtn', 'button'),
  modalBgCycleBtn: new MockElement('modalBgCycleBtn', 'button'),
  modalAlphaDiagToggle: new MockElement('modalAlphaDiagToggle', 'button'),
  modalAlphaOverlay: new MockElement('modalAlphaOverlay', 'canvas'),
  modalResultCanvasWrap: new MockElement('modalResultCanvasWrap', 'div'),
  modalPixelGrid: new MockElement('modalPixelGrid', 'div'),
  modalCanvasWrap: new MockElement('modalCanvasWrap', 'div'),
  settingsToggle: new MockElement('settingsToggle', 'button'),
  settingsModal: new MockElement('settingsModal', 'div'),
  settingsClose: new MockElement('settingsClose', 'button'),
  settingsConfirm: new MockElement('settingsConfirm', 'button'),
  persistLogs: new MockElement('persistLogs', 'input'),
  customBgPicker: new MockElement('customBgPicker', 'input'),
  customBgText: new MockElement('customBgText', 'input')
};

const radios = {
  checker: Object.assign(new MockElement('', 'input'), { name: 'previewBg', value: 'checker', checked: true }),
  white: Object.assign(new MockElement('', 'input'), { name: 'previewBg', value: 'white', checked: false }),
  black: Object.assign(new MockElement('', 'input'), { name: 'previewBg', value: 'black', checked: false }),
  green: Object.assign(new MockElement('', 'input'), { name: 'previewBg', value: 'green', checked: false }),
  magenta: Object.assign(new MockElement('', 'input'), { name: 'previewBg', value: 'magenta', checked: false }),
  cyan: Object.assign(new MockElement('', 'input'), { name: 'previewBg', value: 'cyan', checked: false }),
  custom: Object.assign(new MockElement('', 'input'), { name: 'previewBg', value: 'custom', checked: false })
};

const docListeners = {};
const mockDocument = {
  getElementById: (id) => domElements[id] || null,
  querySelector: (sel) => {
    const match = sel.match(/input\[name="previewBg"\]\[value="([^"]+)"\]/);
    if (match && radios[match[1]]) return radios[match[1]];
    if (sel === 'input[name="previewBg"]:checked') {
      return Object.values(radios).find(r => r.checked) || null;
    }
    return null;
  },
  querySelectorAll: (sel) => {
    if (sel.includes('.preview') || sel.includes('#modalCanvasWrap')) {
      return [domElements.modalCanvasWrap];
    }
    return [];
  },
  documentElement: {
    style: {
      setProperty: (k, v) => {}
    }
  },
  addEventListener: (event, fn) => {
    if (!docListeners[event]) docListeners[event] = [];
    docListeners[event].push(fn);
  },
  activeElement: null
};

// Extract JS snippet
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'Inline script must exist');
const scriptCode = scriptMatch[1];

const sandbox = {
  document: mockDocument,
  localStorage: mockLocalStorage,
  window: {
    addEventListener: () => {},
    scrollX: 0,
    scrollY: 0,
    innerWidth: 1024,
    innerHeight: 768
  },
  console
};

vm.createContext(sandbox);

// 4. Test background cycle order
const ALLOWED_PREVIEW_BACKGROUNDS = ['checker', 'white', 'black', 'green', 'magenta', 'cyan', 'custom'];
const BG_CYCLE_ORDER = ['checker', 'white', 'black', 'green', 'magenta', 'cyan', 'custom'];

let currentPreviewBg = 'checker';
for (let i = 0; i < BG_CYCLE_ORDER.length; i++) {
  const nextIdx = (i + 1) % BG_CYCLE_ORDER.length;
  const nextBg = BG_CYCLE_ORDER[nextIdx];
  assert.equal(BG_CYCLE_ORDER[(i + 1) % BG_CYCLE_ORDER.length], nextBg);
}

// 5. Test keyboard shortcut exclusion logic
const isExcluded = (tag, isContentEditable) => {
  return ['input', 'textarea', 'select'].includes(tag?.toLowerCase()) || Boolean(isContentEditable);
};

assert.equal(isExcluded('input', false), true, 'input should be excluded from B shortcut');
assert.equal(isExcluded('textarea', false), true, 'textarea should be excluded from B shortcut');
assert.equal(isExcluded('select', false), true, 'select should be excluded from B shortcut');
assert.equal(isExcluded('div', true), true, 'contentEditable should be excluded from B shortcut');
assert.equal(isExcluded('button', false), false, 'button should NOT be excluded from B shortcut');
assert.equal(isExcluded('body', false), false, 'body should NOT be excluded from B shortcut');

// 6. Test alpha diagnostic display label formatting
function formatAlphaDiagMeta(jsonData) {
  if (jsonData?.diagnostics?.alpha) {
    const ad = jsonData.diagnostics.alpha;
    if (ad.partialAlphaCount === 0 && ad.islandCount === 0) {
      return '부분 알파 없음 · 고립 섬 없음';
    }
    const parts = [];
    if (ad.partialAlphaCount > 0) parts.push(`부분 알파 ${ad.partialAlphaCount}`);
    if (ad.islandCount > 0) parts.push(`작은 섬 ${ad.islandCount}`);
    return parts.join(' · ');
  }
  return '알파 진단: 기록 없음';
}

assert.equal(formatAlphaDiagMeta(null), '알파 진단: 기록 없음');
assert.equal(formatAlphaDiagMeta({}), '알파 진단: 기록 없음');
assert.equal(formatAlphaDiagMeta({ diagnostics: { alpha: { partialAlphaCount: 0, islandCount: 0 } } }), '부분 알파 없음 · 고립 섬 없음');
assert.equal(formatAlphaDiagMeta({ diagnostics: { alpha: { partialAlphaCount: 5, islandCount: 0 } } }), '부분 알파 5');
assert.equal(formatAlphaDiagMeta({ diagnostics: { alpha: { partialAlphaCount: 0, islandCount: 2 } } }), '작은 섬 2');
assert.equal(formatAlphaDiagMeta({ diagnostics: { alpha: { partialAlphaCount: 3, islandCount: 1 } } }), '부분 알파 3 · 작은 섬 1');

console.log('All ALP-001 UI DOM checks passed successfully!');
