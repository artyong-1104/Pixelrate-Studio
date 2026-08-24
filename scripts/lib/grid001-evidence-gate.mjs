import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const GRID001_REQUIRED_CAPTURES = Object.freeze([
  'browser-clean-8px-overlay.jpg',
  'browser-clean-pixel-art-auto.jpg',
  'browser-photo-safe-reject.jpg',
  'browser-sequence-lock.jpg',
  'browser-mobile-manual.jpg'
]);

export function sha256Text(text){
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function jpegDimensions(bytes){
  if(bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9){
    return null;
  }
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while(offset + 3 < bytes.length){
    while(offset < bytes.length && bytes[offset] !== 0xff) offset++;
    while(offset < bytes.length && bytes[offset] === 0xff) offset++;
    if(offset >= bytes.length) break;
    const marker = bytes[offset++];
    if(marker === 0xd9 || marker === 0xda) break;
    if(marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if(offset + 1 >= bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if(segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if(startOfFrameMarkers.has(marker)){
      if(segmentLength < 8) return null;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

export function inspectGrid001JpegEvidence(evidenceDir, name){
  if(typeof name !== 'string' || path.basename(name) !== name) return false;
  const capturePath = path.resolve(evidenceDir, name);
  if(!fs.existsSync(capturePath) || fs.statSync(capturePath).size < 1024) return null;
  const bytes = fs.readFileSync(capturePath);
  const dimensions = jpegDimensions(bytes);
  if(!dimensions || dimensions.width < 64 || dimensions.height < 64) return null;
  return {
    ...dimensions,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

export function evaluateGrid001Evidence(qa, evidenceDir){
  const captureEvidence = Object.fromEntries(GRID001_REQUIRED_CAPTURES.map(name => [
    name,
    inspectGrid001JpegEvidence(evidenceDir, name)
  ]));
  const captureEvidencePass = GRID001_REQUIRED_CAPTURES.every(name => {
    const inspected = captureEvidence[name];
    return qa?.captures?.includes(name) && inspected && qa?.captureSha256?.[name] === inspected.sha256;
  });
  const reviewReportName = qa?.requiredReview?.report;
  const reviewReportPath = typeof reviewReportName === 'string' && path.basename(reviewReportName) === reviewReportName
    ? path.resolve(evidenceDir, reviewReportName)
    : null;
  const reviewReportExists = Boolean(
    reviewReportPath && fs.existsSync(reviewReportPath) && fs.statSync(reviewReportPath).size > 0
  );
  const reviewReportText = reviewReportExists ? fs.readFileSync(reviewReportPath, 'utf8') : '';
  const reviewReportSha256 = reviewReportExists ? sha256Text(reviewReportText) : null;
  const browserQaPass = qa?.status === 'PASS' &&
    qa?.algorithmVersion === 2 &&
    qa?.desktop?.clean8px?.applyPass === true &&
    qa?.desktop?.mediumConfidence?.pass === true &&
    qa?.desktop?.cleanPixelArt?.pass === true &&
    qa?.desktop?.cleanPixelArt?.detected?.sizeX === 4 &&
    qa?.desktop?.cleanPixelArt?.detected?.sizeY === 4 &&
    qa?.desktop?.cleanPixelArt?.detected?.phaseX === 0 &&
    qa?.desktop?.cleanPixelArt?.detected?.phaseY === 0 &&
    qa?.desktop?.wobble?.pass === true &&
    qa?.desktop?.lowContrast?.pass === true &&
    qa?.desktop?.photoLike?.pass === true &&
    qa?.sheet?.pass === true &&
    qa?.sequence?.pass === true &&
    qa?.sequence?.viewportVariance === 0 &&
    qa?.mobile?.pass === true &&
    qa?.cancellation?.pass === true &&
    qa?.limits?.pass === true &&
    qa?.performance?.pass === true &&
    Number.isFinite(qa?.performance?.preprocessMaxChunkMs) &&
    Number.isFinite(qa?.performance?.sobelMaxChunkMs) &&
    Number.isFinite(qa?.performance?.endToEndMaxChunkMs) &&
    qa.performance.endToEndMaxChunkMs <= 100 &&
    qa?.consoleErrorCount === 0 &&
    captureEvidencePass;
  const requiredReviewPass = qa?.requiredReview?.model === 'Sol xhigh' &&
    qa?.requiredReview?.result === 'PASS' &&
    reviewReportExists &&
    qa?.requiredReview?.reportSha256 === reviewReportSha256 &&
    /(?:^|\n)RECOMMENDATION:\s*PASS\s*(?:\n|$)/.test(reviewReportText) &&
    !/(?:^|\n)RECOMMENDATION:\s*CHANGES_REQUESTED\s*(?:\n|$)/.test(reviewReportText);
  return {
    browserQaPass,
    captureEvidence,
    captureEvidencePass,
    requiredReviewPass,
    reviewReportExists,
    reviewReportSha256
  };
}
