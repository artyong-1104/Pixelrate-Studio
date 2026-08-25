import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';
import {
  encodePng,
  generateCorpus,
  sha256,
  stableStringify,
  FIXTURE_SEED,
  GENERATOR_VERSION
} from './lib/pixel-fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'pal-002');
const assetDir = path.resolve(evidenceDir, 'browser-manual-assets');
const htmlSource = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
fs.mkdirSync(assetDir, { recursive: true });

const functionNames = [
  'kmeans', 'palettePointWeight', 'limitPalettePoints', 'srgbChannelToLinear',
  'linearChannelToSrgb', 'srgbToOklab', 'oklabToSrgb', 'dedupeAndBackfillPalette',
  'kmeansOklab', 'getMedianCutBoxInfo', 'medianCut', 'generatePaletteFromPoints',
  'collectPaletteSamples', 'nearestOklabIndex', 'nearestColorIndex', 'mapPixelsToPalette'
];
const context = vm.createContext({
  Array, Date, Infinity, Map, Math, Number, Object, Set, String,
  MAX_PALETTE_SAMPLES: 50000
});
vm.runInContext(
  `${functionNames.map(name => extractInlineFunction(htmlSource, name)).join('\n')}\n` +
  `globalThis.__api = { ${functionNames.join(',')} };`,
  context,
  { timeout: 5000 }
);
const api = context.__api;

function fixtureDowns(fixture){
  return fixture.frames.map((data, frameIndex) => ({
    name: fixture.frames.length === 1
      ? `${fixture.id}.png`
      : `${fixture.id}-${String(frameIndex).padStart(2, '0')}.png`,
    addedIndex: frameIndex,
    data,
    w: fixture.width,
    h: fixture.height
  }));
}

