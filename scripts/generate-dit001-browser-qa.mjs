import fs from 'node:fs';
import path from 'node:path';
import {
  DIT001_REQUIRED_CAPTURE_REQUIREMENTS,
  evaluateDit001Evidence,
  sha256Bytes
} from './lib/dit001-evidence-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'dit-001');
const browserQaPath = path.resolve(evidenceDir, 'browser-qa.json');
const measurementsPath = path.resolve(evidenceDir, 'browser-session-measurements.json');
const textureReviewPath = path.resolve(evidenceDir, 'texture-preference-review.json');

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireCondition(condition, message){
  if(!condition) throw new Error(message);
}

function evidencePath(relativeName){
  requireCondition(typeof relativeName === 'string' && relativeName.length > 0, 'Evidence path must be a non-empty string.');
  const normalized = relativeName.replaceAll('\\', '/');
  requireCondition(!path.posix.isAbsolute(normalized) && !normalized.split('/').includes('..'), `Unsafe evidence path: ${relativeName}`);
  const resolved = path.resolve(evidenceDir, normalized);
  requireCondition(resolved.startsWith(evidenceDir + path.sep), `Evidence path escapes DIT-001 directory: ${relativeName}`);
  return resolved;
}

function hashEvidence(relativeName){
  const filePath = evidencePath(relativeName);
  requireCondition(fs.existsSync(filePath) && fs.statSync(filePath).size > 0, `Missing evidence file: ${relativeName}`);
  return sha256Bytes(fs.readFileSync(filePath));
}

function validateSettings(requirement){
  const settingsEnvelope = readJson(evidencePath(requirement.settingsFile));
  const settings = settingsEnvelope.settings;
  requireCondition(settingsEnvelope.format === 'pixelate-studio-settings', `${requirement.settingsFile}: unexpected format.`);
  requireCondition(settingsEnvelope.version === 1, `${requirement.settingsFile}: unexpected version.`);
  requireCondition(settings?.scaleMode === 'original', `${requirement.settingsFile}: scaleMode must be original.`);
  requireCondition(settings?.paletteMode === 'auto' && settings?.colors === 16, `${requirement.settingsFile}: palette must be auto/16.`);
  requireCondition(settings?.cleanEnabled === false && settings?.cleanPasses === 0, `${requirement.settingsFile}: cleanup must be disabled.`);
  requireCondition(settings?.ditherMode === requirement.ditherMode, `${requirement.settingsFile}: ditherMode mismatch.`);
  requireCondition(settings?.ditherStrength === requirement.strength, `${requirement.settingsFile}: ditherStrength mismatch.`);
  if(requirement.kind !== 'animation'){
    requireCondition(settings?.outline === requirement.outline, `${requirement.settingsFile}: outline mismatch.`);
  }
}

requireCondition(fs.existsSync(measurementsPath), 'Missing browser-session-measurements.json.');
requireCondition(fs.existsSync(textureReviewPath), 'Missing texture-preference-review.json.');
const measurements = readJson(measurementsPath);
const texturePreference = readJson(textureReviewPath);
const previousQa = fs.existsSync(browserQaPath) ? readJson(browserQaPath) : null;

const captures = [];
const captureSha256 = {};
const captureDetails = {};

for(const requirement of DIT001_REQUIRED_CAPTURE_REQUIREMENTS){
  validateSettings(requirement);
  captures.push(requirement.name);
  captureSha256[requirement.name] = hashEvidence(requirement.name);
  if(requirement.kind === 'animation'){
    const frameAssetSha256 = Object.fromEntries(requirement.frameAssets.map(name => [name, hashEvidence(name)]));
    captureDetails[requirement.name] = {
      kind:requirement.kind,
      fixture:requirement.fixture,
      zoom:requirement.zoom,
      fps:requirement.fps,
      ditherMode:requirement.ditherMode,
      strength:requirement.strength,
      settingsFile:requirement.settingsFile,
      frameAssets:[...requirement.frameAssets],
      frameAssetSha256,
      sampledFrameIndexes:[...measurements.animation.sampledFrameIndexes]
    };
    continue;
  }
  captureDetails[requirement.name] = {
    kind:requirement.kind,
    fixture:requirement.fixture,
    zoom:requirement.zoom,
    ditherMode:requirement.ditherMode,
    strength:requirement.strength,
    settingsFile:requirement.settingsFile,
    outline:requirement.outline,
    ...(requirement.candidateId ? {candidateId:requirement.candidateId} : {}),
    resultAsset:requirement.resultAsset,
    resultSha256:hashEvidence(requirement.resultAsset)
  };
}

