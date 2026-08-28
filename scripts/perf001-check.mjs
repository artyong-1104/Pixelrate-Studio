import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'pixelate_studio.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'pixelate-worker.js'), 'utf8');
const runnerUrl = new URL('./lib/perf001-node-worker-runner.mjs', import.meta.url);

function extractReferenceMapper() {
  const start = html.indexOf('function srgbChannelToLinear(value)');
  const end = html.indexOf('function collectOpaquePoints(', start);
  assert.ok(start >= 0 && end > start, 'production palette mapper source must be extractable');
  const nearestStart = html.indexOf('function nearestColorIndex(');
  const nearestEnd = html.indexOf('\n}', nearestStart) + 2;
  assert.ok(nearestStart >= 0 && nearestEnd > nearestStart, 'production nearest-color helper must be extractable');
  const context = vm.createContext({ console, Math, Number, Array, Object, Map, Set });
  vm.runInContext(`const MAX_PALETTE_SAMPLES = 50000;\n${html.slice(start, end)}\n${html.slice(nearestStart, nearestEnd)}\nglobalThis.__map = mapPixelsToPalette;`, context);
  return context.__map;
}

const referenceMap = extractReferenceMapper();
let parityJobId = 100;

function makeFixture(pixelCount, seed = 17) {
  const data = new Uint8ClampedArray(pixelCount * 4);
  const alpha = new Uint8Array(pixelCount);
  let state = seed >>> 0;
  for (let index = 0; index < pixelCount; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[index * 4] = state & 255;
    data[index * 4 + 1] = (state >>> 8) & 255;
    data[index * 4 + 2] = (state >>> 16) & 255;
    data[index * 4 + 3] = index % 19 === 0 ? 0 : 255;
    alpha[index] = data[index * 4 + 3];
  }
  return { data, alpha };
}

function stableDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function startWorkerRequest(request, transfer = []) {
  const worker = new Worker(runnerUrl, { type: 'module' });
  const messages = [];
  const terminal = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('worker response timeout')), 10000);
    worker.on('message', message => {
      messages.push(message);
      if (['result', 'error', 'cancelled'].includes(message.type)) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
    worker.on('error', reject);
  });
  worker.postMessage(request, transfer);
  return { worker, messages, terminal };
}

function waitForWorkerMessage(worker, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.off('message', onMessage);
      reject(new Error('worker message timeout'));
    }, timeoutMs);
    function onMessage(message) {
      if (!predicate(message)) return;
      clearTimeout(timeout);
      worker.off('message', onMessage);
      resolve(message);
    }
    worker.on('message', onMessage);
  });
}

function createMapRequest(jobId, pixelCount, width, seed = 37) {
  const palette = Array.from({ length: 16 }, (_, index) => [index * 17 % 256, index * 31 % 256, index * 47 % 256]);
  const { data, alpha } = makeFixture(pixelCount, seed);
  return {
    request: {
      type: 'process-stage', jobId, stage: 'palette-map',
      payload: { dataBuffer: data.buffer, alphaBuffer: alpha.buffer, previousGridBuffer: null, pixelCount, palette },
      settings: { algorithm: 'kmeans-srgb', threshold: 10, temporalEpsilon: 0, ditherMode: 'off', ditherStrength: 50, width }
    },
    transfer: [data.buffer, alpha.buffer]
  };
}

