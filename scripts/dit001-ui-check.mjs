import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Dither Field Markup
assert.match(
  html,
  /<div class="field" id="ditherField"/,
  '#ditherField container must exist in HTML'
);

assert.match(
  html,
  /<label for="ditherMode">디더링<\/label>/,
  'Label for ditherMode select must exist'
);

assert.match(
  html,
  /<select id="ditherMode" disabled aria-describedby="ditherAnimationWarning">/,
  '#ditherMode select must exist, disabled by default, with aria-describedby'
);

assert.match(
  html,
  /<option value="off" selected>사용 안 함 \(기본\)<\/option>/,
  'ditherMode must have "off" option selected by default'
);

assert.match(
  html,
  /<option value="bayer2">Bayer 2×2<\/option>/,
  'ditherMode must have "bayer2" option'
);

assert.match(
  html,
  /<option value="bayer4">Bayer 4×4<\/option>/,
  'ditherMode must have "bayer4" option'
);

// 2. Dither Strength Markup
assert.match(
  html,
  /<div id="ditherStrengthField" style="display:none; margin-top:8px;">/,
  '#ditherStrengthField must be hidden by default'
);

assert.match(
  html,
  /<input type="range" id="ditherStrengthRange" min="0" max="100" value="50" disabled aria-label="디더링 강도 슬라이더">/,
  '#ditherStrengthRange must have min 0, max 100, default 50'
);

assert.match(
  html,
  /<input type="number" id="ditherStrengthNum" min="0" max="100" value="50" disabled aria-label="디더링 강도 숫자 입력">/,
  '#ditherStrengthNum must have min 0, max 100, default 50'
);

assert.match(
  html,
  /<span class="val" id="ditherStrengthVal">50%<\/span>/,
  '#ditherStrengthVal span must show initial 50%'
);

// 3. Animation Warning Markup
assert.match(
  html,
  /<div id="ditherAnimationWarning"[^>]*style="[^"]*display:none;[^"]*"[^>]*>[\s\S]*?프레임에서 무늬가 흔들릴 수 있습니다\. 패턴 원점은 고정됩니다\.[\s\S]*?<\/div>/,
  '#ditherAnimationWarning must exist and contain the required warning message'
);

// 4. Script DOM References
assert.match(html, /const ditherField = document\.getElementById\('ditherField'\);/);
assert.match(html, /const ditherModeSel = document\.getElementById\('ditherMode'\);/);
assert.match(html, /const ditherStrengthField = document\.getElementById\('ditherStrengthField'\);/);
assert.match(html, /const ditherStrengthRange = document\.getElementById\('ditherStrengthRange'\);/);
assert.match(html, /const ditherStrengthNum = document\.getElementById\('ditherStrengthNum'\);/);
assert.match(html, /const ditherStrengthVal = document\.getElementById\('ditherStrengthVal'\);/);
assert.match(html, /const ditherAnimationWarning = document\.getElementById\('ditherAnimationWarning'\);/);

// 5. Script Settings & Presets
assert.match(html, /ditherMode:\s*'off'/);
assert.match(html, /ditherStrength:\s*50/);
assert.match(html, /'animation-safe':\s*\{[\s\S]*?ditherMode:\s*'off'/);
assert.match(html, /'oklab-animation-stable':\s*\{[\s\S]*?ditherMode:\s*'off'/);

// 6. Event Listeners
assert.match(html, /ditherModeSel\?\.addEventListener\('change',\s*\(\)\s*=>\s*updatePaletteExperimentUi\(false\)\);/);
assert.match(html, /ditherStrengthRange\?\.addEventListener\('input',/);
assert.match(html, /ditherStrengthNum\?\.addEventListener\('change',/);
assert.match(
  html,
  /scaleModeSel\.addEventListener\('change',\s*\(\)\s*=>\s*\{[\s\S]*?syncScaleModeControls\(\);[\s\S]*?updatePaletteExperimentUi\(false\);[\s\S]*?\}\);/,
  'scaleMode transitions must refresh the animation dither warning'
);
assert.match(
  html,
  /input\[name="gridFrameMode"\][\s\S]*?radio\.addEventListener\('change',\s*\(\)\s*=>\s*\{[\s\S]*?syncGridFrameModeControls\(\);[\s\S]*?updatePaletteExperimentUi\(false\);/,
  'grid frame-mode transitions must refresh the animation dither warning'
);
assert.match(
  html,
  /input\[name="factorFrameMode"\][\s\S]*?radio\.addEventListener\('change',\s*\(\)\s*=>\s*\{[\s\S]*?syncFactorFrameModeControls\(\);[\s\S]*?updatePaletteExperimentUi\(false\);/,
  'factor frame-mode transitions must refresh the animation dither warning'
);

// 7. Metadata in Processing
assert.match(html, /processing\.dither\s*=\s*\{/);
assert.match(html, /origin:\s*\[0,\s*0\]/);

// 8. Inactive sheet controls must not trigger animation warnings.
const updatePaletteExperimentUi = extractInlineFunction(html, 'updatePaletteExperimentUi');
assert.match(updatePaletteExperimentUi, /const activeScaleMode = scaleModeSel\?\.value \|\| 'square'/);
assert.match(updatePaletteExperimentUi, /activeScaleMode === 'factor' && document\.querySelector\('input\[name="factorFrameMode"\]:checked'\)\?\.value === 'sheet'/);
assert.match(updatePaletteExperimentUi, /activeScaleMode === 'grid-repair' && document\.querySelector\('input\[name="gridFrameMode"\]:checked'\)\?\.value === 'sheet'/);

console.log('DIT-001 UI checks passed (markup, slider/num sync, presets, warning notice, metadata).');
