import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/pixel-fixtures.mjs';
import {
  PERF_FIXTURE_DEFINITIONS,
  createPerfFixture,
  perfFixtureProvenance,
} from './lib/perf001-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(root, 'pixelizer-codex-research', 'evidence', 'perf-001');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertArtifact(relativePath, expectedHash) {
  const filePath = path.join(evidenceDir, relativePath);
  assert.ok(fs.existsSync(filePath), `missing evidence artifact: ${relativePath}`);
  assert.equal(sha256(filePath), expectedHash, `evidence hash mismatch: ${relativePath}`);
}

function findWasmFiles(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) findWasmFiles(entryPath, found);
    else if (entry.name.endsWith('.wasm')) found.push(path.relative(root, entryPath));
  }
  return found;
}

const benchmark = readJson('pixelizer-codex-research/evidence/perf-001/benchmark-report.json');
const browser = readJson('pixelizer-codex-research/evidence/perf-001/browser-qa.json');
const fixtureManifest = readJson('pixelizer-codex-research/evidence/perf-001/browser-fixtures/manifest.json');
const htmlPath = path.join(root, 'pixelate_studio.html');
const workerPath = path.join(root, 'pixelate-worker.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');

assert.equal(benchmark.itemId, 'PERF-001');
assert.equal(benchmark.protocol.coldRuns, 1);
assert.equal(benchmark.protocol.warmRuns, 5);
assert.equal(benchmark.protocol.selectedPureStage, 'map');
assert.deepEqual(benchmark.protocol.stages, ['decode', 'downscale', 'grid', 'palette', 'map', 'cleanup', 'outline', 'export']);
assert.deepEqual(benchmark.protocol.fixtureProvenance, perfFixtureProvenance(), 'benchmark must identify the current QLT source fixture');
assert.equal(benchmark.gate.workerRequired, true, '1M baseline must cross the Worker gate');
assert.match(benchmark.gate.reason, /5\/5/);
assert.equal(benchmark.acceptance.hashesMatch, true);
assert.equal(benchmark.acceptance.mainThreadChunkBelow50ms, true);
assert.equal(benchmark.acceptance.workerWallWithin20Percent, true);
assert.equal(benchmark.acceptance.passed, true);
assert.equal(benchmark.wasmDecision.gateTriggered, false);
assert.ok(benchmark.wasmDecision.worker4MMedianMs <= 2000);
assert.ok(benchmark.wasmDecision.worker4MPeakBytes <= 256 * 1024 * 1024);

