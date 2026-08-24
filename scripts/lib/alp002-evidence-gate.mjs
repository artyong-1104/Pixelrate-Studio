import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const ALP002_CAPTURE_REQUIREMENTS = Object.freeze({
  'browser-coverage-threshold10.jpg': Object.freeze({ minWidth: 640, minHeight: 360 }),
  'browser-coverage-threshold128-mobile.jpg': Object.freeze({ minWidth: 320, minHeight: 640 }),
  'browser-outline-sheet.jpg': Object.freeze({ minWidth: 640, minHeight: 360 }),
  'browser-log-restore.jpg': Object.freeze({ minWidth: 640, minHeight: 360 })
});

export const ALP002_REQUIRED_CAPTURES = Object.freeze([
  'browser-coverage-threshold10.jpg',
  'browser-coverage-threshold128-mobile.jpg',
  'browser-outline-sheet.jpg'
]);

const START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

export function readJpegDimensions(bytes){
  if(!Buffer.isBuffer(bytes) || bytes.length < 4 ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9){
    return null;
  }
  let offset = 2;
  let dimensions = null;
  let frameComponents = null;
  while(offset + 3 < bytes.length){
    while(offset < bytes.length && bytes[offset] !== 0xff) offset++;
    while(offset < bytes.length && bytes[offset] === 0xff) offset++;
    if(offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if(marker === 0xd9) break;
    if(marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if(offset + 1 >= bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if(segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if(marker === 0xda){
      if(!dimensions || !frameComponents || segmentLength < 8) return null;
      const scanComponentCount = bytes[offset + 2];
      if(scanComponentCount < 1 || segmentLength !== 6 + (2 * scanComponentCount)) return null;
      const scanComponents = new Set();
      for(let i = 0; i < scanComponentCount; i++){
        const componentId = bytes[offset + 3 + (i * 2)];
        if(!frameComponents.has(componentId) || scanComponents.has(componentId)) return null;
        scanComponents.add(componentId);
      }
      const scanStart = offset + segmentLength;
      let entropyBytes = 0;
      for(let scanOffset = scanStart; scanOffset < bytes.length; scanOffset++){
        if(bytes[scanOffset] !== 0xff){
          entropyBytes++;
          continue;
        }
        while(scanOffset + 1 < bytes.length && bytes[scanOffset + 1] === 0xff) scanOffset++;
        if(scanOffset + 1 >= bytes.length) return null;
        const scanMarker = bytes[++scanOffset];
        if(scanMarker === 0x00){
          entropyBytes++;
          continue;
        }
        if(scanMarker >= 0xd0 && scanMarker <= 0xd7) continue;
        if(scanMarker === 0xd9){
          return entropyBytes > 0 && scanOffset === bytes.length - 1 ? dimensions : null;
        }
        return null;
      }
      return null;
    }
    if(START_OF_FRAME_MARKERS.has(marker)){
      if(dimensions || segmentLength < 11) return null;
      const componentCount = bytes[offset + 7];
      if(componentCount < 1 || segmentLength !== 8 + (3 * componentCount)) return null;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if(width < 1 || height < 1) return null;
      dimensions = { width, height };
      frameComponents = new Set();
      for(let i = 0; i < componentCount; i++){
        const componentId = bytes[offset + 8 + (i * 3)];
        if(frameComponents.has(componentId)) return null;
        frameComponents.add(componentId);
      }
    }
    offset += segmentLength;
  }
  return null;
}

export function decodeJpegDimensions(capturePath){
  const options = { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 };
  if(fs.existsSync('/usr/bin/sips')){
    const result = spawnSync('/usr/bin/sips', [
      '-g', 'pixelWidth', '-g', 'pixelHeight', capturePath
    ], options);
    if(result.status === 0){
      const width = Number(/pixelWidth:\s*(\d+)/.exec(result.stdout)?.[1]);
      const height = Number(/pixelHeight:\s*(\d+)/.exec(result.stdout)?.[1]);
      if(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0){
        return { width, height, decoder: 'sips' };
      }
    }
  }
  const result = spawnSync('identify', ['-format', '%w %h', capturePath], options);
  if(result.status === 0){
    const match = /^(\d+)\s+(\d+)$/.exec(result.stdout.trim());
    const width = Number(match?.[1]);
    const height = Number(match?.[2]);
    if(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0){
      return { width, height, decoder: 'ImageMagick identify' };
    }
  }
  return null;
}

export function inspectAlp002JpegEvidence(evidenceDir, name){
  if(typeof name !== 'string' || path.basename(name) !== name) return null;
  const requirement = ALP002_CAPTURE_REQUIREMENTS[name];
  if(!requirement) return null;
  const capturePath = path.resolve(evidenceDir, name);
  if(!fs.existsSync(capturePath) || fs.statSync(capturePath).size < 1024) return null;
  const bytes = fs.readFileSync(capturePath);
  const dimensions = readJpegDimensions(bytes);
  const decoded = dimensions ? decodeJpegDimensions(capturePath) : null;
  if(!dimensions || !decoded || decoded.width !== dimensions.width || decoded.height !== dimensions.height ||
      dimensions.width < requirement.minWidth || dimensions.height < requirement.minHeight){
    return null;
  }
  return {
    ...dimensions,
    decoder: decoded.decoder,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

export function evaluateAlp002CaptureEvidence(qa, evidenceDir){
  const captureEvidence = Object.fromEntries(ALP002_REQUIRED_CAPTURES.map(name => [
    name,
    inspectAlp002JpegEvidence(evidenceDir, name)
  ]));
  const capturesPass = ALP002_REQUIRED_CAPTURES.every(name => {
    const inspected = captureEvidence[name];
    return qa?.captures?.includes(name) && inspected && qa?.captureSha256?.[name] === inspected.sha256;
  });
  const logRestoreCaptureName = qa?.logRestore?.capture;
  const logRestoreCaptureEvidence = inspectAlp002JpegEvidence(evidenceDir, logRestoreCaptureName);
  const logRestoreCapturePass = Boolean(logRestoreCaptureEvidence) &&
    qa?.logRestore?.captureSha256 === logRestoreCaptureEvidence.sha256;
  return {
    captureEvidence,
    capturesPass,
    logRestoreCaptureName,
    logRestoreCaptureEvidence,
    logRestoreCapturePass
  };
}
