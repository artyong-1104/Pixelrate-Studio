import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const STATIC_CAPTURE_GROUPS = Object.freeze([
  { key:'gradient', fixture:'gradient-gray', ditherMode:'bayer2', strength:50, outline:false, settingsFile:'browser-settings-bayer2-50.json', resultAsset:'browser-result-assets/gradient-bayer2-50.png' },
  { key:'clean', fixture:'clean-pixel-art', ditherMode:'bayer4', strength:75, outline:false, settingsFile:'browser-settings-bayer4-75.json', resultAsset:'browser-result-assets/clean-bayer4-75.png' },
  { key:'alpha-outline', fixture:'alpha-edge', ditherMode:'bayer4', strength:75, outline:true, settingsFile:'browser-settings-bayer4-75-outline.json', resultAsset:'browser-result-assets/alpha-outline-bayer4-75.png' }
]);

const TEXTURE_CAPTURE_GROUPS = Object.freeze([
  { candidateId:'off', ditherMode:'off', strength:50, settingsFile:'browser-settings-off.json', resultAsset:'browser-result-assets/texture-off.png' },
  { candidateId:'bayer2-75', ditherMode:'bayer2', strength:75, settingsFile:'browser-settings-bayer2-75.json', resultAsset:'browser-result-assets/texture-bayer2-75.png' },
  { candidateId:'bayer2-100', ditherMode:'bayer2', strength:100, settingsFile:'browser-settings-bayer2-100.json', resultAsset:'browser-result-assets/texture-bayer2-100.png' },
  { candidateId:'bayer4-75', ditherMode:'bayer4', strength:75, settingsFile:'browser-settings-bayer4-75.json', resultAsset:'browser-result-assets/texture-bayer4-75.png' },
  { candidateId:'bayer4-100', ditherMode:'bayer4', strength:100, settingsFile:'browser-settings-bayer4-100.json', resultAsset:'browser-result-assets/texture-bayer4-100.png' }
]);

const animationFrameAssets = Object.freeze(Array.from({ length:16 }, (_, index) =>
  `browser-result-assets/animation-bayer4-75-${String(index).padStart(2, '0')}.png`
));

export const DIT001_REQUIRED_CAPTURE_REQUIREMENTS = Object.freeze([
  ...STATIC_CAPTURE_GROUPS.flatMap(group => [1, 2, 8].map(zoom => Object.freeze({
    name:`browser-${group.key}-${zoom}x.png`, kind:'static', fixture:group.fixture, zoom,
    ditherMode:group.ditherMode, strength:group.strength, outline:group.outline, settingsFile:group.settingsFile,
    resultAsset:group.resultAsset, surface:'desktop'
  }))),
  ...TEXTURE_CAPTURE_GROUPS.map(group => Object.freeze({
    name:`browser-texture-${group.candidateId}-1x.png`, kind:'texture-preference',
    fixture:'texture-checker', zoom:1, ditherMode:group.ditherMode, strength:group.strength,
    outline:false, candidateId:group.candidateId, settingsFile:group.settingsFile, resultAsset:group.resultAsset, surface:'desktop'
  })),
  Object.freeze({
    name:'browser-animation-8x8fps.png', kind:'animation', fixture:'animation-16', zoom:8,
    fps:8, ditherMode:'bayer4', strength:75, settingsFile:'browser-settings-bayer4-75.json', frameAssets:animationFrameAssets, surface:'desktop'
  }),
  Object.freeze({
    name:'browser-animation-8x12fps.png', kind:'animation', fixture:'animation-16', zoom:8,
    fps:12, ditherMode:'bayer4', strength:75, settingsFile:'browser-settings-bayer4-75.json', frameAssets:animationFrameAssets, surface:'desktop'
  }),
  Object.freeze({
    name:'browser-mobile-animation-8x12fps.png', kind:'animation', fixture:'animation-16', zoom:8,
    fps:12, ditherMode:'bayer4', strength:75, settingsFile:'browser-settings-bayer4-75.json', frameAssets:animationFrameAssets, surface:'mobile'
  })
]);

export const DIT001_REQUIRED_CAPTURES = Object.freeze(DIT001_REQUIRED_CAPTURE_REQUIREMENTS.map(item => item.name));
export const DIT001_TEXTURE_CANDIDATES = Object.freeze(TEXTURE_CAPTURE_GROUPS.filter(item => item.candidateId !== 'off').map(item => item.candidateId));