async function runParityCase({ algorithm, ditherMode, temporalEpsilon }) {
  const pixelCount = 4096;
  const width = 64;
  const palette = [[0, 0, 0], [255, 255, 255], [255, 0, 96], [0, 190, 255], [80, 220, 80]];
  const { data, alpha } = makeFixture(pixelCount, algorithm === 'kmeans-oklab' ? 23 : 19);
  const previousGrid = temporalEpsilon > 0 ? Int32Array.from({ length: pixelCount }, (_, index) => index % palette.length) : null;
  const reference = referenceMap(
    data,
    Array.from(alpha),
    pixelCount,
    palette,
    algorithm,
    10,
    previousGrid ? Array.from(previousGrid) : null,
    temporalEpsilon,
    ditherMode,
    50,
    width
  );
  const dataCopy = data.slice();
  const alphaCopy = alpha.slice();
  const transfer = [dataCopy.buffer, alphaCopy.buffer];
  const payload = {
    dataBuffer: dataCopy.buffer,
    alphaBuffer: alphaCopy.buffer,
    previousGridBuffer: previousGrid?.buffer || null,
    pixelCount,
    palette
  };
  if (previousGrid) transfer.push(previousGrid.buffer);
  const request = {
    type: 'process-stage',
    jobId: String(++parityJobId),
    stage: 'palette-map',
    payload,
    settings: { algorithm, threshold: 10, temporalEpsilon, ditherMode, ditherStrength: 50, width }
  };
  const running = startWorkerRequest(request, transfer);
  assert.equal(dataCopy.byteLength, 0, 'transferred RGBA buffer must detach on the sender');
  assert.equal(alphaCopy.byteLength, 0, 'transferred alpha buffer must detach on the sender');
  const terminal = await running.terminal;
  await running.worker.terminate();
  assert.equal(terminal.type, 'result');
  const progress = running.messages.filter(message => message.type === 'progress').map(message => message.percent);
  assert.deepEqual(progress, [...progress].sort((left, right) => left - right), 'progress must be monotonic');
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.every(percent => percent % 10 === 0));
  const actual = {
    grid: Array.from(new Int32Array(terminal.payload.gridBuffer)),
    slotCounts: Array.from(new Uint32Array(terminal.payload.slotCountsBuffer)),
    slotUsage: terminal.payload.slotUsage,
    temporalStabilityApplied: terminal.payload.temporalStabilityApplied,
    temporalEpsilon: terminal.payload.temporalEpsilon,
    temporalHeldCount: terminal.payload.temporalHeldCount,
    ditherApplied: terminal.payload.ditherApplied,
    ditherMode: terminal.payload.ditherMode,
    ditherStrength: terminal.payload.ditherStrength,
    error: terminal.payload.error
  };
  assert.equal(stableDigest(actual), stableDigest(reference), `${algorithm}/${ditherMode}/${temporalEpsilon} mapping must match production`);
  assert.ok(terminal.payload.performance.maxChunkMs >= 0);
  assert.ok(terminal.payload.performance.estimatedPeakBytes > 0);
}

await runParityCase({ algorithm: 'kmeans-srgb', ditherMode: 'off', temporalEpsilon: 0 });
await runParityCase({ algorithm: 'kmeans-oklab', ditherMode: 'off', temporalEpsilon: 0.005 });
await runParityCase({ algorithm: 'kmeans-srgb', ditherMode: 'bayer2', temporalEpsilon: 0 });
await runParityCase({ algorithm: 'kmeans-oklab', ditherMode: 'bayer4', temporalEpsilon: 0 });

{
  const invalid = startWorkerRequest({ type: 'process-stage', jobId: '7', stage: 'palette-map', payload: {}, settings: {} });
  const terminal = await invalid.terminal;
  assert.equal(terminal.type, 'error');
  assert.equal(terminal.code, 'INVALID_BUFFER');
  const retry = createMapRequest('8', 64 * 64, 64, 29);
  const retryTerminalPromise = waitForWorkerMessage(
    invalid.worker,
    message => message.jobId === retry.request.jobId && ['result', 'error', 'cancelled'].includes(message.type)
  );
  invalid.worker.postMessage(retry.request, retry.transfer);
  const retryTerminal = await retryTerminalPromise;
  await invalid.worker.terminate();
  assert.equal(retryTerminal.type, 'result', 'a valid retry after an invalid request must succeed on the same Worker');
}

