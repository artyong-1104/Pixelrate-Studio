import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  FIXTURE_SEED,
  GENERATOR_VERSION,
  computeFixtureMetrics,
  countComponents,
  countForeground,
  fixtureHashes,
  generateCorpus,
  manifestFromCorpus,
  sha256,
  stableStringify,
  validateManifest,
} from './lib/pixel-fixtures.mjs';
import {
  baselineManifestEntries,
  computeCurrentBaselines,
} from './lib/current-pixelate-baseline.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'tests/fixtures/manifest.json');
const evidenceRoot = resolve(root, 'pixelizer-codex-research/evidence/qlt-001');

function parseArguments(argv) {
  const options = { report: null };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--report') options.report = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (argv.includes('--report') && !options.report) throw new Error('--report requires a path');
  return options;
}

function assertReportPath(path) {
  if (!isAbsolute(path)) throw new Error('--report must be an absolute path');
  const resolved = resolve(path);
  const temporary = resolved === '/tmp' || resolved.startsWith('/tmp/') || resolved === '/private/tmp' || resolved.startsWith('/private/tmp/');
  const evidence = resolved === evidenceRoot || resolved.startsWith(`${evidenceRoot}/`);
  if (!temporary && !evidence) throw new Error('--report must be under /tmp, /private/tmp, or the QLT-001 evidence directory');
  return resolved;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runManifestValidationSelfTests(manifest) {
  const duplicate = clone(manifest);
  duplicate.fixtures[1].id = duplicate.fixtures[0].id;
  assert.throws(() => validateManifest(duplicate), /Duplicate fixture id/);

  const badDimensions = clone(manifest);
  badDimensions.fixtures[0].width = 0;
  assert.throws(() => validateManifest(badDimensions), /dimensions/);

  const missingHash = clone(manifest);
  delete missingHash.fixtures[0].expected.pngSha256;
  assert.throws(() => validateManifest(missingHash), /expected hashes/);

  const missingFeatures = clone(manifest);
  delete missingFeatures.fixtures[0].knownFeatures;
  assert.throws(() => validateManifest(missingFeatures), /knownGrid and knownFeatures/);
}

const started = performance.now();
const options = parseArguments(process.argv.slice(2));
const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
runManifestValidationSelfTests(manifest);

const corpusA = generateCorpus({ seed: manifest.seed, generatorVersion: manifest.generatorVersion });
const corpusB = generateCorpus({ seed: manifest.seed, generatorVersion: manifest.generatorVersion });
const manifestA = manifestFromCorpus(corpusA, manifest);
const manifestB = manifestFromCorpus(corpusB, manifest);
const baselinesA = computeCurrentBaselines(corpusA);
const baselinesB = computeCurrentBaselines(corpusB);
manifestA.baselines = baselineManifestEntries(baselinesA);
manifestB.baselines = baselineManifestEntries(baselinesB);
assert.equal(stableStringify(manifestA), stableStringify(manifestB), 'Two identical generations must match');
assert.equal(stableStringify(manifestA.baselines), stableStringify(manifest.baselines), 'Current app baseline hashes must match manifest');

const changedSeed = manifestFromCorpus(generateCorpus({ seed: manifest.seed + 1, generatorVersion: manifest.generatorVersion }), {
  seed: manifest.seed + 1, generatorVersion: manifest.generatorVersion,
});
const changedVersion = manifestFromCorpus(generateCorpus({ seed: manifest.seed, generatorVersion: manifest.generatorVersion + 1 }), {
  seed: manifest.seed, generatorVersion: manifest.generatorVersion + 1,
});
assert.notEqual(sha256(Buffer.from(stableStringify(manifestA))), sha256(Buffer.from(stableStringify(changedSeed))), 'Changing the seed must change corpus hashes');
assert.notEqual(sha256(Buffer.from(stableStringify(manifestA))), sha256(Buffer.from(stableStringify(changedVersion))), 'Changing generatorVersion must change corpus hashes');

const expectedById = new Map(manifest.fixtures.map(entry => [entry.id, entry]));
const fixtureReports = [];
let failed = 0;

for (const item of corpusA) {
  const fixtureStarted = performance.now();
  const expected = expectedById.get(item.id);
  const hashes = fixtureHashes(item);
  const metrics = computeFixtureMetrics(item);
  const failures = [];

  if (!expected) failures.push('missing manifest entry');
  else {
    for (const field of ['width', 'height', 'frameCount', 'alphaKind']) {
      const actual = field === 'frameCount' ? item.frames.length : item[field];
      if (expected[field] !== actual) failures.push(`${field} expected ${expected[field]}, got ${actual}`);
    }
    if (expected.expected.rgbaSha256 !== hashes.rgbaSha256) failures.push('RGBA hash mismatch');
    if (expected.expected.pngSha256 !== hashes.pngSha256) failures.push('PNG hash mismatch');
  }

  if (item.id === 'thin-lines') {
    assert.equal(countForeground(item.frames[0], 10), item.knownFeatures.thinFeaturePixels, 'thin-lines marker count must match manifest metadata');
  }
  if (item.id === 'alpha-edge') {
    assert.equal(
      countComponents(item.frames[0], item.width, item.height, 10),
      item.knownFeatures.componentsAtThreshold10,
      'alpha-edge component count must match manifest metadata',
    );
  }
  if (item.id === 'animation-16') {
    assert.equal(metrics.staticTemporalChangedPixelRatio, 0, 'animation static region must not change');
  }

  if (failures.length) failed++;
  fixtureReports.push({
    id: item.id,
    width: item.width,
    height: item.height,
    frameCount: item.frames.length,
    rgbaSha256: hashes.rgbaSha256,
    pngSha256: hashes.pngSha256,
    metrics,
    status: failures.length ? 'failed' : 'passed',
    failures,
    elapsedMilliseconds: Number((performance.now() - fixtureStarted).toFixed(3)),
  });
}

const deterministicCore = {
  implementationId: 'QLT-001',
  settings: { generatorVersion: manifest.generatorVersion, seed: manifest.seed },
  fixtures: fixtureReports.map(({ elapsedMilliseconds, ...entry }) => entry),
  baselines: manifestA.baselines,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  implementationId: 'QLT-001',
  settings: deterministicCore.settings,
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  fixtures: fixtureReports,
  baselines: manifestA.baselines,
  summary: {
    passed: fixtureReports.length - failed,
    failed,
    deterministic: true,
    deterministicSha256: sha256(Buffer.from(stableStringify(deterministicCore))),
    elapsedMilliseconds: Number((performance.now() - started).toFixed(3)),
  },
};

if (options.report) {
  const reportPath = assertReportPath(options.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, stableStringify(report));
  console.log(`Report written: ${reportPath}`);
}

for (const entry of fixtureReports) {
  console.log(`${entry.status === 'passed' ? 'PASS' : 'FAIL'} ${entry.id.padEnd(18)} ${entry.rgbaSha256.slice(0, 12)} ${entry.elapsedMilliseconds.toFixed(3)}ms`);
  for (const failure of entry.failures) console.error(`  - ${failure}`);
}
for (const baseline of manifestA.baselines) {
  console.log(`PASS ${baseline.id.padEnd(28)} ${baseline.expected.rgbaSha256.slice(0, 12)} baseline`);
}
console.log(`Visual quality checks: ${report.summary.passed} passed, ${report.summary.failed} failed, deterministic ${report.summary.deterministicSha256}.`);

if (report.summary.elapsedMilliseconds > 10000) {
  console.error(`Visual quality checks exceeded 10 seconds: ${report.summary.elapsedMilliseconds}ms`);
  process.exitCode = 1;
}
if (failed > 0) process.exitCode = 1;
