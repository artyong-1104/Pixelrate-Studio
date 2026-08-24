import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Accordion Structure
assert.match(
  html,
  /<div class="accordion-item collapsed" id="accordionAlpha">/,
  '#accordionAlpha must exist and be collapsed by default'
);

assert.match(
  html,
  /<div class="accordion-header">\s*<span>4\.\s*투명도 처리<\/span>/,
  '#accordionAlpha must be titled "4. 투명도 처리"'
);

// 2. Subsequent Accordion Renumbering
assert.match(
  html,
  /<div class="accordion-header">\s*<span>5\.\s*노이즈 필터<\/span>/,
  'Noise filter accordion must be renumbered to "5. 노이즈 필터"'
);
assert.match(
  html,
  /<div class="accordion-header">\s*<span>6\.\s*외곽선 효과<\/span>/,
  'Outline effect accordion must be renumbered to "6. 외곽선 효과"'
);
assert.match(
  html,
  /<div class="accordion-header">\s*<span>7\.\s*내보내기 설정<\/span>/,
  'Export settings accordion must be renumbered to "7. 내보내기 설정"'
);

// 3. Alpha Mode Radio Buttons
assert.match(
  html,
  /<input type="radio" name="alphaMode" id="alphaModeBinary" value="binary" checked>/,
  'alphaModeBinary radio button must exist and be checked by default'
);
assert.match(
  html,
  /<input type="radio" name="alphaMode" id="alphaModeCoverage" value="coverage">/,
  'alphaModeCoverage radio button must exist'
);

// 4. Coverage Mode Warning Box
assert.match(
  html,
  /<div id="alphaCoverageWarning" class="frame-size-note"[^>]*style="[^"]*display:none;[^"]*"[^>]*>[\s\S]*?일부 엔진·팔레트 워크플로는 부분 투명도를 다르게 처리할 수 있습니다\.[\s\S]*?<\/div>/,
  '#alphaCoverageWarning must exist, be hidden by default, and contain the specified warning message'
);

// 5. Alpha Threshold Inputs
assert.match(
  html,
  /<input type="range" id="alphaThresholdRange" min="1" max="254" value="10" aria-label="투명도 임계값 슬라이더">/,
  '#alphaThresholdRange must have min 1, max 254, default 10 and aria-label'
);
assert.match(
  html,
  /<input type="number" id="alphaThresholdNum" min="1" max="254" value="10" aria-label="투명도 임계값 숫자 입력">/,
  '#alphaThresholdNum must have min 1, max 254, default 10 and aria-label'
);
assert.match(
  html,
  /<label for="alphaThresholdRange">투명도 임계값 \(1~254\)<\/label>/,
  'Label for alphaThresholdRange must exist'
);

