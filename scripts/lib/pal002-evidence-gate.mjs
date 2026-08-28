import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decodeJpegDimensions, readJpegDimensions } from './alp002-evidence-gate.mjs';
import { PAL002_OKLAB_TEMPORAL_EPSILON } from './pal002-evaluation.mjs';

export const PAL002_CAPTURE_REQUIREMENTS = Object.freeze({
  'browser-algorithm-ab.jpg': Object.freeze({ minWidth: 640, minHeight: 360 }),
  'browser-reference-error.jpg': Object.freeze({ minWidth: 640, minHeight: 360 }),
  'browser-mobile.jpg': Object.freeze({ minWidth: 320, minHeight: 640 }),
  'browser-oklab-stable-product.jpg': Object.freeze({ minWidth: 640, minHeight: 360 }),
  'browser-oklab-stable-mobile.jpg': Object.freeze({ minWidth: 320, minHeight: 640 }),
  'browser-blind-a.jpg': Object.freeze({ minWidth: 128, minHeight: 128 }),
  'browser-blind-b.jpg': Object.freeze({ minWidth: 128, minHeight: 128 })
});

export const PAL002_REQUIRED_CAPTURES = Object.freeze(Object.keys(PAL002_CAPTURE_REQUIREMENTS));
const PAL002_BLIND_CAPTURES = Object.freeze(['browser-blind-a.jpg', 'browser-blind-b.jpg']);
const PAL002_BLIND_ALGORITHMS = Object.freeze(['kmeans-oklab', 'kmeans-srgb']);
const PAL002_BLIND_RESULTS = Object.freeze({
  'candidate-preferred': 100,
  'baseline-preferred': 0,
  tie: 50
});
const PAL002_MANUAL_GROUPS = Object.freeze({
  gradient: Object.freeze(['baseline', 'oklab', 'median']),
  sprite: Object.freeze(['baseline', 'oklab', 'median']),
  photo: Object.freeze(['baseline', 'oklab', 'median']),
  'large-small': Object.freeze(['baseline', 'balanced', 'reference']),
  animation: Object.freeze(['baseline', 'oklab', 'median'])
});
const PAL002_MANUAL_COLORS = Object.freeze([8, 16, 32, 64]);
const PAL002_MANUAL_CAPTURES = Object.freeze([
  'browser-manual-gradient.jpg',
  'browser-manual-gradient-median.jpg',
  'browser-manual-photo.jpg',
  'browser-manual-large-small.jpg',
  'browser-manual-animation-stable.jpg',
  'browser-manual-animation-stable-next.jpg'
]);

