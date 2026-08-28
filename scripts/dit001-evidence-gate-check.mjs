import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodePng } from './lib/pixel-fixtures.mjs';
import {
  DIT001_REQUIRED_CAPTURE_REQUIREMENTS,
  DIT001_REQUIRED_CAPTURES,
  DIT001_TEXTURE_CANDIDATES,
  evaluateDit001Evidence,
  sha256Bytes,
  sha256Text
} from './lib/dit001-evidence-gate.mjs';

const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dit001-evidence-gate-'));
fs.mkdirSync(path.resolve(evidenceDir, 'browser-result-assets'), { recursive:true });

function patternedPng(width, height, seed, alphaPattern = false){
  const rgba = new Uint8ClampedArray(width * height * 4);
  for(let y = 0; y < height; y++){
    for(let x = 0; x < width; x++){
      const index = (y * width + x) * 4;
      rgba[index] = (x * 17 + y * 3 + seed * 29) % 256;
      rgba[index + 1] = (x * 5 + y * 19 + seed * 11) % 256;
      rgba[index + 2] = (x * 13 + y * 7 + seed * 23) % 256;
      rgba[index + 3] = alphaPattern && x < Math.floor(width / 4) ? 0 : 255;
    }
  }
  return Buffer.from(encodePng(width, height, rgba));
}

function writeEvidenceFile(name, bytes){
  const filePath = path.resolve(evidenceDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive:true });
  fs.writeFileSync(filePath, bytes);
  return sha256Bytes(bytes);
}

const resultHashes = {};
const resultFixtures = new Map();
for(const requirement of DIT001_REQUIRED_CAPTURE_REQUIREMENTS){
  if(requirement.kind === 'animation'){
    requirement.frameAssets.forEach((asset, index) => resultFixtures.set(asset, { fixture:'animation-16', seed:index + 100 }));
  } else {
    resultFixtures.set(requirement.resultAsset, {
      fixture:requirement.fixture,
      seed:resultFixtures.size + 1
    });
  }
}
for(const [asset, definition] of resultFixtures){
  const alphaPattern = definition.fixture === 'alpha-edge';
  const bytes = patternedPng(64, 64, definition.seed, alphaPattern);
  resultHashes[asset] = writeEvidenceFile(asset, bytes);
}

const captureDetails = {};
for(const requirement of DIT001_REQUIRED_CAPTURE_REQUIREMENTS){
  if(requirement.kind === 'animation'){
    captureDetails[requirement.name] = {
      kind:requirement.kind,
      fixture:requirement.fixture,
      zoom:requirement.zoom,
      fps:requirement.fps,
      ditherMode:requirement.ditherMode,
      strength:requirement.strength,
      settingsFile:requirement.settingsFile,
      frameAssets:[...requirement.frameAssets],
      frameAssetSha256:Object.fromEntries(requirement.frameAssets.map(asset => [asset, resultHashes[asset]])),
      sampledFrameIndexes:[0, 4, 8, 12]
    };
  } else {
    captureDetails[requirement.name] = {
      kind:requirement.kind,
      fixture:requirement.fixture,
      zoom:requirement.zoom,
      ditherMode:requirement.ditherMode,
      strength:requirement.strength,
      settingsFile:requirement.settingsFile,
      outline:requirement.outline,
      ...(requirement.candidateId ? { candidateId:requirement.candidateId } : {}),
      resultAsset:requirement.resultAsset,
      resultSha256:resultHashes[requirement.resultAsset]
    };
  }
}