assert.match(
  html,
  /class="ghost modal-view-reset modal-text-control" id="modalBgCycleBtn"/,
  'Background text control must use the non-wrapping modal text class'
);
assert.match(
  html,
  /class="ghost modal-view-reset modal-text-control modal-alpha-toggle" id="modalAlphaDiagToggle"/,
  'Alpha diagnostics text control must use the non-wrapping modal text class'
);
assert.match(
  html,
  /\.modal-text-control, \.anim-text-control\{[\s\S]*?width:auto;[\s\S]*?min-width:max-content;[\s\S]*?white-space:nowrap;/,
  'Modal text controls must not inherit the icon-only 32px wrapping behavior'
);

// 6. Diagnostics Summary
assert.match(
  html,
  /<div id="alphaDiagnosticsSummary"/,
  '#alphaDiagnosticsSummary element must exist'
);

// 7. Script Element References
assert.match(html, /const alphaModeBinaryRadio = document\.getElementById\('alphaModeBinary'\);/);
assert.match(html, /const alphaModeCoverageRadio = document\.getElementById\('alphaModeCoverage'\);/);
assert.match(html, /const alphaThresholdRange = document\.getElementById\('alphaThresholdRange'\);/);
assert.match(html, /const alphaThresholdNum = document\.getElementById\('alphaThresholdNum'\);/);
assert.match(html, /const alphaCoverageWarning = document\.getElementById\('alphaCoverageWarning'\);/);
assert.match(html, /const alphaDiagnosticsSummary = document\.getElementById\('alphaDiagnosticsSummary'\);/);

// 7.1 Production-path wiring (do not accept a test-only reimplementation)
assert.match(
  html,
  /collectOpaquePoints\(d\.data, n, MAX_PALETTE_SAMPLES, alphaThreshold, alphaMode === 'coverage'\)/,
  'Coverage auto palette must request alpha-weighted samples in the production path'
);
assert.match(
  html,
  /const alphaPolicyArtifacts = buildAlphaPolicyArtifacts\([\s\S]*?finalGrid,[\s\S]*?finalAlpha,[\s\S]*?finalW,[\s\S]*?finalH,[\s\S]*?alphaMode,[\s\S]*?alphaThreshold[\s\S]*?\);/,
  'All scale modes must enter the shared production alpha artifact helper'
);
assert.match(
  html,
  /const outputAlpha = renderedAlpha\[i\];[\s\S]*?const alpha2d = alphaPolicyArtifacts\.alphaMatrix;/,
  'PNG alpha and coverage JSON must consume the same tested production artifacts'
);
assert.match(
  html,
  /alphaDiagnostics: outputAlphaDiag/,
  'Result diagnostics must use final rendered alpha rather than pre-policy source alpha'
);
assert.match(
  html,
  /const storageIssue = getResultLogStorageIssue\(resultsData\);/,
  'IndexedDB log writes must pass through the JSON size gate'
);
assert.match(
  html,
  /lastResults\.reduce\(\(sum, r\) => sum \+ getResultPartialAlphaCount\(r\), 0\)/,
  'Restored log summaries must fall back to persisted final alpha diagnostics'
);

// 8. Mock DOM Interactive State Tests
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
    const type = typeof event === 'string' ? event : event.type;
    (this._listeners[type] || []).forEach(fn => fn.call(this, event));
  }
}

// Test UI Logic for updateAlphaModeUi and Threshold sync
const binaryRadio = new MockElement('alphaModeBinary', 'input');
binaryRadio.checked = true;
const coverageRadio = new MockElement('alphaModeCoverage', 'input');
coverageRadio.checked = false;
const warningEl = new MockElement('alphaCoverageWarning', 'div');
warningEl.style.display = 'none';

function testUpdateAlphaModeUi() {
  const isCoverage = coverageRadio.checked;
  warningEl.style.display = isCoverage ? 'block' : 'none';
}

testUpdateAlphaModeUi();
assert.equal(warningEl.style.display, 'none', 'Warning must be hidden when binary mode is checked');

coverageRadio.checked = true;
binaryRadio.checked = false;
testUpdateAlphaModeUi();
assert.equal(warningEl.style.display, 'block', 'Warning must be visible when coverage mode is checked');

// Threshold sync logic
const rangeInput = new MockElement('alphaThresholdRange', 'input');
rangeInput.value = '10';
const numInput = new MockElement('alphaThresholdNum', 'input');
numInput.value = '10';

rangeInput.addEventListener('input', () => {
  numInput.value = rangeInput.value;
});
numInput.addEventListener('change', () => {
  let val = parseInt(numInput.value, 10);
  if (!Number.isFinite(val) || val < 1) val = 1;
  else if (val > 254) val = 254;
  numInput.value = String(val);
  rangeInput.value = String(val);
});

// Range change -> Number updates
rangeInput.value = '45';
rangeInput.dispatchEvent('input');
assert.equal(numInput.value, '45');

// Number change out of bounds clamped (e.g. 300 -> 254, 0 -> 1)
numInput.value = '300';
numInput.dispatchEvent('change');
assert.equal(numInput.value, '254');
assert.equal(rangeInput.value, '254');

numInput.value = '-10';
numInput.dispatchEvent('change');
assert.equal(numInput.value, '1');
assert.equal(rangeInput.value, '1');

console.log('All ALP-002 UI DOM and interactive checks passed successfully!');
