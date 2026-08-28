import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import {
  PERF_FIXTURE_DEFINITIONS,
  createPerfFixture,
  perfFixtureProvenance,
} from './lib/perf001-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(root, 'pixelizer-codex-research', 'evidence', 'perf-001');
const html = fs.readFileSync(path.join(root, 'pixelate_studio.html'), 'utf8');
const runnerUrl = new URL('./lib/perf001-node-worker-runner.mjs', import.meta.url);
fs.mkdirSync(evidenceDir, { recursive: true });

function extractReferenceMapper() {
  const start = html.indexOf('function srgbChannelToLinear(value)');
  const end = html.indexOf('function collectOpaquePoints(', start);
  const nearestStart = html.indexOf('function nearestColorIndex(');
  const nearestEnd = html.indexOf('\n}', nearestStart) + 2;
  assert.ok(start >= 0 && end > start && nearestStart >= 0 && nearestEnd > nearestStart);
  const context = vm.createContext({ console, Math, Number, Array, Object, Map, Set });
  vm.runInContext(`const MAX_PALETTE_SAMPLES = 50000;\n${html.slice(start, end)}\n${html.slice(nearestStart, nearestEnd)}\nglobalThis.__map = mapPixelsToPalette;`, context);
  return context.__map;
}

const referenceMap = extractReferenceMapper();
const palette = [
  [12, 18, 28], [36, 44, 62], [68, 76, 96], [106, 116, 134],
  [154, 164, 176], [218, 224, 228], [246, 238, 210], [244, 184, 82],
  [226, 104, 76], [186, 62, 88], [122, 56, 112], [72, 70, 138],
  [54, 108, 154], [58, 156, 148], [92, 188, 112], [164, 206, 104]
];

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function round(value) {
  return Number(value.toFixed(3));
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function outputHashes(mapping, alpha) {
  const grid = Int32Array.from(mapping.grid);
  const output = new Uint8Array(grid.length * 4);
  for(let index=0; index<grid.length; index++){
    const paletteIndex = grid[index];
    if(paletteIndex < 0 || alpha[index] < 10) continue;
    output.set([...palette[paletteIndex], alpha[index]], index * 4);
  }
  return {
    rgba:hash(output),
    palette:hash(Buffer.from(JSON.stringify(palette))),
    resultJson:hash(Buffer.from(JSON.stringify({ width:Math.sqrt(grid.length), height:Math.sqrt(grid.length), palette, grid:Array.from(grid) })))
  };
}

function runMain(fixture) {
  const startedAt = performance.now();
  const mapping = referenceMap(fixture.data, Array.from(fixture.alpha), fixture.alpha.length, palette, 'kmeans-srgb', 10, null, 0, 'off', 50, Math.sqrt(fixture.alpha.length));
  const wallTimeMs = performance.now() - startedAt;
  return {
    wallTimeMs,
    maxMainTaskMs:wallTimeMs,
    estimatedPeakBytes:fixture.data.byteLength + fixture.alpha.byteLength + fixture.alpha.length * 4 + palette.length * 4,
    hashes:outputHashes(mapping, fixture.alpha)
  };
}

function runWorker(fixture, jobId) {
  const worker = new Worker(runnerUrl, { type:'module' });
  const startedAt = performance.now();
  const data = fixture.data.slice();
  const alpha = fixture.alpha.slice();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('worker benchmark timeout')), 30000);
    worker.on('message', message => {
      if(message.jobId !== jobId || message.type === 'progress') return;
      clearTimeout(timeout);
      if(message.type !== 'result'){
        worker.terminate();
        reject(new Error(`worker benchmark ended with ${message.type}:${message.code || message.reason || 'unknown'}`));
        return;
      }
      const mapping = { grid:Array.from(new Int32Array(message.payload.gridBuffer)) };
      const returnedAlpha = new Uint8Array(message.payload.alphaBuffer);
      resolve({
        wallTimeMs:performance.now() - startedAt,
        maxMainTaskMs:message.payload.performance.maxChunkMs,
        estimatedPeakBytes:message.payload.performance.estimatedPeakBytes,
        hashes:outputHashes(mapping, returnedAlpha),
        workerPerformance:message.payload.performance
      });
      worker.terminate();
    });
    worker.on('error', reject);
    worker.postMessage({
      type:'process-stage', jobId, stage:'palette-map',
      payload:{ dataBuffer:data.buffer, alphaBuffer:alpha.buffer, previousGridBuffer:null, pixelCount:alpha.length, palette },
      settings:{ algorithm:'kmeans-srgb', threshold:10, temporalEpsilon:0, ditherMode:'off', ditherStrength:50, width:Math.sqrt(alpha.length) }
    }, [data.buffer, alpha.buffer]);
  });
}

const cases = [];
let jobCounter = 2000000;