assert.equal(browser.itemId, 'PERF-001');
assert.equal(browser.overallStatus, 'PASS');
assert.match(browser.runDateKst, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(browser.applicationSha256, sha256(htmlPath), 'browser QA is stale for pixelate_studio.html');
assert.equal(browser.workerSha256, sha256(workerPath), 'browser QA is stale for pixelate-worker.js');
assert.equal(browser.fixtureManifest.file, 'browser-fixtures/manifest.json');
assertArtifact(browser.fixtureManifest.file, browser.fixtureManifest.sha256);
assert.equal(fixtureManifest.itemId, 'PERF-001');
assert.deepEqual(fixtureManifest.provenance, perfFixtureProvenance(), 'browser fixtures must identify the current QLT source fixture');
assert.deepEqual(browser.fixtureProvenance, fixtureManifest.provenance, 'browser QA must bind the QLT fixture provenance');
assert.equal(browser.measurementSources.longTasks, 'browser PerformanceObserver longtask entries');
assert.equal(browser.measurementSources.heap, 'performance.memory.usedJSHeapSize when exposed by Chromium');
assert.match(browser.measurementSources.workerTermination, /100ms controller termination deadline/);
assert.match(browser.measurementSources.trace, /not a raw DevTools sampling trace/);

for (const definition of PERF_FIXTURE_DEFINITIONS) {
  const generated = createPerfFixture(definition);
  const expectedPng = encodePng(definition.side, definition.side, generated.data);
  const manifestFixture = fixtureManifest.fixtures[definition.id];
  const benchmarkFixture = benchmark.cases.find(item => item.fixture.id === definition.id)?.fixture;
  const browserFixture = browser.fixtures[definition.id];
  assert.ok(manifestFixture, `missing fixture manifest entry: ${definition.id}`);
  assert.ok(benchmarkFixture, `missing benchmark fixture entry: ${definition.id}`);
  assert.ok(browserFixture, `missing browser fixture entry: ${definition.id}`);
  assert.equal(manifestFixture.rgbaSha256, generated.rgbaSha256, `${definition.id} manifest RGBA is not QLT-derived`);
  assert.equal(manifestFixture.pngSha256, sha256Bytes(expectedPng), `${definition.id} manifest PNG is not QLT-derived`);
  assert.equal(manifestFixture.bytes, expectedPng.byteLength, `${definition.id} manifest PNG size mismatch`);
  assert.equal(benchmarkFixture.rgbaSha256, generated.rgbaSha256, `${definition.id} benchmark is not QLT-derived`);
  assert.equal(benchmarkFixture.sourceFixtureId, fixtureManifest.provenance.sourceFixtureId);
  assert.equal(browserFixture.rgbaSha256, generated.rgbaSha256, `${definition.id} browser QA is not QLT-derived`);
  assert.equal(browserFixture.sha256, manifestFixture.pngSha256, `${definition.id} browser PNG hash differs from manifest`);
  assert.equal(browserFixture.bytes, manifestFixture.bytes, `${definition.id} browser PNG size differs from manifest`);
}

for (const fixture of Object.values(browser.fixtures)) {
  assertArtifact(fixture.file, fixture.sha256);
}
for (const [fileName, capture] of Object.entries(browser.captures)) {
  assertArtifact(fileName, capture.sha256);
  assert.ok(capture.width > 0 && capture.height > 0, `invalid capture dimensions: ${fileName}`);
  if(fileName.endsWith('.jpg')){
    assert.deepEqual([...fs.readFileSync(path.join(evidenceDir, fileName)).subarray(0, 2)], [0xff, 0xd8], `capture must be JPEG: ${fileName}`);
  }
}
assertArtifact(browser.cancelVideo.video.file, browser.cancelVideo.video.sha256);
const cancelVideoPath = path.join(evidenceDir, browser.cancelVideo.video.file);
assert.equal(fs.statSync(cancelVideoPath).size, browser.cancelVideo.video.bytes);
assert.equal(fs.readFileSync(cancelVideoPath).subarray(4, 8).toString('ascii'), 'ftyp', 'cancel video must be an MP4 file');
assert.equal(browser.cancelVideo.video.codec, 'h264');
assert.equal(browser.cancelVideo.video.frames, 5);
assert.equal(browser.cancelVideo.video.durationSeconds, 5);
for (const [fileName, expectedHash] of Object.entries(browser.cancelVideo.sourceFrames)) {
  assertArtifact(fileName, expectedHash);
  assert.deepEqual([...fs.readFileSync(path.join(evidenceDir, fileName)).subarray(0, 2)], [0xff, 0xd8], `cancel frame must be JPEG: ${fileName}`);
}
assertArtifact(browser.performanceTrace.file, browser.performanceTrace.sha256);
const performanceTrace = JSON.parse(fs.readFileSync(path.join(evidenceDir, browser.performanceTrace.file), 'utf8'));
assert.equal(performanceTrace.traceFormat, 'Chrome Trace Event Format');
assert.equal(performanceTrace.itemId, 'PERF-001');
assert.equal(performanceTrace.source.applicationSha256, browser.applicationSha256);
assert.equal(performanceTrace.source.workerSha256, browser.workerSha256);
assert.deepEqual(performanceTrace.source.fixtureProvenance, browser.fixtureProvenance);
assert.equal(performanceTrace.traceEvents.length, browser.performanceTrace.events);
assert.equal(performanceTrace.traceEvents.filter(event => event.name === 'pipeline').length, browser.performanceTrace.pipelineRuns);
assert.equal(performanceTrace.traceEvents.filter(event => event.cat === 'PERF-001.stage').length, browser.performanceTrace.stageEvents);

for (const fixtureId of ['256K', '1M', '4M']) {
  const run = browser.completionRuns[fixtureId];
  assert.equal(run.resultCount, 1, `${fixtureId} completion must publish exactly one result`);
  assert.equal(run.workerUsed, true, `${fixtureId} must use the measured Worker path`);
  assert.ok(run.maxWorkerChunkMs < 50, `${fixtureId} Worker chunk exceeded 50ms`);
  assert.ok(run.maxInputDelayMs < 100, `${fixtureId} input delay exceeded 100ms`);
  assert.equal(run.longTaskCount, 0, `${fixtureId} reported a main-thread long task`);
  assert.ok(run.wallTimeMs > 0);
  assert.deepEqual(Object.keys(run.stagesMs), ['decode', 'downscale', 'grid', 'palette', 'map', 'cleanup', 'outline', 'export']);
}

assert.equal(browser.cancellation.outcome, 'cancelled');
assert.ok(browser.cancellation.cancelToTerminalMs <= 100, 'browser cancel exceeded 100ms');
assert.ok(browser.cancellation.workerCancelLatencyMs <= 100, 'Worker cancel exceeded 100ms');
assert.equal(browser.cancellation.resultCount, 0);
assert.equal(browser.cancellation.partialResultPersisted, false);
assert.equal(browser.cancellation.runButtonRestored, true);
assert.equal(browser.cancelVideo.outcome, 'cancelled');
assert.equal(browser.cancelVideo.capturedDateKst, browser.runDateKst);
assert.equal(browser.cancelVideo.inputPixels, 4 * 1024 * 1024);
assert.equal(browser.cancelVideo.workerUsed, true);
assert.ok(browser.cancelVideo.cancelToTerminalMs <= 100, 'recorded cancel video exceeded 100ms');
assert.ok(browser.cancelVideo.workerCancelLatencyMs <= 100, 'recorded cancel video Worker stop exceeded 100ms');
assert.ok(browser.cancelVideo.maxWorkerChunkMs < 50);
assert.ok(browser.cancelVideo.maxInputDelayMs < 100);
assert.equal(browser.cancelVideo.longTaskCount, 0);
assert.equal(browser.cancelVideo.resultCount, 0);
assert.equal(browser.cancelVideo.partialResultPersisted, false);
assert.match(browser.cancelVideo.frameStatuses.at(-1), /^취소됨/);

assert.notEqual(browser.immediateRerun.afterCancelledProcessId, browser.immediateRerun.completedProcessId);
assert.equal(browser.immediateRerun.resultCount, 1);
assert.equal(browser.immediateRerun.staleResultApplied, false);

assert.equal(browser.selectedTabSwitch.selectedTabBefore, browser.selectedTabSwitch.originalTab);
assert.notEqual(browser.selectedTabSwitch.selectedTabDuring, browser.selectedTabSwitch.originalTab);
assert.equal(browser.selectedTabSwitch.selectedTabAfter, browser.selectedTabSwitch.originalTab);
assert.equal(browser.selectedTabSwitch.resultCount, 1);
assert.equal(browser.selectedTabSwitch.longTaskCount, 0);

assert.deepEqual(browser.mobile.viewport, [390, 844]);
assert.equal(browser.mobile.horizontalOverflow, false);
assert.ok(browser.mobile.documentScrollWidth <= browser.mobile.viewport[0]);
assert.equal(browser.mobile.resultCount, 1);

assert.equal(browser.workerFailure.outcome, 'failed');
assert.equal(browser.workerFailure.errorCode, 'WORKER_RUNTIME_ERROR');
assert.equal(browser.workerFailure.resultCount, 0);
assert.equal(browser.workerFailure.silentMainThreadFallback, false);
assert.equal(browser.workerFailure.runButtonRestored, true);
assert.equal(browser.workerFailure.userVisibleStack, false);
assert.equal(browser.console.normalErrorsOrWarnings, 0);
assert.equal(browser.wasmDecision.worker4MMedianMs, benchmark.wasmDecision.worker4MMedianMs);
assert.equal(browser.wasmDecision.worker4MPeakBytes, benchmark.wasmDecision.worker4MPeakBytes);
assert.equal(browser.wasmDecision.gateTriggered, benchmark.wasmDecision.gateTriggered);
assert.equal(browser.wasmDecision.decision, benchmark.wasmDecision.decision);

const keyboardHarnessHtmlPath = path.join(root, 'tests', 'perf001-browser-keyboard-harness.html');
const keyboardHarnessScriptPath = path.join(root, 'tests', 'perf001-browser-keyboard-harness.js');
assert.equal(browser.keyboardCancellation.browser, 'Google Chrome');
assert.equal(browser.keyboardCancellation.key, 'Space');
assert.equal(browser.keyboardCancellation.outcome, 'cancelled');
assert.equal(browser.keyboardCancellation.workerUsed, true);
assert.ok(browser.keyboardCancellation.cancelToTerminalMs <= 100, 'keyboard cancel exceeded 100ms');
assert.ok(browser.keyboardCancellation.maxInputDelayMs < 100, 'keyboard cancel input delay exceeded 100ms');
assert.equal(browser.keyboardCancellation.longTaskCount, 0);
assert.equal(browser.keyboardCancellation.resultCount, 0);
assert.equal(browser.keyboardCancellation.runButtonRestored, true);
assert.equal(browser.keyboardCancellation.cancelButtonDisabledAfter, true);
assert.equal(browser.keyboardCancellation.harnessHtmlSha256, sha256(keyboardHarnessHtmlPath));
assert.equal(browser.keyboardCancellation.harnessScriptSha256, sha256(keyboardHarnessScriptPath));
assert.match(fs.readFileSync(keyboardHarnessHtmlPath, 'utf8'), /src="\.\.\/pixelate_studio\.html\?qa=perf001-keyboard-harness-20260830"/);
const keyboardHarnessScript = fs.readFileSync(keyboardHarnessScriptPath, 'utf8');
assert.match(keyboardHarnessScript, /fetch\('\.\.\/pixelizer-codex-research\/evidence\/perf-001\/browser-fixtures\/perf-2048x2048\.png'\)/);
assert.doesNotMatch(keyboardHarnessScript, /https?:\/\//, 'keyboard harness must not make external requests');
assert.equal(browser.accessibility.keyboardActivation, true);
assert.equal(browser.accessibility.keyboardActivationBrowser, 'Google Chrome');

assert.match(html, /<button class="ghost" id="cancelProcessBtn" type="button" disabled[^>]*>\uCC98\uB9AC \uCDE8\uC18C<\/button>/);
assert.match(html, /<div class="status" id="status" role="status" aria-live="polite"/);
assert.match(worker, /message\.stage !== 'palette-map'/);
assert.match(worker, /message\.stage !== 'cleanup'/);
assert.match(worker, /message\.stage !== 'png-encode'/);
assert.doesNotMatch(worker, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(/);
assert.deepEqual(findWasmFiles(root), [], 'WASM gate is closed, so no production .wasm file may exist');

console.log('PERF-001 evidence gate passed: QLT provenance, benchmark, performance trace, click/video/keyboard cancel, browser integrity, rerun, tab, mobile, failure and no-WASM decision');
