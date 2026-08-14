import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import {
  FIXTURE_SEED,
  GENERATOR_VERSION,
  createContactSheet,
  encodeFixtureFrames,
  encodePng,
  fixtureHashes,
  generateCorpus,
  manifestFromCorpus,
  stableStringify,
  validateManifest,
} from './lib/pixel-fixtures.mjs';
import {
  baselineManifestEntries,
  computeCurrentBaselines,
} from './lib/current-pixelate-baseline.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'tests/fixtures/manifest.json');

function parseArguments(argv) {
  const options = { verify: false, updateBaseline: false, output: '/tmp/pixelate-studio-fixtures' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--verify') options.verify = true;
    else if (arg === '--update-baseline') options.updateBaseline = true;
    else if (arg === '--output') options.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.verify && options.updateBaseline) throw new Error('--verify and --update-baseline cannot be combined');
  if (!options.output) throw new Error('--output requires a directory');
  return options;
}

function assertTemporaryOutput(output) {
  if (!isAbsolute(output)) throw new Error('--output must be an absolute path under /tmp');
  const resolved = resolve(output);
  if (!(resolved === '/tmp' || resolved.startsWith('/tmp/') || resolved === '/private/tmp' || resolved.startsWith('/private/tmp/'))) {
    throw new Error('--output must be under /tmp or /private/tmp');
  }
  return resolved;
}

function compareManifest(manifest, generated) {
  const failures = [];
  const generatedById = new Map(generated.fixtures.map(entry => [entry.id, entry]));
  for (const expected of manifest.fixtures) {
    const actual = generatedById.get(expected.id);
    if (!actual) {
      failures.push(`${expected.id}: missing generated fixture`);
      continue;
    }
    for (const field of ['width', 'height', 'frameCount', 'alphaKind']) {
      if (actual[field] !== expected[field]) failures.push(`${expected.id}: ${field} expected ${expected[field]}, got ${actual[field]}`);
    }
    for (const hash of ['rgbaSha256', 'pngSha256']) {
      if (actual.expected[hash] !== expected.expected[hash]) failures.push(`${expected.id}: ${hash} mismatch`);
    }
  }
  if (stableStringify(manifest.baselines) !== stableStringify(generated.baselines)) {
    failures.push('current app baseline hashes or settings differ');
  }
  return failures;
}

const options = parseArguments(process.argv.slice(2));
const corpus = generateCorpus({ seed: FIXTURE_SEED, generatorVersion: GENERATOR_VERSION });
const generatedManifest = manifestFromCorpus(corpus);
generatedManifest.baselines = baselineManifestEntries(computeCurrentBaselines(corpus));

if (options.updateBaseline) {
  writeFileSync(manifestPath, stableStringify(generatedManifest));
  console.log(`Updated fixture baseline: ${relative(root, manifestPath)}`);
  for (const entry of generatedManifest.fixtures) console.log(`- ${entry.id}: ${entry.expected.rgbaSha256.slice(0, 12)}…`);
  process.exit(0);
}

const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
const failures = compareManifest(manifest, generatedManifest);
const secondCorpus = generateCorpus({ seed: FIXTURE_SEED, generatorVersion: GENERATOR_VERSION });
const secondManifest = manifestFromCorpus(secondCorpus);
secondManifest.baselines = baselineManifestEntries(computeCurrentBaselines(secondCorpus));
if (stableStringify(generatedManifest) !== stableStringify(secondManifest)) failures.push('second in-memory generation differs');

if (failures.length) {
  console.error('Fixture verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

const fixtureBytes = corpus.reduce((sum, item) => sum + fixtureHashes(item).pngBytes, 0);
if (fixtureBytes > 5 * 1024 * 1024) {
  console.error(`Fixture PNG total exceeds 5MB: ${fixtureBytes} bytes`);
  process.exit(1);
}

if (options.verify) {
  console.log(`Fixture verification passed: ${corpus.length} fixtures, ${fixtureBytes} PNG bytes, deterministic hashes.`);
  process.exit(0);
}

const output = assertTemporaryOutput(options.output);
mkdirSync(output, { recursive: true });
const index = [];
for (const item of corpus) {
  const pngs = encodeFixtureFrames(item);
  const names = [];
  for (let frameIndex = 0; frameIndex < pngs.length; frameIndex++) {
    const suffix = pngs.length === 1 ? '' : `-${String(frameIndex).padStart(2, '0')}`;
    const name = `${item.id}${suffix}.png`;
    writeFileSync(join(output, name), pngs[frameIndex]);
    names.push(name);
  }
  index.push({ id: item.id, width: item.width, height: item.height, files: names });
}
const contact = createContactSheet(corpus);
writeFileSync(join(output, 'contact-sheet.png'), encodePng(contact.width, contact.height, contact.data));
writeFileSync(join(output, 'contact-sheet.json'), stableStringify({ columns: 4, tileWidth: 200, tileHeight: 200, fixtures: index }));
console.log(`Generated ${corpus.length} fixtures and contact sheet in ${output}`);