// Cancel before start: a queued cancel for the same jobId must prevent result emission.
{
  const worker = new Worker(runnerUrl, { type: 'module' });
  const beforeStart = createMapRequest('9000000', 64 * 64, 64, 41);
  const terminalPromise = waitForWorkerMessage(worker, message =>
    message.jobId === beforeStart.request.jobId && ['result', 'error', 'cancelled'].includes(message.type));
  worker.postMessage({ type: 'cancel', jobId: beforeStart.request.jobId });
  worker.postMessage(beforeStart.request, beforeStart.transfer);
  const terminal = await terminalPromise;
  await worker.terminate();
  assert.equal(terminal.type, 'cancelled');
  assert.equal(terminal.reason, 'cancel-before-start');
}

// Cancel at start: the request and immediate cancel are delivered in order before a large result can complete.
{
  const worker = new Worker(runnerUrl, { type: 'module' });
  const atStart = createMapRequest('9000002', 1024 * 1024, 1024, 43);
  const messages = [];
  worker.on('message', message => messages.push(message));
  const terminalPromise = waitForWorkerMessage(worker, message =>
    message.jobId === atStart.request.jobId && ['result', 'error', 'cancelled'].includes(message.type));
  worker.postMessage(atStart.request, atStart.transfer);
  worker.postMessage({ type: 'cancel', jobId: atStart.request.jobId });
  const terminal = await terminalPromise;
  await worker.terminate();
  assert.equal(terminal.type, 'cancelled');
  assert.ok(!messages.some(message => message.type === 'result'), 'cancel-at-start must not emit a result');
}

{
  const pixelCount = 1024 * 1024;
  const width = 1024;
  const palette = Array.from({ length: 32 }, (_, index) => [index * 7 % 256, index * 13 % 256, index * 29 % 256]);
  const { data, alpha } = makeFixture(pixelCount, 31);
  const request = {
    type: 'process-stage', jobId: '9000001', stage: 'palette-map',
    payload: { dataBuffer: data.buffer, alphaBuffer: alpha.buffer, previousGridBuffer: null, pixelCount, palette },
    settings: { algorithm: 'kmeans-oklab', threshold: 10, temporalEpsilon: 0, ditherMode: 'off', ditherStrength: 50, width }
  };
  const running = startWorkerRequest(request, [data.buffer, alpha.buffer]);
  let cancelSentAt = 0;
  running.worker.on('message', message => {
    if (message.type === 'progress' && message.percent >= 10 && cancelSentAt === 0) {
      cancelSentAt = performance.now();
      running.worker.postMessage({ type: 'cancel', jobId: request.jobId });
    }
  });
  const terminal = await running.terminal;
  const observedLatency = performance.now() - cancelSentAt;
  await running.worker.terminate();
  assert.equal(terminal.type, 'cancelled');
  assert.ok(cancelSentAt > 0, 'cancellation must be sent during processing');
  assert.ok(observedLatency <= 100, `cancel response must arrive within 100ms (actual ${observedLatency.toFixed(3)}ms)`);
  assert.ok(!running.messages.some(message => message.type === 'result'), 'cancelled work must not emit a result');
}

// Cancel after completion: the Worker acknowledges the late cancel without changing the completed result.
{
  const afterComplete = createMapRequest('9000003', 64 * 64, 64, 47);
  const running = startWorkerRequest(afterComplete.request, afterComplete.transfer);
  const result = await running.terminal;
  assert.equal(result.type, 'result');
  const lateCancelPromise = waitForWorkerMessage(running.worker, message =>
    message.jobId === afterComplete.request.jobId && message.type === 'cancelled');
  running.worker.postMessage({ type: 'cancel', jobId: afterComplete.request.jobId });
  const lateCancel = await lateCancelPromise;
  await running.worker.terminate();
  assert.equal(lateCancel.reason, 'already-complete');
  assert.equal(lateCancel.alreadyCompleted, true);
  assert.equal(lateCancel.cancelLatencyMs, 0);
  assert.equal(running.messages.filter(message => message.type === 'result').length, 1, 'late cancel must not duplicate or replace the result');
}

