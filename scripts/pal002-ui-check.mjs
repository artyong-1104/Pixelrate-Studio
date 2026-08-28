import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');

for(const id of [
  'paletteExperimentField', 'paletteAlgorithm', 'paletteSampling', 'paletteReferenceField',
  'paletteReference', 'paletteReferenceError', 'paletteExperimentStatus'
]) assert.match(html, new RegExp(`id="${id}"`), `${id} must exist`);
for(const value of ['kmeans-srgb', 'kmeans-oklab', 'median-cut', 'pixel', 'image-balanced', 'reference']){
  assert.match(html, new RegExp(`value="${value}"`), `${value} option must exist`);
}
assert.match(html, /value="oklab-animation-stable"/);
assert.match(html, /const OKLAB_TEMPORAL_EPSILON = 0\.005;/);
assert.match(html, /'oklab-animation-stable':\s*\{[\s\S]*paletteAlgorithm:\s*'kmeans-oklab'[\s\S]*shared:\s*true/);
assert.match(html, /aria-controls="[^"]*representativeColorField[^"]*paletteExperimentField[^"]*"/);
assert.match(html, /paletteAlgorithm: 'kmeans-srgb'/);
assert.match(html, /paletteSampling: 'pixel'/);
assert.match(html, /paletteReference: null/);

const processAll = extractInlineFunction(html, 'processAll');
assert.match(processAll, /getPaletteReferenceValidation\(uploadedFiles, paletteSampling, paletteReference\)/);
assert.match(processAll, /buildAutoPaletteChunked\([\s\S]+paletteAlgorithm,[\s\S]+paletteSampling,[\s\S]+paletteReference/);
assert.match(processAll, /algorithm: paletteAlgorithm/);
assert.match(processAll, /sampling: paletteSampling/);
assert.match(processAll, /error: paletteMapping\?\.error/);
assert.match(processAll, /slotUsage: paletteMapping\?\.slotUsage/);
assert.match(processAll, /runtimeMs: paletteBuild\?\.runtimeMs/);
assert.match(processAll, /temporalPaletteMappings/);
assert.match(processAll, /sameGeometry \? OKLAB_TEMPORAL_EPSILON : 0/);
assert.match(processAll, /temporalStability:/);

const updatePaletteExperimentUi = extractInlineFunction(html, 'updatePaletteExperimentUi');
assert.match(updatePaletteExperimentUi, /paletteModeSel\?\.value === 'auto'/);
assert.match(updatePaletteExperimentUi, /paletteSamplingSel\.value = 'pixel'/);
assert.match(updatePaletteExperimentUi, /getPaletteReferenceValidation/);
assert.match(updatePaletteExperimentUi, /제한 없음 모드에서는 팔레트 생성 및 디더링 실험을 사용할 수 없습니다\./);
assert.match(updatePaletteExperimentUi, /직접 지정 모드에서는 팔레트 생성 알고리즘을 변경할 수 없으나, 디더링은 적용할 수 있습니다\./);

const updatePaletteReferenceOptions = extractInlineFunction(html, 'updatePaletteReferenceOptions');
assert.match(updatePaletteReferenceOptions, /\(동일 이름 \$\{duplicateCount\}개 — 사용 불가\)/);
assert.match(updatePaletteReferenceOptions, /\$\{desired\} \(누락\)/);

const applyUiSettings = extractInlineFunction(html, 'applyUiSettings');
assert.match(applyUiSettings, /updatePaletteReferenceOptions\(settings\.paletteReference \|\| ''\)/);
assert.match(applyUiSettings, /settings\.paletteAlgorithm \|\| 'kmeans-srgb'/);
assert.match(applyUiSettings, /settings\.paletteSampling \|\| 'pixel'/);

assert.match(html, /OKLab 오차 평균 \$\{paletteMeta\.error\.mean\.toFixed\(4\)\}/);
assert.match(html, /프레임 안정화 \$\{paletteMeta\.temporalStability\.heldPixels\}px/);
console.log('PAL-002 experimental UI, disabled states, reference errors, metadata, and settings wiring passed.');
