import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

for (const selector of ['anim-policy-chips', 'anim-chip', 'anim-playback-controls', 'anim-fps-control', 'anim-frame-indicator', 'anim-text-control']) {
  assert.match(html, new RegExp(`\\.${selector}\\s*\\{`), `.${selector} CSS must exist`);
}
for (const id of [
  'animReviewBtn', 'animModal', 'animModalTitle', 'animSourceSelect', 'animClose', 'animCanvasWrap',
  'animCanvasStage', 'animCanvas', 'animPixelGrid', 'animPlayPauseBtn', 'animPrevBtn', 'animNextBtn',
  'animLoopBtn', 'animFpsRange', 'animFpsNumber', 'animFrameLabel', 'animZoom1x', 'animZoom2x',
  'animZoom8x', 'animGridToggle', 'animBgCycleBtn', 'animExpandToggle', 'animPolicyChips',
  'animChipPalette', 'animChipGrid', 'animChipDither', 'animNotice'
]) {
  assert(html.includes(`id="${id}"`), `#${id} must exist`);
}

assert.match(html, /id="animModal" role="dialog" aria-modal="true" aria-labelledby="animModalTitle"/);
assert.match(html, /id="animFrameLabel" role="status" aria-live="polite" aria-atomic="true"/);
assert.doesNotMatch(html, /class="[^"]*modal-view-reset[^"]*" id="anim(?:PlayPause|Loop|BgCycle)Btn"/,
  'text controls must not inherit the fixed 32px icon-button width');
assert.match(html, /animSourceSelect\.focus\(\)/, 'modal open must move focus into the dialog');
assert.match(html, /returnFocus\.focus\(\)/, 'modal close must restore the trigger focus');
assert.match(html, /animModal\.querySelectorAll\(/, 'open dialog must trap Tab focus');
assert.match(html, /e\.key === 'Tab'/);
assert.match(html, /e\.code === 'Space' \|\| e\.key === ' '/);
assert.match(html, /e\.key === 'ArrowLeft'/);
assert.match(html, /e\.key === 'ArrowRight'/);
assert.match(html, /e\.key === 'b' \|\| e\.key === 'B'/);
assert.match(html, /document\.addEventListener\('visibilitychange'/);
assert.match(html, /window\.addEventListener\('blur'/);
assert.match(html, /tabLogsBtn\.addEventListener\('click',[\s\S]*?closeAnimModal\(false\)/);
assert.match(html, /async function processAll\(\)\{\s*if \(typeof closeAnimModal === 'function'\) closeAnimModal\(false\);/);
assert.match(html, /animFrameLabel\.setAttribute\('aria-live', playing \? 'off' : 'polite'\)/,
  'playing frames must not announce every visual update');
assert.doesNotMatch(html, /paletteEnabledCheck\.addEventListener/,
  'removed palette checkbox must not crash startup');
assert.match(html, /accepted\.push\(\{ file, addedIndex: nextUploadAddedIndex\+\+ \}\)/);
assert.match(html, /uploadedFiles\.sort\(compareAnimationFrameOrder\)/);
assert.match(html, /addedIndex: d\.addedIndex/);
assert.match(html, /addedIndex: result\.addedIndex/,
  'sheet animation sources must retain addedIndex for same-name metadata lookup');
assert.match(html, /function findAnimSourceResult\(sourceItem, allResults\)/);
assert.match(html, /result\.name === sourceItem\.name && result\.addedIndex === sourceItem\.addedIndex/);
assert.match(html, /setAnimControlsDisabled\(true\)/,
  'oversized sheet source must disable playback and viewport controls');
assert.match(html, /const sourceReady = selectAnimSource\(chosenIdx\)/);
assert.match(html, /setAnimPlaying\(sourceReady && !prefersReducedMotion\)/,
  'modal open must never restart playback for an invalid source');
assert.match(html, /function getAnimSourceWarningText\(sources, selectedSource\)/);
assert.match(html, /재생 제외 — \$\{source\.name \|\| source\.title\}: \$\{source\.error\}/,
  'valid mixed source must keep excluded oversized-sheet reasons visible');
assert.match(html, /opt\.textContent = `\$\{src\.title\} — 재생 불가: \$\{src\.error\}`/,
  'disabled oversized-sheet option must include its full reason');
assert.match(html, /openAnimDialog\?\.classList\.contains\('open'\) && animBackgroundControl\?\.disabled/,
  'disabled oversized-sheet controls must also block the B keyboard shortcut');

console.log('ANI-001 DOM, layout, focus, lifecycle, and metadata checks passed.');
