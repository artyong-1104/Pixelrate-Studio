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

console.log('GEO-001 UI structure and DOM markup checks passed.');
