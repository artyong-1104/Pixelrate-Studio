import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const root = path.resolve(import.meta.dirname, '..');
const evidenceRelative = 'pixelizer-codex-research/evidence/current-hash-revalidation-20260906';
const evidenceDir = path.resolve(root, evidenceRelative);
const reportPath = path.resolve(evidenceDir, 'browser-run.json');
const screenshotPath = path.resolve(evidenceDir, 'browser-final.jpg');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = relative => fs.readFileSync(path.resolve(root, relative));

const application = read('pixelate_studio.html');
const worker = read('pixelate-worker.js');
const browserRun = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const screenshot = fs.readFileSync(screenshotPath);
const expectedIds = ['QLT-001', 'ANI-001', 'GRID-001', 'ALP-002', 'CELL-001', 'PAL-002', 'DIT-001', 'EDGE-001'];

assert.equal(browserRun.capture.status, 'PASS', 'browser controller status');
assert.equal(browserRun.report.status, 'PASS', 'browser report status');
assert.equal(browserRun.report.applicationSha256, sha256(application), 'served HTML hash must match the current file');
assert.equal(browserRun.report.workerSha256, sha256(worker), 'served worker hash must match the current file');
assert.match(browserRun.report.browser, /Chrome\//, 'browser user agent');
assert.match(browserRun.report.url, /^http:\/\/localhost:8000\//, 'localhost evidence URL');
assert.deepEqual(browserRun.report.items.map(item => item.id), expectedIds, 'exact item coverage');
assert.ok(browserRun.report.items.every(item => item.status === 'PASS'), 'every browser scenario must pass');

const measurements = Object.fromEntries(browserRun.report.items.map(item => [item.id, item.measurements]));
assert.deepEqual(measurements['QLT-001'].dimensions, [16, 16]);
assert.match(measurements['QLT-001'].rgbaSha256, /^[0-9a-f]{64}$/);
assert.equal(measurements['ANI-001'].before, '1 / 2');
assert.equal(measurements['ANI-001'].after, '2 / 2');
assert.equal(measurements['ANI-001'].zoom8, true);
assert.deepEqual(measurements['GRID-001'].size, [8, 8]);
assert.deepEqual(measurements['GRID-001'].phase, [0, 0]);
assert.equal(measurements['GRID-001'].source, 'auto');
assert.ok(measurements['ALP-002'].coveragePartialPixels > 0);
assert.notEqual(measurements['ALP-002'].coverageHash, measurements['ALP-002'].binaryHash);
assert.equal(measurements['CELL-001'].representativeColor, 'center');
assert.equal(measurements['PAL-002'].algorithm, 'kmeans-oklab');
assert.equal(measurements['PAL-002'].sampling, 'image-balanced');
assert.equal(measurements['DIT-001'].mode, 'bayer4');
assert.equal(measurements['DIT-001'].strength, 75);
assert.notEqual(measurements['DIT-001'].offHash, measurements['DIT-001'].onHash);
assert.equal(measurements['EDGE-001'].lineAware.enabled, true);
assert.ok(measurements['EDGE-001'].lineAware.candidatePixels > 0);
assert.equal(measurements['EDGE-001'].selout.enabled, true);

assert.ok(screenshot.byteLength > 10_000, 'browser screenshot must not be empty');
assert.deepEqual(Array.from(screenshot.subarray(0, 2)), [0xff, 0xd8], 'screenshot JPEG SOI');
assert.deepEqual(Array.from(screenshot.subarray(-2)), [0xff, 0xd9], 'screenshot JPEG EOI');

const browserLogs = browserRun.capture.logs ?? [];
const knownHostNoise = 'Failed to execute \'observe\' on \'MutationObserver\': parameter 1 is not of type \'Node\'.';
assert.ok(browserLogs.every(entry => entry.level === 'error' && entry.message.includes(knownHostNoise)), 'unexpected browser warning/error');
assert.ok(!application.toString('utf8').includes('MutationObserver'), 'known browser host noise must not originate in application source');

const checkFiles = [
  'scripts/visual-quality-check.mjs',
  'scripts/animation-check.mjs',
  'scripts/ani001-ui-check.mjs',
  'scripts/grid-detection-check.mjs',
  'scripts/grid001-ui-check.mjs',
  'scripts/alp002-check.mjs',
  'scripts/alp002-ui-check.mjs',
  'scripts/cell001-check.mjs',
  'scripts/cell001-ui-check.mjs',
  'scripts/pal002-ui-check.mjs',
  'scripts/dit001-check.mjs',
  'scripts/dit001-ui-check.mjs',
  'scripts/edge001-check.mjs'
];

const automatedChecks = [];
for (const file of checkFiles) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [path.resolve(root, file)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  automatedChecks.push({
    file,
    exitCode: result.status,
    elapsedMs: Number((performance.now() - started).toFixed(1)),
    stdout: result.stdout,
    stderr: result.stderr
  });
}

const automatedPath = path.resolve(evidenceDir, 'automated-checks.json');
fs.writeFileSync(automatedPath, `${JSON.stringify({
  runDateKst: '2026-09-06',
  applicationSha256: sha256(application),
  workerSha256: sha256(worker),
  status: automatedChecks.every(check => check.exitCode === 0) ? 'PASS' : 'FAIL',
  checks: automatedChecks
}, null, 2)}\n`);
assert.ok(automatedChecks.every(check => check.exitCode === 0), 'every current-source automated check must pass');

const artifactFiles = [
  `${evidenceRelative}/browser-run.json`,
  `${evidenceRelative}/browser-final.jpg`,
  `${evidenceRelative}/automated-checks.json`,
  'tests/current-hash-revalidation-harness.html',
  'tests/current-hash-revalidation-harness.js',
  'scripts/current-hash-revalidation-check.mjs'
];
const manifest = {
  schemaVersion: 1,
  runDateKst: '2026-09-06',
  applicationSha256: sha256(application),
  workerSha256: sha256(worker),
  browserScenarios: { passed: expectedIds.length, total: expectedIds.length, ids: expectedIds },
  automatedChecks: { passed: automatedChecks.length, total: automatedChecks.length },
  browserLogs: {
    unexpectedCount: 0,
    knownHostNoiseCount: browserLogs.length,
    note: 'The controller reported a source-less MutationObserver error. The application source contains no MutationObserver reference.'
  },
  artifacts: artifactFiles.map(relative => {
    const bytes = read(relative);
    return { path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }),
  status: 'PASS'
};
fs.writeFileSync(path.resolve(evidenceDir, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Current hash revalidation PASS: browser=${expectedIds.length}/${expectedIds.length} automated=${automatedChecks.length}/${automatedChecks.length} app=${manifest.applicationSha256} worker=${manifest.workerSha256}`);
