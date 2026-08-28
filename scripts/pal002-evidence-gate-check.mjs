import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PAL002_REQUIRED_CAPTURES,
  evaluatePal002CaptureEvidence,
  evaluatePal002ManualMatrixEvidence,
  inspectPal002JpegEvidence,
  validatePal002BlindPreference
} from './lib/pal002-evidence-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'pal-002');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pal002-evidence-gate-'));

try {
  const qa = {
    captures: [...PAL002_REQUIRED_CAPTURES],
    captureSha256: {},
    blindPreference: {
      captures: ['browser-blind-a.jpg', 'browser-blind-b.jpg'],
      completed: true,
      labelsHidden: true,
      validForEvaluation: true,
      comparisonOrderRandomized: true,
      mappingRevealedAfterVerdict: true,
      mapping: { A: 'kmeans-oklab', B: 'kmeans-srgb' },
      candidateAlgorithm: 'kmeans-oklab',
      result: 'tie',
      preferencePercentForCandidate: 50,
      confidence: 0.84
    }
  };
  for(const name of PAL002_REQUIRED_CAPTURES){
    const source = path.resolve(sourceDir, name);
    if(!fs.existsSync(source)) continue;
    fs.copyFileSync(source, path.resolve(tempDir, name));
    const inspected = inspectPal002JpegEvidence(tempDir, name);
    assert.ok(inspected, `${name} must be a decodable JPEG with required dimensions`);
    qa.captureSha256[name] = inspected.sha256;
  }
  if(PAL002_REQUIRED_CAPTURES.every(name => fs.existsSync(path.resolve(tempDir, name)))){
    const valid = evaluatePal002CaptureEvidence(qa, tempDir);
    assert.equal(valid.capturesPass, true);
    assert.equal(valid.blindEvidencePass, true);
  }
  const actualQaPath = path.resolve(sourceDir, 'qa-results.json');
  if(fs.existsSync(actualQaPath)){
    const actualQa = JSON.parse(fs.readFileSync(actualQaPath, 'utf8'));
    const promotionGate = { promotionCellIds: ['animation-16'] };
    const manual = evaluatePal002ManualMatrixEvidence(actualQa, sourceDir, promotionGate);
    assert.equal(manual.pass, true, 'actual-size 20-cell browser matrix must pass');
    assert.equal(manual.cellCount, 20);
    assert.equal(manual.assetCount, 240);
    const missingCell = structuredClone(actualQa);
    missingCell.actualSizeMatrix.groups[0].cells.pop();
    assert.equal(evaluatePal002ManualMatrixEvidence(missingCell, sourceDir, promotionGate).pass, false);
    const duplicateGroup = structuredClone(actualQa);
    duplicateGroup.actualSizeMatrix.groups[1].id = duplicateGroup.actualSizeMatrix.groups[0].id;
    assert.equal(evaluatePal002ManualMatrixEvidence(duplicateGroup, sourceDir, promotionGate).pass, false);
    const badManifestHash = structuredClone(actualQa);
    badManifestHash.actualSizeMatrix.manifestSha256 = '0'.repeat(64);
    assert.equal(evaluatePal002ManualMatrixEvidence(badManifestHash, sourceDir, promotionGate).pass, false);
    assert.equal(evaluatePal002ManualMatrixEvidence(actualQa, sourceDir, { promotionCellIds: [] }).pass, false,
      'manual promotion evidence must fail when quantitative eligibility does not name animation-16');
  }

  const target = 'browser-algorithm-ab.jpg';
  const fake = Buffer.alloc(2048, 0);
  fake[0] = 0xff;
  fake[1] = 0xd8;
  fake[fake.length - 2] = 0xff;
  fake[fake.length - 1] = 0xd9;
  fs.writeFileSync(path.resolve(tempDir, target), fake);
  assert.equal(inspectPal002JpegEvidence(tempDir, target), null, 'pseudo-JPEG must fail');
  assert.equal(inspectPal002JpegEvidence(tempDir, '../browser-algorithm-ab.jpg'), null, 'path traversal must fail');

  const invalidBlind = structuredClone(qa);
  invalidBlind.blindPreference.labelsHidden = false;
  assert.equal(evaluatePal002CaptureEvidence(invalidBlind, tempDir).blindEvidencePass, false);
  for(const mutation of [
    preference => { preference.captures = ['browser-blind-a.jpg', 'browser-blind-a.jpg']; },
    preference => { preference.mapping = { A: 'kmeans-oklab', B: 'kmeans-oklab' }; },
    preference => { preference.mappingRevealedAfterVerdict = false; },
    preference => { preference.preferencePercentForCandidate = 101; },
    preference => { preference.preferencePercentForCandidate = 100; },
    preference => { preference.result = 'candidate-preferred'; preference.preferencePercentForCandidate = 50; },
    preference => { preference.candidateAlgorithm = 'median-cut'; },
    preference => { preference.confidence = 2; }
  ]){
    const invalid = structuredClone(qa.blindPreference);
    mutation(invalid);
    assert.equal(validatePal002BlindPreference(invalid), false);
  }
  console.log('PAL-002 decoder-backed capture, path, and blind-evidence gates passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