export function inspectPal002JpegEvidence(evidenceDir, name){
  if(typeof name !== 'string' || path.basename(name) !== name) return null;
  const requirement = PAL002_CAPTURE_REQUIREMENTS[name];
  if(!requirement) return null;
  const capturePath = path.resolve(evidenceDir, name);
  if(!fs.existsSync(capturePath) || fs.statSync(capturePath).size < 1024) return null;
  const bytes = fs.readFileSync(capturePath);
  const parsed = readJpegDimensions(bytes);
  const decoded = parsed ? decodeJpegDimensions(capturePath) : null;
  if(!parsed || !decoded || parsed.width !== decoded.width || parsed.height !== decoded.height ||
      parsed.width < requirement.minWidth || parsed.height < requirement.minHeight){
    return null;
  }
  return {
    width: parsed.width,
    height: parsed.height,
    decoder: decoded.decoder,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

export function validatePal002BlindPreference(preference){
  if(!preference || preference.completed !== true || preference.labelsHidden !== true ||
      preference.validForEvaluation !== true || preference.comparisonOrderRandomized !== true ||
      preference.mappingRevealedAfterVerdict !== true ||
      preference.candidateAlgorithm !== 'kmeans-oklab'){
    return false;
  }
  const captureNames = preference.captures;
  if(!Array.isArray(captureNames) || captureNames.length !== PAL002_BLIND_CAPTURES.length ||
      new Set(captureNames).size !== PAL002_BLIND_CAPTURES.length ||
      !PAL002_BLIND_CAPTURES.every(name => captureNames.includes(name))){
    return false;
  }
  const mapping = preference.mapping;
  if(!mapping || Object.keys(mapping).sort().join(',') !== 'A,B' ||
      !PAL002_BLIND_ALGORITHMS.includes(mapping.A) || !PAL002_BLIND_ALGORITHMS.includes(mapping.B) ||
      mapping.A === mapping.B || !Object.values(mapping).includes(preference.candidateAlgorithm)){
    return false;
  }
  const expectedPercent = PAL002_BLIND_RESULTS[preference.result];
  const percent = preference.preferencePercentForCandidate;
  return Number.isFinite(expectedPercent) && Number.isFinite(percent) && percent >= 0 && percent <= 100 &&
    percent === expectedPercent && Number.isFinite(preference.confidence) &&
    preference.confidence >= 0 && preference.confidence <= 1;
}

export function evaluatePal002CaptureEvidence(qa, evidenceDir){
  const captureEvidence = Object.fromEntries(PAL002_REQUIRED_CAPTURES.map(name => [
    name,
    inspectPal002JpegEvidence(evidenceDir, name)
  ]));
  const capturesPass = PAL002_REQUIRED_CAPTURES.every(name => {
    const inspected = captureEvidence[name];
    return qa?.captures?.includes(name) && inspected && qa?.captureSha256?.[name] === inspected.sha256;
  });
  const blindEvidencePass = validatePal002BlindPreference(qa?.blindPreference);
  return { captureEvidence, capturesPass, blindEvidencePass };
}

function readPngDimensions(bytes){
  if(bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.subarray(12, 16).toString('ascii') !== 'IHDR'){
    return null;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function evaluatePal002ManualMatrixEvidence(qa, evidenceDir, { promotionCellIds = [] } = {}){
  const record = qa?.actualSizeMatrix;
  const manifestName = record?.manifest;
  if(manifestName !== 'browser-manual-matrix.json') return { pass: false, cellCount: 0, assetCount: 0 };
  const manifestPath = path.resolve(evidenceDir, manifestName);
  if(!fs.existsSync(manifestPath)) return { pass: false, cellCount: 0, assetCount: 0 };
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    return { pass: false, cellCount: 0, assetCount: 0 };
  }
  const expectedCellIds = Object.keys(PAL002_MANUAL_GROUPS).flatMap(group =>
    PAL002_MANUAL_COLORS.map(colors => `${group}-${colors}`)
  );
  const cells = Array.isArray(manifest.cells) ? manifest.cells : [];
  const cellIds = cells.map(cell => cell.id);
  let assetCount = 0;
  const manifestPass = manifest.implementationId === 'PAL-002' && manifest.actualSizeScale === 1 &&
    manifest.oklabTemporalEpsilon === PAL002_OKLAB_TEMPORAL_EPSILON &&
    manifest.cellCount === expectedCellIds.length && cells.length === expectedCellIds.length &&
    new Set(cellIds).size === expectedCellIds.length &&
    expectedCellIds.every(id => cellIds.includes(id)) &&
    cells.every(cell => {
      const variants = PAL002_MANUAL_GROUPS[cell.group];
      const outputIds = Array.isArray(cell.outputs) ? cell.outputs.map(output => output.id) : [];
      if(!variants || !PAL002_MANUAL_COLORS.includes(cell.colors) || cell.id !== `${cell.group}-${cell.colors}` ||
          outputIds.length !== variants.length || new Set(outputIds).size !== variants.length ||
          !variants.every(id => outputIds.includes(id))){
        return false;
      }
      return cell.outputs.every(output => {
        const frames = output.frames;
        const expectedFrames = cell.group === 'animation' ? 16 : 1;
        if(!Array.isArray(frames) || frames.length !== expectedFrames) return false;
        assetCount += frames.length;
        return frames.every(frame => {
          if(typeof frame.src !== 'string' || !frame.src.startsWith('browser-manual-assets/') ||
              path.basename(frame.src) === frame.src){
            return false;
          }
          const assetPath = path.resolve(evidenceDir, frame.src);
          const assetRoot = path.resolve(evidenceDir, 'browser-manual-assets');
          if(path.dirname(assetPath) !== assetRoot || !fs.existsSync(assetPath)) return false;
          const bytes = fs.readFileSync(assetPath);
          const dimensions = readPngDimensions(bytes);
          return dimensions?.width === output.width && dimensions?.height === output.height &&
            crypto.createHash('sha256').update(bytes).digest('hex') === frame.sha256;
        });
      });
    });
  const qaGroups = Array.isArray(record?.groups) ? record.groups : [];
  const qaCellCount = qaGroups.reduce((sum, group) => sum + (Array.isArray(group.cells) ? group.cells.length : 0), 0);
  const recordPass = record?.manifestSha256 === manifestSha256 && record?.actualSizeScale === 1 &&
    record?.cellCount === expectedCellIds.length && qaGroups.length === Object.keys(PAL002_MANUAL_GROUPS).length &&
    new Set(qaGroups.map(group => group.id)).size === Object.keys(PAL002_MANUAL_GROUPS).length &&
    Object.keys(PAL002_MANUAL_GROUPS).every(groupId => {
      const group = qaGroups.find(candidate => candidate.id === groupId);
      const expectedVariants = PAL002_MANUAL_GROUPS[groupId];
      if(!group || !Array.isArray(group.variants) || group.variants.length !== expectedVariants.length ||
          !expectedVariants.every(id => group.variants.includes(id)) || !Array.isArray(group.cells) ||
          group.cells.length !== PAL002_MANUAL_COLORS.length){
        return false;
      }
      return PAL002_MANUAL_COLORS.every(colors => {
        const cell = group.cells.find(candidate => candidate.colors === colors);
        const promotionExpected = promotionCellIds.includes(`${groupId}-${colors}`);
        return cell?.actualSizeChecked === true && typeof cell.featureVerdict === 'string' &&
          cell.featureVerdict.length > 0 && typeof cell.flickerVerdict === 'string' &&
          cell.flickerVerdict.length > 0 && cell.candidatePromotionSupported === promotionExpected && cell.pass === true;
      });
    }) && qaCellCount === expectedCellIds.length && record?.consoleErrors?.length === 0 && record?.pass === true;
  const capturesPass = Array.isArray(record?.representativeCaptures) &&
    record.representativeCaptures.length === PAL002_MANUAL_CAPTURES.length &&
    new Set(record.representativeCaptures).size === PAL002_MANUAL_CAPTURES.length &&
    PAL002_MANUAL_CAPTURES.every(name => {
      if(!record.representativeCaptures.includes(name)) return false;
      const capturePath = path.resolve(evidenceDir, name);
      if(!fs.existsSync(capturePath) || fs.statSync(capturePath).size < 1024) return false;
      const bytes = fs.readFileSync(capturePath);
      const parsed = readJpegDimensions(bytes);
      const decoded = parsed ? decodeJpegDimensions(capturePath) : null;
      return parsed && decoded && parsed.width === decoded.width && parsed.height === decoded.height &&
        record.captureSha256?.[name] === crypto.createHash('sha256').update(bytes).digest('hex');
    });
  return {
    pass: manifestPass && recordPass && capturesPass,
    manifestSha256,
    cellCount: cells.length,
    qaCellCount,
    assetCount,
    capturesPass
  };
}
