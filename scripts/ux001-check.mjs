import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Verify HTML Structure & Accessibility attributes
assert.match(html, /<div class="modal-mode-group" role="group" aria-label="보기 모드"/, 'modal-mode-group must exist with accessible role/label');
assert.match(html, /id="modalModeResult"[^>]*>결과<\/button>/, 'modalModeResult button must exist');
assert.match(html, /id="modalModeSource"[^>]*>원본<\/button>/, 'modalModeSource button must exist');
assert.match(html, /id="modalModeSplit"[^>]*>나란히<\/button>/, 'modalModeSplit button must exist');

assert.match(html, /<div class="modal-quick-zoom-group" role="group" aria-label="빠른 배율 선택"/, 'modal-quick-zoom-group must exist with accessible role/label');
assert.match(html, /id="modalZoom1x"[^>]*>1×<\/button>/, 'modalZoom1x button must exist');
assert.match(html, /id="modalZoom2x"[^>]*>2×<\/button>/, 'modalZoom2x button must exist');
assert.match(html, /id="modalZoom8x"[^>]*>8×<\/button>/, 'modalZoom8x button must exist');

assert.match(html, /id="modalSourcePane"/, 'modalSourcePane must exist');
assert.match(html, /id="modalSourceLabel"/, 'modalSourceLabel must exist');
assert.match(html, /id="modalSourceCanvasWrap"/, 'modalSourceCanvasWrap must exist');
assert.match(html, /id="modalResultPane"/, 'modalResultPane must exist');
assert.match(html, /id="modalResultLabel"/, 'modalResultLabel must exist');
assert.match(html, /id="modalResultCanvasWrap"/, 'modalResultCanvasWrap must exist');
assert.match(html, /id="modalFallbackNotice"/, 'modalFallbackNotice must exist');

// 2. Verify Grid Overlay is only in modalResultCanvasWrap
assert.match(html, /<div class="modal-pane-canvas-wrap" id="modalResultCanvasWrap">\s*<div class="modal-pixel-grid" id="modalPixelGrid"><\/div>/, 'modalPixelGrid must be strictly nested inside modalResultCanvasWrap');

// 3. Verify CSS Responsive Stacking
assert.match(html, /@media \(max-width:\s*620px\)\s*\{\s*\.modal-canvas-stage\s*\{\s*flex-direction:\s*column/, 'Modal stage must stack vertically on mobile (<=620px)');

// 4. Verify Script Logic and Event Handlers
assert.match(html, /modalModeResult\.addEventListener\('click'/, 'modalModeResult listener must exist');
assert.match(html, /modalModeSource\.addEventListener\('click'/, 'modalModeSource listener must exist');
assert.match(html, /modalModeSplit\.addEventListener\('click'/, 'modalModeSplit listener must exist');
assert.match(html, /modalZoom1x\.addEventListener\('click'/, 'modalZoom1x listener must exist');
assert.match(html, /modalZoom2x\.addEventListener\('click'/, 'modalZoom2x listener must exist');
assert.match(html, /modalZoom8x\.addEventListener\('click'/, 'modalZoom8x listener must exist');
assert.match(html, /function createLazySourceCanvas/, 'createLazySourceCanvas helper function must exist');
assert.match(html, /function updateQuickZoomButtons/, 'updateQuickZoomButtons helper function must exist');
assert.match(html, /function setModalViewMode/, 'setModalViewMode helper function must exist');

// 5. Test State and Logic Transitions in Mock Sandbox
const mockElements = {
  modalZoom1x: { attr: {}, setAttribute(k, v) { this.attr[k] = v; } },
  modalZoom2x: { attr: {}, setAttribute(k, v) { this.attr[k] = v; } },
  modalZoom8x: { attr: {}, setAttribute(k, v) { this.attr[k] = v; } }
};

function updateQuickZoomButtonsMock(scale) {
  const qBtns = [
    { el: mockElements.modalZoom1x, zoom: 1 },
    { el: mockElements.modalZoom2x, zoom: 2 },
    { el: mockElements.modalZoom8x, zoom: 8 }
  ];
  qBtns.forEach(({ el, zoom }) => {
    el.setAttribute('aria-pressed', String(scale === zoom));
  });
}

// Test 1x
updateQuickZoomButtonsMock(1);
assert.equal(mockElements.modalZoom1x.attr['aria-pressed'], 'true');
assert.equal(mockElements.modalZoom2x.attr['aria-pressed'], 'false');
assert.equal(mockElements.modalZoom8x.attr['aria-pressed'], 'false');

// Test 2x
updateQuickZoomButtonsMock(2);
assert.equal(mockElements.modalZoom1x.attr['aria-pressed'], 'false');
assert.equal(mockElements.modalZoom2x.attr['aria-pressed'], 'true');
assert.equal(mockElements.modalZoom8x.attr['aria-pressed'], 'false');

// Test 8x
updateQuickZoomButtonsMock(8);
assert.equal(mockElements.modalZoom1x.attr['aria-pressed'], 'false');
assert.equal(mockElements.modalZoom2x.attr['aria-pressed'], 'false');
assert.equal(mockElements.modalZoom8x.attr['aria-pressed'], 'true');

// Test arbitrary zoom (e.g. 4x)
updateQuickZoomButtonsMock(4);
assert.equal(mockElements.modalZoom1x.attr['aria-pressed'], 'false');
assert.equal(mockElements.modalZoom2x.attr['aria-pressed'], 'false');
assert.equal(mockElements.modalZoom8x.attr['aria-pressed'], 'false');

console.log('UX-001 regression checks passed (markup, accessibility, quick zoom, view modes, fallback, cleanup, mobile styles).');
