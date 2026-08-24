import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALP002_REQUIRED_CAPTURES,
  evaluateAlp002CaptureEvidence,
  inspectAlp002JpegEvidence,
  readJpegDimensions
} from './lib/alp002-evidence-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'alp-002');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alp002-evidence-gate-'));

function sha256(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function rewriteFirstSofDimensions(bytes, width, height){
  const copy = Buffer.from(bytes);
  let offset = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while(offset + 8 < copy.length){
    while(offset < copy.length && copy[offset] !== 0xff) offset++;
    while(offset < copy.length && copy[offset] === 0xff) offset++;
    if(offset >= copy.length) break;
    const marker = copy[offset++];
    if(marker === 0xda || marker === 0xd9) break;
    if(marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = copy.readUInt16BE(offset);
    if(sof.has(marker)){
      copy.writeUInt16BE(height, offset + 3);
      copy.writeUInt16BE(width, offset + 5);
      return copy;
    }
    offset += length;
  }
  throw new Error('SOF marker not found in fixture JPEG');
}

function truncateAfterFirstSof(bytes){
  let offset = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while(offset + 8 < bytes.length){
    while(offset < bytes.length && bytes[offset] !== 0xff) offset++;
    while(offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if(marker === 0xda || marker === 0xd9) break;
    if(marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = bytes.readUInt16BE(offset);
    if(sof.has(marker)) return Buffer.concat([bytes.subarray(0, offset + length), Buffer.from([0xff, 0xd9])]);
    offset += length;
  }
  throw new Error('SOF marker not found in fixture JPEG');
}

function makeCraftedInvalidJpeg({ structurallyPlausible = false } = {}){
  const bytes = Buffer.alloc(1024, 0);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  let offset = 2;
  bytes[offset++] = 0xff;
  bytes[offset++] = 0xc0;
  bytes.writeUInt16BE(structurallyPlausible ? 11 : 8, offset);
  offset += 2;
  bytes[offset++] = 8;
  bytes.writeUInt16BE(360, offset);
  offset += 2;
  bytes.writeUInt16BE(640, offset);
  offset += 2;
  if(structurallyPlausible){
    bytes[offset++] = 1;
    bytes[offset++] = 1;
    bytes[offset++] = 0x11;
    bytes[offset++] = 0;
  } else {
    bytes[offset++] = 0;
  }
  bytes[offset++] = 0xff;
  bytes[offset++] = 0xda;
  bytes.writeUInt16BE(structurallyPlausible ? 8 : 2, offset);
  offset += 2;
  if(structurallyPlausible){
    bytes[offset++] = 1;
    bytes[offset++] = 1;
    bytes[offset++] = 0;
    bytes[offset++] = 0;
    bytes[offset++] = 63;
    bytes[offset++] = 0;
  }
  bytes[bytes.length - 2] = 0xff;
  bytes[bytes.length - 1] = 0xd9;
  return bytes;
}

try {
  const validQa = {
    captures: [...ALP002_REQUIRED_CAPTURES],
    captureSha256: {},
    logRestore: { capture: 'browser-log-restore.jpg', captureSha256: null }
  };
  for(const name of [...ALP002_REQUIRED_CAPTURES, 'browser-log-restore.jpg']){
    const bytes = fs.readFileSync(path.resolve(sourceDir, name));
    fs.writeFileSync(path.resolve(tempDir, name), bytes);
    const inspected = inspectAlp002JpegEvidence(tempDir, name);
    assert.ok(inspected, `${name} must decode to acceptable SOF dimensions`);
    if(ALP002_REQUIRED_CAPTURES.includes(name)) validQa.captureSha256[name] = inspected.sha256;
    else validQa.logRestore.captureSha256 = inspected.sha256;
  }
  const validResult = evaluateAlp002CaptureEvidence(validQa, tempDir);
  assert.equal(validResult.capturesPass, true);
  assert.equal(validResult.logRestoreCapturePass, true);

  const targetName = 'browser-coverage-threshold10.jpg';
  const validBytes = fs.readFileSync(path.resolve(tempDir, targetName));
  const fake = Buffer.alloc(1024, 0);
  fake[0] = 0xff;
  fake[1] = 0xd8;
  fake[fake.length - 2] = 0xff;
  fake[fake.length - 1] = 0xd9;
  assert.equal(readJpegDimensions(fake), null, 'SOI/EOI-only payload must fail');
  fs.writeFileSync(path.resolve(tempDir, targetName), fake);
  assert.equal(inspectAlp002JpegEvidence(tempDir, targetName), null);

  const truncated = validBytes.subarray(0, Math.floor(validBytes.length / 2));
  fs.writeFileSync(path.resolve(tempDir, targetName), truncated);
  assert.equal(inspectAlp002JpegEvidence(tempDir, targetName), null, 'truncated JPEG must fail');

  const sofOnly = truncateAfterFirstSof(validBytes);
  assert.equal(readJpegDimensions(sofOnly), null, 'SOF without SOS scan data must fail');

  const craftedInvalid = makeCraftedInvalidJpeg();
  fs.writeFileSync(path.resolve(tempDir, targetName), craftedInvalid);
  assert.equal(readJpegDimensions(craftedInvalid), null, 'invalid SOF/SOS lengths must fail');
  assert.equal(inspectAlp002JpegEvidence(tempDir, targetName), null, 'crafted SOF/SOS payload must fail');

  const decoderTrap = makeCraftedInvalidJpeg({ structurallyPlausible: true });
  fs.writeFileSync(path.resolve(tempDir, targetName), decoderTrap);
  assert.deepEqual(readJpegDimensions(decoderTrap), { width: 640, height: 360 });
  assert.equal(inspectAlp002JpegEvidence(tempDir, targetName), null, 'non-decodable entropy payload must fail');

  const onePixel = rewriteFirstSofDimensions(validBytes, 1, 1);
  fs.writeFileSync(path.resolve(tempDir, targetName), onePixel);
  assert.deepEqual(readJpegDimensions(onePixel), { width: 1, height: 1 });
  assert.equal(inspectAlp002JpegEvidence(tempDir, targetName), null, '1x1 JPEG must fail minimum dimensions');

  fs.writeFileSync(path.resolve(tempDir, targetName), validBytes);
  const hashMismatchQa = structuredClone(validQa);
  hashMismatchQa.captureSha256[targetName] = sha256(Buffer.from('wrong evidence'));
  assert.equal(evaluateAlp002CaptureEvidence(hashMismatchQa, tempDir).capturesPass, false);
  assert.equal(inspectAlp002JpegEvidence(tempDir, '../browser-coverage-threshold10.jpg'), null);

  console.log('ALP-002 JPEG structure, decoder, dimensions, truncation, hash, and path evidence gates passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
