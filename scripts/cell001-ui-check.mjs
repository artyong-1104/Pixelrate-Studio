import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');

assert.match(html, /id="showExperimentalFeatures"[^>]+aria-controls="[^"]*representativeColorField[^"]*"[^>]+aria-expanded="false"/);
assert.match(html, /id="representativeColor" disabled aria-describedby="representativeColorWarning"/);
assert.match(html, /실험 기능이며 작은 특징이 사라지거나 밝기가 달라질 수 있습니다\./);
assert.match(html, /processing\.representativeColor = representativeColor;/, 'result JSON must record representative ID');
assert.match(html, /대표색 \$\{r\.jsonData\?\.processing\?\.representativeColor \|\| 'mean-srgb'\}/, 'result card must expose representative ID');

const processAll = extractInlineFunction(html, 'processAll');
for(const route of ['boxDownscale', 'exactFactorDownscale', 'preserveSheetDownscale', 'gridRepairDownscale']){
  assert.match(
    processAll,
    new RegExp(`${route}\\([^;]+representativeColor, alphaThreshold(?:, [^)]+)?\\)`),
    `${route} must receive the CELL-001 policy, with optional later-stage arguments allowed`
  );
}

const showExperimentalFeatures = {
  checked: false,
  attributes: new Map(),
  setAttribute(name, value){ this.attributes.set(name, value); }
};
const representativeColorField = { style: { display: 'block' } };
const representativeColorSel = { value: 'majority', disabled: false };
const representativeColorWarning = { style: { display: 'block' } };
const context = {
  Boolean,
  showExperimentalFeatures,
  representativeColorField,
  representativeColorSel,
  representativeColorWarning
};
vm.createContext(context);
vm.runInContext(`${extractInlineFunction(html, 'updateRepresentativeColorUi')}\nglobalThis.updateRepresentativeColorUi = updateRepresentativeColorUi;`, context);

context.updateRepresentativeColorUi(true);
assert.equal(representativeColorSel.value, 'mean-srgb', 'hiding experiments must reset the production path');
assert.equal(representativeColorSel.disabled, true);
assert.equal(representativeColorField.style.display, 'none');
assert.equal(representativeColorWarning.style.display, 'none');
assert.equal(showExperimentalFeatures.attributes.get('aria-expanded'), 'false');

showExperimentalFeatures.checked = true;
representativeColorSel.value = 'center';
context.updateRepresentativeColorUi(false);
assert.equal(representativeColorSel.disabled, false);
assert.equal(representativeColorField.style.display, 'block');
assert.equal(representativeColorWarning.style.display, 'block');
assert.equal(showExperimentalFeatures.attributes.get('aria-expanded'), 'true');

representativeColorSel.value = 'mean-srgb';
context.updateRepresentativeColorUi(false);
assert.equal(representativeColorWarning.style.display, 'none', 'default representative must not show the risk warning');

const applyUiSettings = extractInlineFunction(html, 'applyUiSettings');
assert.match(applyUiSettings, /showExperimentalFeatures\.checked = \(settings\.representativeColor \|\| 'mean-srgb'\) !== 'mean-srgb'/);
assert.match(applyUiSettings, /updateRepresentativeColorUi\(false\)/);

console.log('CELL-001 experimental UI, settings visibility, route wiring, warning, and metadata checks passed.');