for(const definition of PERF_FIXTURE_DEFINITIONS){
  const fixture = createPerfFixture(definition);
  const mainRuns = [];
  const workerRuns = [];
  for(let runIndex=0; runIndex<6; runIndex++){
    mainRuns.push(runMain(fixture));
    workerRuns.push(await runWorker(fixture, String(++jobCounter)));
  }
  for(let runIndex=0; runIndex<6; runIndex++){
    assert.deepEqual(workerRuns[runIndex].hashes, mainRuns[runIndex].hashes, `${definition.id} run ${runIndex} hash mismatch`);
  }
  const mainWarm = mainRuns.slice(1).map(run => run.wallTimeMs);
  const workerWarm = workerRuns.slice(1).map(run => run.wallTimeMs);
  const mainMedian = percentile(mainWarm, 0.5);
  const workerMedian = percentile(workerWarm, 0.5);
  cases.push({
    fixture:{
      id:definition.id,
      width:definition.side,
      height:definition.side,
      pixels:definition.pixels,
      rgbaBytes:definition.pixels * 4,
      rgbaSha256:fixture.rgbaSha256,
      sourceFixtureId:perfFixtureProvenance().sourceFixtureId,
    },
    algorithm:{ palette:'fixed-16', mapping:'kmeans-srgb', dither:'off', alphaThreshold:10 },
    baseline:{
      coldMs:round(mainRuns[0].wallTimeMs),
      warmMs:mainWarm.map(round),
      medianMs:round(mainMedian),
      p95Ms:round(percentile(mainWarm, 0.95)),
      synchronousStageOver100msCount:mainWarm.filter(value => value > 100).length,
      estimatedPeakBytes:Math.max(...mainRuns.map(run => run.estimatedPeakBytes))
    },
    worker:{
      coldMs:round(workerRuns[0].wallTimeMs),
      warmMs:workerWarm.map(round),
      medianMs:round(workerMedian),
      p95Ms:round(percentile(workerWarm, 0.95)),
      wallTimeChangePercent:round((workerMedian / mainMedian - 1) * 100),
      maxChunkMs:round(Math.max(...workerRuns.map(run => run.workerPerformance.maxChunkMs))),
      estimatedPeakBytes:Math.max(...workerRuns.map(run => run.estimatedPeakBytes))
    },
    equality:{ allRunsMatch:true, hashes:mainRuns[0].hashes }
  });
}

const oneMillion = cases.find(item => item.fixture.id === '1M');
const fourMillion = cases.find(item => item.fixture.id === '4M');
const report = {
  schemaVersion:1,
  itemId:'PERF-001',
  generatedAt:new Date().toISOString(),
  environment:{ runtime:process.version, platform:process.platform, architecture:process.arch, timing:'node perf_hooks; browser QA recorded separately' },
  protocol:{
    coldRuns:1,
    warmRuns:5,
    stages:['decode','downscale','grid','palette','map','cleanup','outline','export'],
    selectedPureStage:'map',
    fixtureProvenance:perfFixtureProvenance(),
  },
  gate:{
    workerRequired:oneMillion.baseline.synchronousStageOver100msCount >= 3,
    reason:`1M warm runs over 100ms: ${oneMillion.baseline.synchronousStageOver100msCount}/5`,
    threshold:'same 1M warm fixture exceeds 100ms in at least 3/5 runs'
  },
  acceptance:{
    hashesMatch:cases.every(item => item.equality.allRunsMatch),
    mainThreadChunkBelow50ms:cases.every(item => item.worker.maxChunkMs < 50),
    workerWallWithin20Percent:cases.every(item => item.worker.wallTimeChangePercent < 20),
    cancelUnder100ms:'covered-by scripts/perf001-check.mjs and browser QA',
    passed:false
  },
  wasmDecision:{
    worker4MMedianMs:fourMillion.worker.medianMs,
    worker4MPeakBytes:fourMillion.worker.estimatedPeakBytes,
    gateTriggered:fourMillion.worker.medianMs > 2000 || fourMillion.worker.estimatedPeakBytes > 256 * 1024 * 1024,
    decision:null
  },
  cases
};
report.acceptance.passed = report.acceptance.hashesMatch && report.acceptance.mainThreadChunkBelow50ms && report.acceptance.workerWallWithin20Percent;
report.wasmDecision.decision = report.wasmDecision.gateTriggered
  ? 'PoC evaluation may be specified separately; no production WASM is included in PERF-001.'
  : 'Do not adopt WASM; the JS Worker remains below both 4M gates.';

fs.writeFileSync(path.join(evidenceDir, 'benchmark-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  gate:report.gate,
  acceptance:report.acceptance,
  wasmDecision:report.wasmDecision,
  summaries:cases.map(item => ({ id:item.fixture.id, mainMedianMs:item.baseline.medianMs, workerMedianMs:item.worker.medianMs, changePercent:item.worker.wallTimeChangePercent, maxChunkMs:item.worker.maxChunkMs }))
}, null, 2));

if(!report.acceptance.passed) process.exitCode = 1;
