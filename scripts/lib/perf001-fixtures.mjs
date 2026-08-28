import {
  FIXTURE_SEED,
  GENERATOR_VERSION,
  generateCorpus,
  sha256,
} from './pixel-fixtures.mjs';

export const PERF_FIXTURE_SOURCE_ID = 'texture-checker';
export const PERF_FIXTURE_DEFINITIONS = Object.freeze([
  Object.freeze({ id:'256K', side:512, pixels:512 * 512 }),
  Object.freeze({ id:'1M', side:1024, pixels:1024 * 1024 }),
  Object.freeze({ id:'4M', side:2048, pixels:2048 * 2048 }),
]);

const corpus = generateCorpus({ seed:FIXTURE_SEED, generatorVersion:GENERATOR_VERSION });
const sourceFixture = corpus.find(item => item.id === PERF_FIXTURE_SOURCE_ID);
if(!sourceFixture || sourceFixture.frames.length !== 1){
  throw new Error(`QLT source fixture ${PERF_FIXTURE_SOURCE_ID} must contain exactly one frame`);
}
const sourceRgba = sourceFixture.frames[0];

export function perfFixtureProvenance(){
  return {
    harness:'QLT-001',
    sourceFixtureId:sourceFixture.id,
    sourceWidth:sourceFixture.width,
    sourceHeight:sourceFixture.height,
    fixtureSeed:FIXTURE_SEED,
    generatorVersion:GENERATOR_VERSION,
    sourceRgbaSha256:sha256(sourceRgba),
    derivation:'repeat-tile from source origin (0,0); no resampling or color conversion',
  };
}

export function createPerfFixture(definitionOrSide){
  const definition = typeof definitionOrSide === 'number'
    ? PERF_FIXTURE_DEFINITIONS.find(item => item.side === definitionOrSide)
    : definitionOrSide;
  if(!definition || !Number.isInteger(definition.side) || definition.side <= 0){
    throw new TypeError('PERF fixture definition must provide a positive integer side');
  }

  const side = definition.side;
  const data = new Uint8ClampedArray(side * side * 4);
  for(let y=0; y<side; y++){
    const sourceY = y % sourceFixture.height;
    for(let x=0; x<side; x++){
      const sourceX = x % sourceFixture.width;
      const sourceIndex = (sourceY * sourceFixture.width + sourceX) * 4;
      const targetIndex = (y * side + x) * 4;
      data[targetIndex] = sourceRgba[sourceIndex];
      data[targetIndex + 1] = sourceRgba[sourceIndex + 1];
      data[targetIndex + 2] = sourceRgba[sourceIndex + 2];
      data[targetIndex + 3] = sourceRgba[sourceIndex + 3];
    }
  }

  const alpha = new Uint8Array(side * side);
  for(let index=0; index<alpha.length; index++) alpha[index] = data[index * 4 + 3];
  return {
    id:definition.id,
    side,
    pixels:side * side,
    data,
    alpha,
    rgbaSha256:sha256(data),
  };
}