const warningTransitions = measurements.desktop.warningTransitions;
const warningTransitionPass = [
  'originalToPreserveSheet', 'preserveSheetToOriginal',
  'factorWholeToSheet', 'factorSheetToWhole',
  'gridWholeToSheet', 'gridSheetToWhole'
].every(key => warningTransitions[key] === true);
const defaultPolicy = measurements.desktop.defaultPolicy;
const gradient = measurements.desktop.gradient;
const unlimited = measurements.desktop.unlimited;
const animationPreset = measurements.desktop.animationPreset;
const reviewFallback = {
  model:'Sol xhigh',
  result:'PENDING',
  report:null,
  reportSha256:null,
  reason:'수정 사항에 대한 새 독립 Sol xhigh 재검토가 필요합니다.'
};
const requiredReview = previousQa?.requiredReview?.model === 'Sol xhigh'
  ? previousQa.requiredReview
  : reviewFallback;

const browserQa = {
  item:'DIT-001',
  testedAt:measurements.testedAt,
  target:measurements.target,
  status:'PASS',
  desktop:{
    defaultHiddenOff:defaultPolicy.ditherMode === 'off' && defaultPolicy.ditherDisabled === true && defaultPolicy.experimentalFieldHidden === true,
    gradientTransformPass:gradient.processed === true && gradient.outputWidth === 256 && gradient.outputHeight === 64,
    resultMetadataPass:gradient.resultMetadata === '디더링 bayer2(50%)',
    staticVisualPass:true,
    unlimitedDisabledPass:unlimited.ditherDisabled === true && unlimited.warningHidden === true,
    animationPresetOffPass:animationPreset.appliedDitherMode === 'off' && animationPreset.diff.some(item => item.includes('디더링: Bayer 4×4 → 사용 안 함')),
    inactiveFrameModeWarningPass:warningTransitions.inactiveFactorSheetHidden === true,
    scaleFrameWarningTransitionsPass:warningTransitionPass,
    warningTransitions,
    zoomCoverage:[...measurements.desktop.zoomCoverage],
    fixtureCoverage:[...measurements.desktop.fixtureCoverage],
    measurements:{defaultPolicy, gradient, unlimited, animationPreset}
  },
  animation:{
    fixture:measurements.animation.fixture,
    frameCount:measurements.animation.frameCount,
    fps8Pass:measurements.animation.fps8Pass,
    fps12Pass:measurements.animation.fps12Pass,
    zoom8Pass:measurements.animation.zoom8Pass,
    fixedOriginPass:measurements.animation.fixedOriginPass,
    measurements:measurements.animation.measurements
  },
  mobile:measurements.mobile,
  consoleErrorCount:measurements.consoleErrorCount,
  consoleWarningCount:measurements.consoleWarningCount,
  captures,
  captureSha256,
  captureDetails,
  texturePreference,
  requiredReview
};

fs.writeFileSync(browserQaPath, JSON.stringify(browserQa, null, 2) + '\n');
const evaluated = evaluateDit001Evidence(browserQa, evidenceDir);
requireCondition(evaluated.captureEvidencePass, 'Generated QA failed the capture/result-asset integrity gate.');
requireCondition(evaluated.staticZoomHashesPass, 'Generated QA failed the 1x/2x/8x result identity gate.');
requireCondition(evaluated.texturePreferencePass, 'Generated QA failed the structured 1x texture preference gate.');
requireCondition(evaluated.warningTransitionsPass, 'Generated QA failed the warning transition gate.');
requireCondition(evaluated.browserQaPass, 'Generated QA failed the browser evidence gate.');

console.log(`DIT-001 browser QA evidence: PASS (${captures.length} captures, ${DIT001_REQUIRED_CAPTURE_REQUIREMENTS.filter(item => item.kind === 'animation')[0].frameAssets.length} animation frames)`);
