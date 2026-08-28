export const PAL002_OKLAB_TEMPORAL_EPSILON = 0.005;

export function relativeChangePercent(candidate, baseline){
  if(!Number.isFinite(candidate) || !Number.isFinite(baseline) || candidate < 0 || baseline < 0) return null;
  if(baseline === 0) return candidate === 0 ? 0 : null;
  return ((candidate - baseline) / baseline) * 100;
}

export function relativeImprovementPercent(candidate, baseline){
  const change = relativeChangePercent(candidate, baseline);
  return change === null ? null : -change;
}

export function regressionWithinLimit(candidate, baseline, limitPercent = 10){
  if(!Number.isFinite(limitPercent) || limitPercent < 0) return false;
  if(!Number.isFinite(candidate) || !Number.isFinite(baseline) || candidate < 0 || baseline < 0) return false;
  if(baseline === 0) return candidate === 0;
  return ((candidate - baseline) / baseline) * 100 <= limitPercent;
}

export function candidateEligible({
  improvementPercent,
  blindPreferencePercent = 0,
  runtimeRatio,
  featureRegressionPass,
  temporalRegressionPass,
  deterministic
}){
  const qualityPass = (Number.isFinite(improvementPercent) && improvementPercent >= 5) ||
    (Number.isFinite(blindPreferencePercent) && blindPreferencePercent >= 60);
  return deterministic === true && qualityPass && Number.isFinite(runtimeRatio) && runtimeRatio <= 3 &&
    featureRegressionPass === true && temporalRegressionPass === true;
}

export function summarizeCandidateCombination({
  algorithm,
  sampling,
  colors,
  candidateMean,
  baselineMean,
  candidateRuntimeMs,
  baselineRuntimeMs,
  candidateFeature,
  baselineFeature,
  candidateTemporal,
  baselineTemporal,
  blindPreferencePercent = 0,
  deterministic
}){
  const improvementPercent = relativeImprovementPercent(candidateMean, baselineMean);
  const runtimeRatio = Number.isFinite(candidateRuntimeMs) && Number.isFinite(baselineRuntimeMs) && baselineRuntimeMs > 0
    ? candidateRuntimeMs / baselineRuntimeMs
    : null;
  const featureChangePercent = relativeChangePercent(candidateFeature, baselineFeature);
  const temporalChangePercent = relativeChangePercent(candidateTemporal, baselineTemporal);
  const featureRegressionPass = regressionWithinLimit(candidateFeature, baselineFeature, 10);
  const temporalRegressionPass = regressionWithinLimit(candidateTemporal, baselineTemporal, 10);
  const eligibleByAutomatedMetrics = candidateEligible({
    improvementPercent,
    blindPreferencePercent,
    runtimeRatio,
    featureRegressionPass,
    temporalRegressionPass,
    deterministic
  });
  return {
    algorithm,
    sampling,
    colors,
    candidateMean,
    baselineMean,
    improvementPercent,
    runtimeRatio,
    candidateFeature,
    baselineFeature,
    featureChangePercent,
    featureRegressionPass,
    candidateTemporal,
    baselineTemporal,
    temporalChangePercent,
    temporalRegressionPass,
    blindPreferencePercent,
    deterministic,
    eligibleByAutomatedMetrics
  };
}

export function samplingCorpusValid({
  backgroundPixels,
  characterPixels,
  pixelSampleCount,
  imageBalancedSampleCount,
  pixelPaletteSha256,
  imageBalancedPaletteSha256,
  maxSamples = 50000
}){
  return Number.isInteger(backgroundPixels) && Number.isInteger(characterPixels) &&
    backgroundPixels >= characterPixels * 4 && characterPixels > 0 &&
    Number.isInteger(pixelSampleCount) && pixelSampleCount > 0 && pixelSampleCount <= maxSamples &&
    Number.isInteger(imageBalancedSampleCount) && imageBalancedSampleCount > 0 &&
    imageBalancedSampleCount <= maxSamples &&
    typeof pixelPaletteSha256 === 'string' && typeof imageBalancedPaletteSha256 === 'string' &&
    pixelPaletteSha256.length === 64 && imageBalancedPaletteSha256.length === 64 &&
    pixelPaletteSha256 !== imageBalancedPaletteSha256;
}