export function sha256Bytes(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(text){
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function resolveEvidencePath(evidenceDir, name){
  if(typeof name !== 'string' || name.length === 0 || name.includes('\0')) return null;
  const normalized = name.replaceAll('\\', '/');
  if(path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) return null;
  const base = path.resolve(evidenceDir);
  const resolved = path.resolve(base, normalized);
  if(resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

function paethPredictor(left, above, upperLeft){
  const value = left + above - upperLeft;
  const leftDistance = Math.abs(value - left);
  const aboveDistance = Math.abs(value - above);
  const upperLeftDistance = Math.abs(value - upperLeft);
  if(leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if(aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function inspectPngPixels(bytes, width, height){
  let offset = 8;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const idat = [];
  while(offset + 12 <= bytes.length){
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if(dataEnd + 4 > bytes.length) return null;
    if(type === 'IHDR'){
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if(type === 'IDAT'){
      idat.push(bytes.subarray(dataStart, dataEnd));
    }
    offset = dataEnd + 4;
    if(type === 'IEND') break;
  }
  const channels = colorType === 6 ? 4 : (colorType === 2 ? 3 : null);
  if(bitDepth !== 8 || channels === null || interlace !== 0 || idat.length === 0) return null;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if(inflated.length !== (stride + 1) * height) return null;
  const raw = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for(let y = 0; y < height; y++){
    const filter = inflated[sourceOffset++];
    const rowOffset = y * stride;
    for(let x = 0; x < stride; x++){
      const encoded = inflated[sourceOffset++];
      const left = x >= channels ? raw[rowOffset + x - channels] : 0;
      const above = y > 0 ? raw[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? raw[rowOffset - stride + x - channels] : 0;
      let value;
      if(filter === 0) value = encoded;
      else if(filter === 1) value = encoded + left;
      else if(filter === 2) value = encoded + above;
      else if(filter === 3) value = encoded + Math.floor((left + above) / 2);
      else if(filter === 4) value = encoded + paethPredictor(left, above, upperLeft);
      else return null;
      raw[rowOffset + x] = value & 255;
    }
  }

  const pixelCount = width * height;
  const sampleStep = Math.max(1, Math.floor(pixelCount / 100000));
  const counts = new Map();
  let sampledPixels = 0;
  let opaquePixels = 0;
  let partialAlphaPixels = 0;
  let transparentPixels = 0;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  for(let pixel = 0; pixel < pixelCount; pixel += sampleStep){
    const index = pixel * channels;
    const red = raw[index];
    const green = raw[index + 1];
    const blue = raw[index + 2];
    const alpha = channels === 4 ? raw[index + 3] : 255;
    const key = `${red},${green},${blue},${alpha}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    if(alpha === 0) transparentPixels++;
    else if(alpha === 255) opaquePixels++;
    else partialAlphaPixels++;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    sampledPixels++;
  }
  const dominantCount = Math.max(...counts.values());
  const luminanceMean = luminanceSum / sampledPixels;
  return {
    sampledPixels,
    uniqueColorCount:counts.size,
    dominantColorRatio:Number((dominantCount / sampledPixels).toFixed(6)),
    luminanceVariance:Number((luminanceSquaredSum / sampledPixels - luminanceMean ** 2).toFixed(6)),
    opaquePixels,
    partialAlphaPixels,
    transparentPixels
  };
}

export function inspectDit001PngEvidence(evidenceDir, name){
  const capturePath = resolveEvidencePath(evidenceDir, name);
  if(!capturePath || !fs.existsSync(capturePath)) return null;
  const bytes = fs.readFileSync(capturePath);
  if(bytes.length < 24 ||
      bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 ||
      bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52){
    return null;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if(width < 1 || height < 1) return null;
  let visual = null;
  try { visual = inspectPngPixels(bytes, width, height); }
  catch { return null; }
  if(!visual) return null;
  return { width, height, bytes:bytes.length, sha256:sha256Bytes(bytes), visual };
}

function screenshotVisualPass(inspected, requirement){
  if(!inspected) return false;
  if(requirement.kind === 'static' || requirement.kind === 'texture-preference'){
    return inspected.width >= 64 && inspected.height >= 64 && resultAssetVisualPass(inspected, requirement.fixture);
  }
  const dimensionsPass = requirement.surface === 'mobile'
    ? inspected.width >= 350 && inspected.width <= 430 && inspected.height >= 700
    : inspected.width >= 600 && inspected.height >= 500;
  return dimensionsPass && inspected.visual.uniqueColorCount >= 8 &&
    inspected.visual.dominantColorRatio < 0.995 && inspected.visual.luminanceVariance >= 2;
}

function resultAssetVisualPass(inspected, fixture){
  if(!inspected || inspected.width < 16 || inspected.height < 16) return false;
  const visual = inspected.visual;
  if(fixture === 'gradient-gray') return visual.uniqueColorCount >= 8 && visual.opaquePixels > 0;
  if(fixture === 'clean-pixel-art') return visual.uniqueColorCount >= 4 && visual.opaquePixels > 0;
  if(fixture === 'alpha-edge') return visual.uniqueColorCount >= 3 && visual.opaquePixels > 0 && visual.luminanceVariance >= 2;
  if(fixture === 'texture-checker') return visual.uniqueColorCount >= 8 && visual.opaquePixels > 0;
  if(fixture === 'animation-16') return visual.uniqueColorCount >= 4 && visual.opaquePixels > 0;
  return false;
}

function exactDetailMatch(detail, requirement){
  if(!detail || detail.kind !== requirement.kind || detail.fixture !== requirement.fixture ||
      detail.zoom !== requirement.zoom || detail.ditherMode !== requirement.ditherMode ||
      detail.strength !== requirement.strength || detail.settingsFile !== requirement.settingsFile){
    return false;
  }
  if(requirement.kind === 'static' || requirement.kind === 'texture-preference'){
    return detail.outline === requirement.outline && detail.resultAsset === requirement.resultAsset &&
      (!requirement.candidateId || detail.candidateId === requirement.candidateId);
  }
  return detail.fps === requirement.fps && Array.isArray(detail.frameAssets) &&
    JSON.stringify(detail.frameAssets) === JSON.stringify(requirement.frameAssets);
}

function inspectResultAsset(evidenceDir, detail, fixture){
  const inspected = inspectDit001PngEvidence(evidenceDir, detail?.resultAsset);
  if(!inspected || detail?.resultSha256 !== inspected.sha256 || !resultAssetVisualPass(inspected, fixture)) return null;
  return inspected;
}

function inspectAnimationAssets(evidenceDir, requirement, detail){
  if(!exactDetailMatch(detail, requirement) || !detail.frameAssetSha256 || typeof detail.frameAssetSha256 !== 'object') return null;
  const inspected = {};
  for(const asset of requirement.frameAssets){
    const result = inspectDit001PngEvidence(evidenceDir, asset);
    if(!result || detail.frameAssetSha256[asset] !== result.sha256 || !resultAssetVisualPass(result, 'animation-16')) return null;
    inspected[asset] = result;
  }
  if(new Set(Object.values(detail.frameAssetSha256)).size < 8) return null;
  if(!Array.isArray(detail.sampledFrameIndexes) || detail.sampledFrameIndexes.length < 4 ||
      detail.sampledFrameIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= 16)) return null;
  return inspected;
}

function evaluateTexturePreference(qa){
  const preference = qa?.texturePreference;
  const evaluations = Array.isArray(preference?.evaluations) ? preference.evaluations : [];
  const byCandidate = Object.fromEntries(evaluations.map(item => [item?.candidateId, item]));
  const expectedCapture = Object.fromEntries(TEXTURE_CAPTURE_GROUPS.map(group => [
    group.candidateId, `browser-texture-${group.candidateId}-1x.png`
  ]));
  const decisions = {};
  const evaluationsPass = DIT001_TEXTURE_CANDIDATES.every(candidateId => {
    const item = byCandidate[candidateId];
    const decisionPass = item?.decision === 'ACCEPTABLE' || item?.decision === 'REJECTED';
    const rationalePass = typeof item?.rationale === 'string' && item.rationale.trim().length >= 20;
    if(decisionPass) decisions[candidateId] = item.decision;
    return decisionPass && rationalePass && item.capture === expectedCapture[candidateId] && item.zoom === 1;
  });
  const pass = preference?.status === 'PASS' && preference?.fixture === 'texture-checker' &&
    preference?.zoom === 1 && preference?.baselineCapture === expectedCapture.off &&
    preference?.criteria?.textureNoiseReviewed === true && preference?.criteria?.edgeLegibilityReviewed === true &&
    typeof preference?.reviewer === 'string' && preference.reviewer.trim().length > 0 &&
    Number.isFinite(Date.parse(preference?.evaluatedAt || '')) && evaluationsPass;
  return { pass, decisions:pass ? decisions : {} };
}

export function evaluateDit001Evidence(qa, evidenceDir){
  const captureEvidence = Object.fromEntries(DIT001_REQUIRED_CAPTURE_REQUIREMENTS.map(requirement => [
    requirement.name, inspectDit001PngEvidence(evidenceDir, requirement.name)
  ]));
  const resultAssetEvidence = {};
  const captureEvidencePass = DIT001_REQUIRED_CAPTURE_REQUIREMENTS.every(requirement => {
    const inspected = captureEvidence[requirement.name];
    const detail = qa?.captureDetails?.[requirement.name];
    if(!qa?.captures?.includes(requirement.name) || !inspected ||
        qa?.captureSha256?.[requirement.name] !== inspected.sha256 ||
        !screenshotVisualPass(inspected, requirement) || !exactDetailMatch(detail, requirement)){
      return false;
    }
    if(requirement.kind === 'animation'){
      const animationEvidence = inspectAnimationAssets(evidenceDir, requirement, detail);
      if(!animationEvidence) return false;
      Object.assign(resultAssetEvidence, animationEvidence);
      return true;
    }
    const resultEvidence = inspectResultAsset(evidenceDir, detail, requirement.fixture);
    if(!resultEvidence) return false;
    resultAssetEvidence[detail.resultAsset] = resultEvidence;
    return true;
  });
  const staticZoomHashesPass = STATIC_CAPTURE_GROUPS.every(group => {
    const details = [1, 2, 8].map(zoom => qa?.captureDetails?.[`browser-${group.key}-${zoom}x.png`]);
    return details.every(detail => detail?.resultAsset === group.resultAsset && detail?.resultSha256 === details[0]?.resultSha256);
  });
  const texturePreference = evaluateTexturePreference(qa);
  const warningTransitions = qa?.desktop?.warningTransitions;
  const warningTransitionsPass = qa?.desktop?.scaleFrameWarningTransitionsPass === true &&
    warningTransitions?.originalToPreserveSheet === true && warningTransitions?.preserveSheetToOriginal === true &&
    warningTransitions?.factorWholeToSheet === true && warningTransitions?.factorSheetToWhole === true &&
    warningTransitions?.gridWholeToSheet === true && warningTransitions?.gridSheetToWhole === true;
  const browserQaPass = qa?.status === 'PASS' &&
    qa?.desktop?.defaultHiddenOff === true && qa?.desktop?.gradientTransformPass === true &&
    qa?.desktop?.resultMetadataPass === true && qa?.desktop?.staticVisualPass === true &&
    qa?.desktop?.unlimitedDisabledPass === true && qa?.desktop?.animationPresetOffPass === true &&
    qa?.desktop?.inactiveFrameModeWarningPass === true && warningTransitionsPass &&
    Array.isArray(qa?.desktop?.zoomCoverage) && JSON.stringify(qa.desktop.zoomCoverage) === JSON.stringify([1, 2, 8]) &&
    Array.isArray(qa?.desktop?.fixtureCoverage) && ['gradient-gray', 'clean-pixel-art', 'alpha-edge', 'texture-checker'].every(id => qa.desktop.fixtureCoverage.includes(id)) &&
    qa?.animation?.frameCount === 16 && qa?.animation?.fps8Pass === true &&
    qa?.animation?.fps12Pass === true && qa?.animation?.zoom8Pass === true &&
    qa?.animation?.fixedOriginPass === true && qa?.mobile?.viewportWidth === 390 &&
    qa?.mobile?.layoutPass === true && qa?.mobile?.documentScrollWidth <= qa?.mobile?.viewportWidth &&
    qa?.consoleErrorCount === 0 && texturePreference.pass && staticZoomHashesPass && captureEvidencePass;

  const reportName = qa?.requiredReview?.report;
  const reportPath = resolveEvidencePath(evidenceDir, reportName);
  const reviewReportExists = Boolean(reportPath && fs.existsSync(reportPath) && fs.statSync(reportPath).size > 0);
  const reviewText = reviewReportExists ? fs.readFileSync(reportPath, 'utf8') : '';
  const reviewReportSha256 = reviewReportExists ? sha256Text(reviewText) : null;
  const requiredReviewPass = qa?.requiredReview?.model === 'Sol xhigh' &&
    qa?.requiredReview?.result === 'PASS' && qa?.requiredReview?.reportSha256 === reviewReportSha256 &&
    /(?:^|\n)(?:FINAL_VERDICT|RECOMMENDATION):\s*PASS\s*(?:\n|$)/.test(reviewText) &&
    !/(?:^|\n)(?:FINAL_VERDICT|RECOMMENDATION):\s*(?:FAIL|CHANGES_REQUESTED)\s*(?:\n|$)/.test(reviewText);

  return {
    browserQaPass,
    captureEvidence,
    captureEvidencePass,
    resultAssetEvidence,
    staticZoomHashesPass,
    texturePreferencePass:texturePreference.pass,
    texturePreferenceDecisions:texturePreference.decisions,
    warningTransitionsPass,
    requiredReviewPass,
    reviewReportExists,
    reviewReportSha256
  };
}
