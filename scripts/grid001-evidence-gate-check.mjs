import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GRID001_REQUIRED_CAPTURES,
  evaluateGrid001Evidence,
  sha256Text
} from './lib/grid001-evidence-gate.mjs';

const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grid001-evidence-gate-'));
const root = path.resolve(import.meta.dirname, '..');
const jpeg = fs.readFileSync(path.resolve(
  root,
  'pixelizer-codex-research/evidence/grid-001/browser-clean-8px-overlay.jpg'
));
const baseQa = {
  status: 'PASS',
  algorithmVersion: 2,
  desktop: {
    clean8px: { applyPass: true },
    mediumConfidence: { pass: true },
    cleanPixelArt: { pass: true, detected: { sizeX: 4, sizeY: 4, phaseX: 0, phaseY: 0 } },
    wobble: { pass: true },
    lowContrast: { pass: true },
    photoLike: { pass: true }
  },
  sheet: { pass: true },
  sequence: { pass: true, viewportVariance: 0 },
  mobile: { pass: true },
  cancellation: { pass: true },
  limits: { pass: true },
  performance: { pass: true, preprocessMaxChunkMs: 12, sobelMaxChunkMs: 14, endToEndMaxChunkMs: 14 },
  consoleErrorCount: 0,
  captures: [...GRID001_REQUIRED_CAPTURES],
  captureSha256: {},
  requiredReview: { model: 'Sol xhigh', result: 'PASS', report: 'review.md', reportSha256: '' }
};

assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).browserQaPass, false, 'missing captures must fail closed');
const pseudoJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
for(const name of GRID001_REQUIRED_CAPTURES){
  fs.writeFileSync(path.join(evidenceDir, name), pseudoJpeg);
  baseQa.captureSha256[name] = createHash('sha256').update(pseudoJpeg).digest('hex');
}
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).browserQaPass, false, 'truncated pseudo-JPEG evidence must fail closed');
for(const name of GRID001_REQUIRED_CAPTURES) fs.writeFileSync(path.join(evidenceDir, name), jpeg);
const jpegSha256 = createHash('sha256').update(jpeg).digest('hex');
for(const name of GRID001_REQUIRED_CAPTURES){
  baseQa.captureSha256[name] = jpegSha256;
}
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).browserQaPass, true, 'real JPEG evidence must unlock browser QA');
baseQa.captureSha256[GRID001_REQUIRED_CAPTURES[0]] = '0'.repeat(64);
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).browserQaPass, false, 'wrong capture hash must fail closed');
baseQa.captureSha256[GRID001_REQUIRED_CAPTURES[0]] = jpegSha256;
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).requiredReviewPass, false, 'missing review must fail closed');

const passReport = '# Independent review\n\nRECOMMENDATION: PASS\n';
fs.writeFileSync(path.join(evidenceDir, 'review.md'), passReport, 'utf8');
baseQa.requiredReview.reportSha256 = sha256Text(passReport);
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).requiredReviewPass, true, 'matching PASS report must unlock review');

fs.appendFileSync(path.join(evidenceDir, 'review.md'), '\nchanged\n', 'utf8');
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).requiredReviewPass, false, 'tampered review hash must fail closed');

const changesReport = '# Independent review\n\nRECOMMENDATION: CHANGES_REQUESTED\n';
fs.writeFileSync(path.join(evidenceDir, 'changes.md'), changesReport, 'utf8');
baseQa.requiredReview.report = 'changes.md';
baseQa.requiredReview.reportSha256 = sha256Text(changesReport);
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).requiredReviewPass, false, 'CHANGES_REQUESTED must never unlock review');

baseQa.requiredReview.report = '../review.md';
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).reviewReportExists, false, 'path traversal must fail closed');

baseQa.performance.endToEndMaxChunkMs = 100.001;
assert.equal(evaluateGrid001Evidence(baseQa, evidenceDir).browserQaPass, false, 'browser chunk over 100ms must fail');

console.log('GRID-001 fail-closed capture, review, hash, path, and performance evidence gates passed.');
