import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { encodePng } from './lib/pixel-fixtures.mjs';
import {
  PERF_FIXTURE_DEFINITIONS,
  createPerfFixture,
  perfFixtureProvenance,
} from './lib/perf001-fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'pixelizer-codex-research', 'evidence', 'perf-001', 'browser-fixtures');
fs.mkdirSync(outputDir, { recursive:true });

const manifest = {
  schemaVersion:1,
  itemId:'PERF-001',
  provenance:perfFixtureProvenance(),
  fixtures:{},
};

for(const definition of PERF_FIXTURE_DEFINITIONS){
  const fixture = createPerfFixture(definition);
  const fileName = `perf-${definition.side}x${definition.side}.png`;
  const filePath = path.join(outputDir, fileName);
  const png = encodePng(definition.side, definition.side, fixture.data);
  fs.writeFileSync(filePath, png);
  manifest.fixtures[definition.id] = {
    file:fileName,
    width:definition.side,
    height:definition.side,
    pixels:definition.pixels,
    rgbaSha256:fixture.rgbaSha256,
    pngSha256:crypto.createHash('sha256').update(png).digest('hex'),
    bytes:png.byteLength,
  };
  console.log(`${path.relative(root, filePath)} ${png.byteLength} bytes ${fixture.rgbaSha256}`);
}

const manifestPath = path.join(outputDir, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${path.relative(root, manifestPath)} ${fs.statSync(manifestPath).size} bytes`);
