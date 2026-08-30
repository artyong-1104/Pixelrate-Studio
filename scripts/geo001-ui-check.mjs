import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// Verify HTML markup
assert.match(html, /<option value="factor">정수 배율 축소 \(비율 유지\)<\/option>/, 'Option factor must exist');
assert.match(html, /id="factorOptions"/, 'factorOptions container must exist');
assert.match(html, /id="factor"/, 'factor input must exist');
assert.match(html, /name="factorFrameMode"\s+value="whole"/, 'whole frame mode radio must exist');
assert.match(html, /name="factorFrameMode"\s+value="sheet"/, 'sheet frame mode radio must exist');
assert.match(html, /id="factorFrameWidth"/, 'factorFrameWidth input must exist');
assert.match(html, /id="factorFrameHeight"/, 'factorFrameHeight input must exist');
assert.match(html, /id="factorCalculation"/, 'factorCalculation live region must exist');
assert.match(
  html,
  /\/\/ 초기 팔레트 UI 동기화\s+syncScaleModeControls\(\);/,
  'Initial UI synchronization must disable hidden factor controls'
);

const renderFileListMatch = html.match(/function renderFileList\(\)\{([\s\S]*?)\n\};\noutlineWidthRange/);
assert.ok(renderFileListMatch, 'renderFileList implementation must be present');
const removeHandlerMatch = renderFileListMatch[1].match(/x\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\s*\}\);/);
assert.ok(removeHandlerMatch, 'File removal handler must be present');
assert.match(removeHandlerMatch[1], /renderFileList\(\);/, 'File removal must recompute the file list and validation state');
assert.doesNotMatch(
  removeHandlerMatch[1],
  /runBtn\.disabled\s*=\s*uploadedFiles\.length\s*===\s*0/,
  'File removal must not overwrite factor validation state after renderFileList()'
);
assert.match(
  html,
  /runBtn\.addEventListener\('keydown',[\s\S]*?event\.key === 'Enter'[\s\S]*?event\.key === ' '[\s\S]*?event\.preventDefault\(\);[\s\S]*?runBtn\.click\(\);[\s\S]*?\}\);/,
  'Run button must provide deterministic Enter and Space keyboard activation'
);

console.log('GEO-001 UI structure and DOM markup checks passed.');