const baseQa = {
  status:'PASS',
  desktop:{
    defaultHiddenOff:true,
    gradientTransformPass:true,
    resultMetadataPass:true,
    staticVisualPass:true,
    unlimitedDisabledPass:true,
    animationPresetOffPass:true,
    inactiveFrameModeWarningPass:true,
    scaleFrameWarningTransitionsPass:true,
    warningTransitions:{
      originalToPreserveSheet:true,
      preserveSheetToOriginal:true,
      factorWholeToSheet:true,
      factorSheetToWhole:true,
      gridWholeToSheet:true,
      gridSheetToWhole:true
    },
    zoomCoverage:[1, 2, 8],
    fixtureCoverage:['gradient-gray', 'clean-pixel-art', 'alpha-edge', 'texture-checker']
  },
  animation:{ frameCount:16, fps8Pass:true, fps12Pass:true, zoom8Pass:true, fixedOriginPass:true },
  mobile:{ viewportWidth:390, documentScrollWidth:390, layoutPass:true },
  consoleErrorCount:0,
  captures:[...DIT001_REQUIRED_CAPTURES],
  captureSha256:{},
  captureDetails,
  texturePreference:{
    status:'PASS',
    fixture:'texture-checker',
    zoom:1,
    baselineCapture:'browser-texture-off-1x.png',
    reviewer:'manual-browser-qa',
    evaluatedAt:'2026-08-26T15:00:00+09:00',
    criteria:{ textureNoiseReviewed:true, edgeLegibilityReviewed:true },
    evaluations:DIT001_TEXTURE_CANDIDATES.map(candidateId => ({
      candidateId,
      decision:'ACCEPTABLE',
      zoom:1,
      capture:`browser-texture-${candidateId}-1x.png`,
      rationale:'1× 실제 배율에서 경계 가독성과 무늬 노이즈르 증가를 확인했다.'
    }))
  },
  requiredReview:{ model:'Sol xhigh', result:'PASS', report:'review.md', reportSha256:'' }
};

assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).browserQaPass, false, 'missing screenshots must fail closed');

for(let index = 0; index < DIT001_REQUIRED_CAPTURE_REQUIREMENTS.length; index++){
  const requirement = DIT001_REQUIRED_CAPTURE_REQUIREMENTS[index];
  const width = requirement.surface === 'mobile' ? 390 : 1000;
  const height = requirement.surface === 'mobile' ? 844 : 600;
  const white = new Uint8ClampedArray(width * height * 4).fill(255);
  const bytes = Buffer.from(encodePng(width, height, white));
  baseQa.captureSha256[requirement.name] = writeEvidenceFile(requirement.name, bytes);
}
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).browserQaPass, false, 'visually blank screenshots must fail closed');

for(let index = 0; index < DIT001_REQUIRED_CAPTURE_REQUIREMENTS.length; index++){
  const requirement = DIT001_REQUIRED_CAPTURE_REQUIREMENTS[index];
  const width = requirement.surface === 'mobile' ? 390 : 1000;
  const height = requirement.surface === 'mobile' ? 844 : 600;
  const bytes = patternedPng(width, height, index + 200);
  baseQa.captureSha256[requirement.name] = writeEvidenceFile(requirement.name, bytes);
}
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).browserQaPass, true, 'semantic captures and linked result assets must unlock browser QA');

const firstCapture = DIT001_REQUIRED_CAPTURES[0];
baseQa.captureSha256[firstCapture] = '0'.repeat(64);
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).browserQaPass, false, 'capture hash mismatch must fail closed');
baseQa.captureSha256[firstCapture] = sha256Bytes(fs.readFileSync(path.resolve(evidenceDir, firstCapture)));

const firstDetail = baseQa.captureDetails[firstCapture];
delete baseQa.captureDetails[firstCapture];
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).browserQaPass, false, 'missing fixture/setting detail must fail closed');
baseQa.captureDetails[firstCapture] = firstDetail;

baseQa.texturePreference.status = 'PENDING';
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).browserQaPass, false, 'missing 1x texture preference must fail closed');
baseQa.texturePreference.status = 'PASS';

baseQa.desktop.warningTransitions.factorWholeToSheet = false;
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).browserQaPass, false, 'stale frame-mode warning transition must fail closed');
baseQa.desktop.warningTransitions.factorWholeToSheet = true;

assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).requiredReviewPass, false, 'missing review must fail closed');
const passReport = '# DIT-001 independent review\n\nFINAL_VERDICT: PASS\n';
fs.writeFileSync(path.resolve(evidenceDir, 'review.md'), passReport);
baseQa.requiredReview.reportSha256 = sha256Text(passReport);
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).requiredReviewPass, true, 'matching independent PASS must unlock review');
fs.appendFileSync(path.resolve(evidenceDir, 'review.md'), '\ntampered\n');
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).requiredReviewPass, false, 'tampered review must fail closed');

const failReport = '# DIT-001 independent review\n\nFINAL_VERDICT: FAIL\n';
fs.writeFileSync(path.resolve(evidenceDir, 'fail.md'), failReport);
baseQa.requiredReview.report = 'fail.md';
baseQa.requiredReview.reportSha256 = sha256Text(failReport);
assert.equal(evaluateDit001Evidence(baseQa, evidenceDir).requiredReviewPass, false, 'FAIL review must never unlock review');

console.log('DIT-001 semantic browser capture, result asset, texture preference, transition, and independent review gates passed.');