function scaleNearestDown(down, width, height){
  const data = new Uint8ClampedArray(width * height * 4);
  for(let y=0; y<height; y++){
    const sourceY = Math.min(down.h - 1, Math.floor(y * down.h / height));
    for(let x=0; x<width; x++){
      const sourceX = Math.min(down.w - 1, Math.floor(x * down.w / width));
      const sourceOffset = (sourceY * down.w + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      data.set(down.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { ...down, data, w: width, h: height };
}

function renderMapped(down, palette, algorithm, previousGrid=null, temporalEpsilon=0){
  const alpha = Array.from({ length: down.w * down.h }, (_, index) => down.data[index * 4 + 3]);
  const mapping = api.mapPixelsToPalette(
    down.data,
    alpha,
    down.w * down.h,
    palette,
    algorithm,
    10,
    previousGrid,
    temporalEpsilon
  );
  const rgba = new Uint8ClampedArray(down.w * down.h * 4);
  for(let index=0; index<mapping.grid.length; index++){
    const paletteIndex = mapping.grid[index];
    if(paletteIndex < 0) continue;
    const color = palette[paletteIndex];
    rgba[index * 4] = color[0];
    rgba[index * 4 + 1] = color[1];
    rgba[index * 4 + 2] = color[2];
    rgba[index * 4 + 3] = alpha[index];
  }
  return { rgba, grid: mapping.grid, error: mapping.error, slotUsage: mapping.slotUsage };
}

function compositeFrames(rendered, downs){
  const width = Math.max(...downs.map(down => down.w));
  const height = downs.reduce((sum, down) => sum + down.h, 0);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let top = 0;
  for(let index=0; index<downs.length; index++){
    const down = downs[index];
    const frame = rendered[index].rgba;
    for(let y=0; y<down.h; y++){
      rgba.set(frame.subarray(y * down.w * 4, (y + 1) * down.w * 4), ((top + y) * width) * 4);
    }
    top += down.h;
  }
  return { width, height, frames: [rgba] };
}

function writeFrames(groupId, colors, variantId, rendered, downs){
  const composite = groupId === 'large-small'
    ? compositeFrames(rendered, downs)
    : { width: downs[0].w, height: downs[0].h, frames: rendered.map(item => item.rgba) };
  const paths = composite.frames.map((rgba, frameIndex) => {
    const name = `${groupId}-${colors}-${variantId}-${String(frameIndex).padStart(2, '0')}.png`;
    const bytes = encodePng(composite.width, composite.height, rgba);
    fs.writeFileSync(path.resolve(assetDir, name), bytes);
    return {
      src: `browser-manual-assets/${name}`,
      sha256: sha256(bytes)
    };
  });
  return { width: composite.width, height: composite.height, frames: paths };
}

const corpus = generateCorpus({ seed: FIXTURE_SEED, generatorVersion: GENERATOR_VERSION });
const gradient = fixtureDowns(corpus.find(item => item.id === 'gradient-gray'));
const sprite = fixtureDowns(corpus.find(item => item.id === 'clean-pixel-art'));
const photo = fixtureDowns(corpus.find(item => item.id === 'photo-like'));
const animation = fixtureDowns(corpus.find(item => item.id === 'animation-16'));
for(const [frameIndex, frame] of animation.entries()){
  const sourceName = `source-animation-${String(frameIndex).padStart(2, '0')}.png`;
  fs.writeFileSync(path.resolve(assetDir, sourceName), encodePng(frame.w, frame.h, frame.data));
}
const background = scaleNearestDown(gradient[0], 512, 256);
background.name = 'background.png';
background.addedIndex = 0;
const character = { ...sprite[0], name: 'character.png', addedIndex: 1 };
const groups = [
  { id: 'gradient', label: 'gradient', downs: gradient, feature: 'banding과 단계 전환' },
  { id: 'sprite', label: 'clean pixel art', downs: sprite, feature: '실루엣·눈·색 영역 식별성' },
  { id: 'photo', label: 'photo-like', downs: photo, feature: '큰 색면·저대비 세부 생존' },
  { id: 'large-small', label: 'large background + small character', downs: [background, character], feature: '작은 캐릭터 색 영역 생존' },
  { id: 'animation', label: '16-frame animation', downs: animation, feature: '정적 영역 안정성과 frame flicker' }
];
const algorithms = [
  { id: 'baseline', label: 'sRGB K-means / pixel', algorithm: 'kmeans-srgb', sampling: 'pixel', reference: null },
  { id: 'oklab', label: 'OKLab K-means / pixel', algorithm: 'kmeans-oklab', sampling: 'pixel', reference: null },
  { id: 'median', label: 'MedianCut / pixel', algorithm: 'median-cut', sampling: 'pixel', reference: null }
];
const samplingVariants = [
  algorithms[0],
  { id: 'balanced', label: 'sRGB K-means / image-balanced', algorithm: 'kmeans-srgb', sampling: 'image-balanced', reference: null },
  { id: 'reference', label: 'sRGB K-means / reference character', algorithm: 'kmeans-srgb', sampling: 'reference', reference: 'character.png' }
];
const colorCounts = [8, 16, 32, 64];
const cells = [];
for(const group of groups){
  const variants = group.id === 'large-small' ? samplingVariants : algorithms;
  for(const colors of colorCounts){
    const outputs = [];
    for(const variant of variants){
      const points = api.collectPaletteSamples(group.downs, variant.sampling, variant.reference, 50000, 10, false);
      const palette = api.generatePaletteFromPoints(points, colors, variant.algorithm, 10);
      const rendered = [];
      let previousGrid = null;
      for(const down of group.downs){
        const stabilize = group.id === 'animation' && variant.algorithm === 'kmeans-oklab' && previousGrid !== null;
        const frame = renderMapped(down, palette, variant.algorithm, previousGrid, stabilize ? 0.00025 : 0);
        rendered.push(frame);
        previousGrid = frame.grid;
      }
      const artifact = writeFrames(group.id, colors, variant.id, rendered, group.downs);
      outputs.push({
        id: variant.id,
        label: variant.label,
        paletteSize: palette.length,
        sampleCount: points.length,
        meanError: Number((rendered.reduce((sum, item) => sum + item.error.mean, 0) / rendered.length).toFixed(6)),
        ...artifact
      });
    }
    cells.push({
      id: `${group.id}-${colors}`,
      group: group.id,
      groupLabel: group.label,
      colors,
      feature: group.feature,
      animation: group.id === 'animation',
      outputs
    });
  }
}

const manifest = {
  implementationId: 'PAL-002',
  oklabTemporalEpsilon: 0.00025,
  fixtureSeed: FIXTURE_SEED,
  generatorVersion: GENERATOR_VERSION,
  actualSizeScale: 1,
  expectedGroups: groups.map(group => group.id),
  expectedColorCounts: colorCounts,
  cellCount: cells.length,
  cells
};
fs.writeFileSync(path.resolve(evidenceDir, 'browser-manual-matrix.json'), `${stableStringify(manifest)}\n`);

const page = `<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PAL-002 actual-size browser QA matrix</title>
<style>
  :root{font-family:system-ui,sans-serif;color-scheme:dark;background:#11131a;color:#f4f7ff}
  body{margin:0;padding:20px}h1{font-size:22px;margin:0 0 8px}p{color:#b8c1d8}
  nav{position:sticky;top:0;z-index:2;background:#11131a;padding:8px 0 12px;display:flex;gap:8px;flex-wrap:wrap}
  button{border:1px solid #53607d;background:#202637;color:#fff;border-radius:7px;padding:7px 10px}
  button[aria-pressed=true]{background:#5a50db}.cell{border:1px solid #343c50;border-radius:10px;padding:12px;margin:12px 0;background:#181d29}
  h2{font-size:17px;margin:0 0 6px}.feature{font-size:13px;color:#bdc8e2}.outputs{display:flex;align-items:flex-start;gap:14px;overflow:auto;padding:8px 0}
  figure{margin:0;min-width:max-content}figcaption{font-size:12px;margin-bottom:5px;color:#dbe3f6}
  .stage{display:flex;align-items:flex-start;gap:10px;padding:8px;background-color:#aab0bd;background-image:linear-gradient(45deg,#777 25%,transparent 25%),linear-gradient(-45deg,#777 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#777 75%),linear-gradient(-45deg,transparent 75%,#777 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
  img.actual{display:block;image-rendering:pixelated;max-width:none}.zoom{display:block;image-rendering:pixelated;width:256px;height:256px;object-fit:contain;object-position:left top;background:#9298a6}
  body.compact .zoom{display:none}
  .metric{font-size:11px;color:#a9b4cf;margin-top:4px}.hidden{display:none}
</style>
<body>
<h1>PAL-002 actual-size A/B matrix</h1>
<p>왼쪽 이미지는 CSS 확대가 없는 1× 결과이며, 오른쪽은 판독 보조용 256px nearest 확대다. 애니메이션은 250ms 간격으로 동일 frame index를 순환한다.</p>
<nav id="filters"></nav><main id="matrix"></main>
<script>
const manifest = ${JSON.stringify(manifest)};
const params = new URLSearchParams(location.search);
let selected = params.get('group') || manifest.expectedGroups[0];
const variantFilter = new Set((params.get('variants') || '').split(',').filter(Boolean));
if(params.get('compact') === '1') document.body.classList.add('compact');
const filters = document.getElementById('filters');
const matrix = document.getElementById('matrix');
function render(){
  filters.replaceChildren(...manifest.expectedGroups.map(group => {
    const button = document.createElement('button');
    button.textContent = group;
    button.setAttribute('aria-pressed', String(group === selected));
    button.onclick = () => { selected = group; history.replaceState(null,'','?group='+group); render(); };
    return button;
  }));
  matrix.replaceChildren(...manifest.cells.filter(cell => cell.group === selected).map(cell => {
    const section = document.createElement('section'); section.className='cell'; section.dataset.cellId=cell.id;
    const title = document.createElement('h2'); title.textContent=cell.groupLabel+' — '+cell.colors+' colors';
    const feature = document.createElement('div'); feature.className='feature'; feature.textContent='관찰 항목: '+cell.feature;
    const outputs = document.createElement('div'); outputs.className='outputs';
    for(const output of cell.outputs.filter(output => variantFilter.size === 0 || variantFilter.has(output.id))){
      const figure=document.createElement('figure');
      const caption=document.createElement('figcaption'); caption.textContent=output.label;
      const stage=document.createElement('div'); stage.className='stage';
      const actual=document.createElement('img'); actual.className='actual'; actual.width=output.width; actual.height=output.height; actual.alt=cell.id+' '+output.id+' actual size';
      const zoom=document.createElement('img'); zoom.className='zoom'; zoom.alt=cell.id+' '+output.id+' enlarged inspection';
      const sources=output.frames.map(frame => frame.src); actual.src=sources[0]; zoom.src=sources[0];
      actual.dataset.frames=JSON.stringify(sources); zoom.dataset.frames=JSON.stringify(sources);
      stage.append(actual,zoom);
      const metric=document.createElement('div'); metric.className='metric'; metric.textContent='1× '+output.width+'×'+output.height+' · palette '+output.paletteSize+' · mean '+output.meanError;
      figure.append(caption,stage,metric); outputs.append(figure);
    }
    section.append(title,feature,outputs); return section;
  }));
}
setInterval(() => {
  const frame = Math.floor(performance.now()/250);
  for(const image of document.querySelectorAll('img[data-frames]')){
    const sources=JSON.parse(image.dataset.frames); image.src=sources[frame % sources.length];
  }
},250);
render();
</script>
</body></html>`;
fs.writeFileSync(path.resolve(evidenceDir, 'browser-manual-matrix.html'), page);
console.log(`PAL-002 browser matrix generated: cells=${cells.length} assets=${cells.reduce((sum, cell) => sum + cell.outputs.reduce((n, output) => n + output.frames.length, 0), 0)}`);
