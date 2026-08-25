import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Verify CSS styles for palette chips
assert.match(html, /\.palette-chip-grid/, 'palette-chip-grid CSS class must exist');
assert.match(html, /\.palette-chip\b/, 'palette-chip CSS class must exist');

// 2. Mock DOM environment for UI interaction testing
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
      contains: (c) => this.classList._classes.has(c)
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

const domElements = {
  paletteMode: new MockElement('paletteMode', 'select'),
  paletteAutoControls: new MockElement('paletteAutoControls', 'div'),
  customPaletteControls: new MockElement('customPaletteControls', 'div'),
  customPaletteText: new MockElement('customPaletteText', 'textarea'),
  loadPaletteFileBtn: new MockElement('loadPaletteFileBtn', 'button'),
  paletteFileInput: new MockElement('paletteFileInput', 'input'),
  clearCustomPaletteBtn: new MockElement('clearCustomPaletteBtn', 'button'),
  customPaletteStats: new MockElement('customPaletteStats', 'div'),
  customPaletteWarning: new MockElement('customPaletteWarning', 'div'),
  customPaletteChips: new MockElement('customPaletteChips', 'div'),
  paletteSharedField: new MockElement('paletteSharedField', 'div'),
  shared: new MockElement('shared', 'input'),
  colors: new MockElement('colors', 'input'),
  colorsNum: new MockElement('colorsNum', 'input'),
  scaleMode: new MockElement('scaleMode', 'select')
};

const mockDocument = {
  getElementById: (id) => domElements[id] || new MockElement(id),
  querySelector: (sel) => {
    if (sel.startsWith('#')) return domElements[sel.slice(1)] || null;
    return null;
  },
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement('', tag)
};

const context = vm.createContext({
  Array,
  Math,
  Number,
  Object,
  parseInt,
  Set,
  Map,
  String,
  document: mockDocument,
  paletteModeSel: domElements.paletteMode,
  paletteAutoControls: domElements.paletteAutoControls,
  customPaletteControls: domElements.customPaletteControls,
  customPaletteText: domElements.customPaletteText,
  loadPaletteFileBtn: domElements.loadPaletteFileBtn,
  paletteFileInput: domElements.paletteFileInput,
  clearCustomPaletteBtn: domElements.clearCustomPaletteBtn,
  customPaletteStats: domElements.customPaletteStats,
  customPaletteWarning: domElements.customPaletteWarning,
  customPaletteChips: domElements.customPaletteChips,
  paletteSharedField: domElements.paletteSharedField,
  sharedCheck: domElements.shared,
  colorsRange: domElements.colors,
  colorsNum: domElements.colorsNum,
  scaleModeSel: domElements.scaleMode,
  updatePaletteExperimentUi: () => {}
});

const scriptContent = `
${extractInlineFunction(html, 'rgbToHex')}
${extractInlineFunction(html, 'hexToRgb')}
${extractInlineFunction(html, 'dedupePaletteColors')}
${extractInlineFunction(html, 'parseHexPalette')}
${extractInlineFunction(html, 'parseGplPalette')}
${extractInlineFunction(html, 'parsePngPaletteData')}
${extractInlineFunction(html, 'updatePaletteModeUi')}
${extractInlineFunction(html, 'renderCustomPalettePreview')}
`;

vm.runInContext(scriptContent, context);

// 3. Test updatePaletteModeUi
console.log('--- Testing updatePaletteModeUi ---');
{
  // Test auto mode
  domElements.paletteMode.value = 'auto';
  context.updatePaletteModeUi();
  assert.equal(domElements.paletteAutoControls.style.display, 'block');
  assert.equal(domElements.customPaletteControls.style.display, 'none');
  assert.equal(domElements.paletteSharedField.style.display, 'block');
  assert.equal(domElements.shared.disabled, false);

  // Test custom mode
  domElements.paletteMode.value = 'custom';
  context.updatePaletteModeUi();
  assert.equal(domElements.paletteAutoControls.style.display, 'none');
  assert.equal(domElements.customPaletteControls.style.display, 'block');
  assert.equal(domElements.paletteSharedField.style.display, 'block');
  assert.equal(domElements.shared.checked, true, 'shared should be forced checked in custom mode');
  assert.equal(domElements.shared.disabled, true, 'shared should be disabled in custom mode');

  // Test unlimited mode
  domElements.paletteMode.value = 'unlimited';
  context.updatePaletteModeUi();
  assert.equal(domElements.paletteAutoControls.style.display, 'none');
  assert.equal(domElements.customPaletteControls.style.display, 'none');
  assert.equal(domElements.paletteSharedField.style.display, 'none');
  assert.equal(domElements.shared.disabled, true);
}

// 4. Test renderCustomPalettePreview
console.log('--- Testing renderCustomPalettePreview ---');
{
  domElements.paletteMode.value = 'custom';
  domElements.customPaletteText.value = `#0F380F\n#306230\n#8BAC0F\n#9BBC0F\n#0F380F`; // 4 unique, 1 duplicate
  context.renderCustomPalettePreview();

  assert.equal(domElements.customPaletteStats.textContent, '유효 4색 · 중복 1개 제거');
  assert.equal(domElements.customPaletteChips.children.length, 4, 'Should render 4 swatch chips');
  assert.equal(domElements.customPaletteChips.children[0].style.backgroundColor, '#0F380F');
  assert.equal(domElements.customPaletteChips.children[0].getAttribute('aria-label'), '색상 1: #0F380F');
  assert.equal(domElements.customPaletteChips.children[0].title, '1: #0F380F');
  assert.equal(domElements.customPaletteChips.children[3].style.backgroundColor, '#9BBC0F');

  // Test Warning on too few colors (< 2)
  domElements.customPaletteText.value = `#FF0000`;
  context.renderCustomPalettePreview();
  assert.equal(domElements.customPaletteStats.textContent, '유효 1색');
  assert.match(domElements.customPaletteWarning.textContent, /최소 2개 이상/);
  assert.equal(domElements.customPaletteWarning.style.display, 'block');

  // Test Clear
  domElements.customPaletteText.value = '';
  context.renderCustomPalettePreview();
  assert.equal(domElements.customPaletteStats.textContent, '유효 0색');
  assert.equal(domElements.customPaletteChips.children.length, 0);
}

console.log('PAL-001 DOM elements and interaction wiring verified successfully.');