assert.doesNotMatch(workerSource, /\b(?:importScripts|fetch|XMLHttpRequest|WebSocket)\s*\(/, 'worker must not load remote code or call the network');
assert.match(html, /new Worker\('pixelate-worker\.js'\)/, 'app must use one same-origin local worker');
assert.match(html, /activeProcessingJob !== job/, 'stale worker responses must be discarded');
assert.match(html, /worker\.postMessage\(\{ type:'cancel'/, 'worker cancel protocol must be wired');
assert.match(html, /setTimeout\(\(\) => settleReject\(new ProcessCancelledError\(reason\)\), 100\)/, 'worker must be terminated at the 100ms cancel deadline');
for(const reason of ['new-upload', 'file-removed', 're-run', 'reset', 'page-close']){
  assert.match(html, new RegExp(`cancelActiveProcessingJob\\('${reason}'\\)`), `active Worker job must be cancelled on ${reason}`);
}
assert.match(html, /window\.addEventListener\('beforeunload',[\s\S]*?controller => controller\.cancel\('page-close'\)/, 'page close must cancel every Worker controller');
assert.match(html, /globalThis\.__pixelatePerfLastReport = job\.report/, 'performance timings must stay in an internal report');
assert.doesNotMatch(html.slice(html.indexOf('const jsonData = {'), html.indexOf('const coverageAlphaEstimatedBytes')), /(?:wallTime|maxWorkerChunk|longTasks|maxInputDelay)/, 'nondeterministic PERF timings must not enter result JSON');

{
  const names = [
    'assertProcessingJobActive', 'yieldProcessingJob',
    'cleanIsolated', 'cleanIsolatedChunked', 'cleanPreserveSheet', 'cleanPreserveSheetChunked',
    'palettePointWeight', 'limitPalettePoints', 'srgbChannelToLinear', 'linearChannelToSrgb',
    'srgbToOklab', 'oklabToSrgb', 'dedupeAndBackfillPalette',
    'kmeans', 'kmeansChunked', 'kmeansOklab', 'kmeansOklabChunked',
    'resolveOutputAlpha', 'buildAlphaPolicyArtifacts', 'buildAlphaPolicyArtifactsChunked',
    'computeAlphaDiagnostics', 'computeAlphaDiagnosticsChunked'
  ];
  const asyncNames = new Set([
    'yieldProcessingJob', 'cleanIsolatedChunked', 'cleanPreserveSheetChunked',
    'kmeansChunked', 'kmeansOklabChunked', 'buildAlphaPolicyArtifactsChunked',
    'computeAlphaDiagnosticsChunked'
  ]);
  const extracted = extractInlineFunctions(html, names)
    .map((source, index) => asyncNames.has(names[index]) ? `async ${source}` : source);
  const context = vm.createContext({
    console, Math, Number, Array, Object, Map, Set, Error,
    Uint8Array, Uint8ClampedArray, Int32Array,
    scheduler:{ yield:async () => {} }, setTimeout
  });
  vm.runInContext(`
    const MAX_PALETTE_SAMPLES=50000;
    class ProcessCancelledError extends Error {}
    const job={cancelRequested:false};
    let activeProcessingJob=job;
    ${extracted.join('\n')}
    globalThis.api={${names.join(',')}};
    globalThis.job=job;
  `, context);
  const fixture = makeFixture(64 * 64, 71);
  const grid = Array.from({ length:64 * 64 }, (_, index) => fixture.alpha[index] < 10 ? -1 : index % 7);
  const alpha = Array.from(fixture.alpha);
  const cleaned = context.api.cleanIsolated(grid, alpha, 64, 64, 2, 10);
  const cleanedChunked = await context.api.cleanIsolatedChunked(context.job, grid, alpha, 64, 64, 2, 10);
  assert.equal(stableDigest(cleanedChunked), stableDigest(cleaned), 'chunked cleanup must match the synchronous cleanup');

  const sheetCleaned = context.api.cleanPreserveSheet(grid, alpha, 64, 64, 32, 32, 1, 10);
  const sheetChunked = await context.api.cleanPreserveSheetChunked(context.job, grid, alpha, 64, 64, 32, 32, 1, 10);
  assert.equal(stableDigest(sheetChunked), stableDigest(sheetCleaned), 'chunked sheet cleanup must match the synchronous cleanup');

  const points = Array.from({ length:12000 }, (_, index) => [fixture.data[index % 4096 * 4], fixture.data[index % 4096 * 4 + 1], fixture.data[index % 4096 * 4 + 2]]);
  const srgbPalette = context.api.kmeans(points, 16, 10);
  const srgbChunked = await context.api.kmeansChunked(context.job, points, 16, 10);
  assert.equal(stableDigest(srgbChunked), stableDigest(srgbPalette), 'chunked sRGB K-means must remain deterministic');
  const oklabPalette = context.api.kmeansOklab(points, 16, 10);
  const oklabChunked = await context.api.kmeansOklabChunked(context.job, points, 16, 10);
  assert.equal(stableDigest(oklabChunked), stableDigest(oklabPalette), 'chunked OKLab K-means must remain deterministic');

  const alphaArtifacts = context.api.buildAlphaPolicyArtifacts(grid, alpha, 64, 64, 'coverage', 10);
  const alphaChunked = await context.api.buildAlphaPolicyArtifactsChunked(context.job, grid, alpha, 64, 64, 'coverage', 10);
  assert.equal(stableDigest(alphaChunked), stableDigest(alphaArtifacts), 'chunked alpha artifacts must match the synchronous output');
  const diagnostics = context.api.computeAlphaDiagnostics(alpha, 64, 64, 32, 32, 10);
  const diagnosticsChunked = await context.api.computeAlphaDiagnosticsChunked(context.job, alpha, 64, 64, 32, 32, 10);
  assert.equal(stableDigest(diagnosticsChunked), stableDigest(diagnostics), 'chunked alpha diagnostics must match the synchronous output');

  for(const cleanupCase of [
    { jobId:'800001', frameWidth:64, frameHeight:64, expected:cleaned },
    { jobId:'800002', frameWidth:32, frameHeight:32, expected:sheetCleaned }
  ]){
    const workerGrid=Int32Array.from(grid);
    const workerAlpha=Uint8Array.from(alpha);
    const running=startWorkerRequest({
      type:'process-stage',jobId:cleanupCase.jobId,stage:'cleanup',
      payload:{gridBuffer:workerGrid.buffer,alphaBuffer:workerAlpha.buffer,pixelCount:grid.length},
      settings:{width:64,height:64,frameWidth:cleanupCase.frameWidth,frameHeight:cleanupCase.frameHeight,passes:cleanupCase.frameWidth===64?2:1,threshold:10}
    },[workerGrid.buffer,workerAlpha.buffer]);
    const terminal=await running.terminal;
    await running.worker.terminate();
    assert.equal(terminal.type,'result');
    assert.equal(terminal.stage,'cleanup');
    assert.equal(stableDigest(Array.from(new Int32Array(terminal.payload.gridBuffer))),stableDigest(cleanupCase.expected),'Worker cleanup must match production cleanup');
    const progress=running.messages.filter(message=>message.type==='progress').map(message=>message.percent);
    assert.equal(progress[0],0);
    assert.equal(progress.at(-1),100);
    assert.deepEqual(progress,[...progress].sort((left,right)=>left-right));
  }
}

console.log('PERF-001 checks passed: schema, worker and chunk parity hashes, transfer, progress, four-phase cancellation, retry, stale-result and network guards');
