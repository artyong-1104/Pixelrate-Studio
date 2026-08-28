'use strict';

const PERF001_MAX_PIXELS = 4 * 1024 * 1024;
const PERF001_MAX_PALETTE_COLORS = 256;
const PERF001_MAX_PALETTE_SAMPLES = 50000;
const PERF001_DEFAULT_CHUNK_PIXELS = 16384;
const PERF001_ALLOWED_ALGORITHMS = new Set(['kmeans-srgb', 'kmeans-oklab']);
const PERF001_ALLOWED_DITHER_MODES = new Set(['off', 'bayer2', 'bayer4']);
const PERF001_BAYER_MATRICES = Object.freeze({
  bayer2: Object.freeze([[0, 2], [3, 1]]),
  bayer4: Object.freeze([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]])
});

let activeJob = null;
const cancelledBeforeStart = new Set();
const completedJobs = new Set();
const chunkChannel = new MessageChannel();
const scheduledChunks = [];
chunkChannel.port1.addEventListener('message', () => {
  const state = scheduledChunks.shift();
  if(state?.kind === 'cleanup') processCleanupChunk(state);
  else if(state) processPaletteChunk(state);
});
chunkChannel.port1.start();

function schedulePaletteChunk(state){
  state.scheduleCount = (state.scheduleCount || 0) + 1;
  if(state.scheduleCount % 4 === 0){
    setTimeout(() => state.kind === 'cleanup' ? processCleanupChunk(state) : processPaletteChunk(state), 0);
    return;
  }
  scheduledChunks.push(state);
  chunkChannel.port2.postMessage(null);
}

function postWorkerMessage(message, transfer = []){
  self.postMessage(message, transfer);
}

function postWorkerError(jobId, code, message){
  postWorkerMessage({ type:'error', jobId, code, message });
}

function rememberCompletedJob(jobId){
  completedJobs.add(jobId);
  if(completedJobs.size > 128){
    completedJobs.delete(completedJobs.values().next().value);
  }
}

function isPlainObject(value){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJobId(jobId){
  return typeof jobId === 'string' && /^[1-9][0-9]{0,15}$/.test(jobId);
}

function validatePalette(palette){
  return Array.isArray(palette) && palette.length >= 1 && palette.length <= PERF001_MAX_PALETTE_COLORS &&
    palette.every(color => Array.isArray(color) && color.length === 3 &&
      color.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255));
}

function validateProcessRequest(message){
  if(!isPlainObject(message) || message.type !== 'process-stage') return 'INVALID_MESSAGE';
  if(!validateJobId(message.jobId)) return 'INVALID_JOB_ID';
  if(message.stage !== 'palette-map') return 'UNSUPPORTED_STAGE';
  if(!isPlainObject(message.payload) || !isPlainObject(message.settings)) return 'INVALID_MESSAGE';
  const { dataBuffer, alphaBuffer, previousGridBuffer, pixelCount, palette } = message.payload;
  const { algorithm, threshold, temporalEpsilon, ditherMode, ditherStrength, width } = message.settings;
  if(!(dataBuffer instanceof ArrayBuffer) || !(alphaBuffer instanceof ArrayBuffer)) return 'INVALID_BUFFER';
  if(!Number.isInteger(pixelCount) || pixelCount < 1 || pixelCount > PERF001_MAX_PIXELS) return 'INVALID_PIXEL_COUNT';
  if(dataBuffer.byteLength !== pixelCount * 4 || alphaBuffer.byteLength !== pixelCount) return 'INVALID_BUFFER_LENGTH';
  if(previousGridBuffer !== null && previousGridBuffer !== undefined &&
      (!(previousGridBuffer instanceof ArrayBuffer) || previousGridBuffer.byteLength !== pixelCount * 4)) return 'INVALID_PREVIOUS_GRID';
  if(!validatePalette(palette)) return 'INVALID_PALETTE';
  if(!PERF001_ALLOWED_ALGORITHMS.has(algorithm)) return 'INVALID_ALGORITHM';
  if(!Number.isInteger(threshold) || threshold < 1 || threshold > 254) return 'INVALID_THRESHOLD';
  if(!Number.isFinite(temporalEpsilon) || temporalEpsilon < 0 || temporalEpsilon > 1) return 'INVALID_TEMPORAL_EPSILON';
  if(!PERF001_ALLOWED_DITHER_MODES.has(ditherMode)) return 'INVALID_DITHER_MODE';
  if(!Number.isInteger(ditherStrength) || ditherStrength < 0 || ditherStrength > 100) return 'INVALID_DITHER_STRENGTH';
  if(!Number.isInteger(width) || width < 1 || pixelCount % width !== 0) return 'INVALID_WIDTH';
  return null;
}

function validatePngRequest(message){
  if(!isPlainObject(message) || message.type !== 'encode-png') return 'INVALID_MESSAGE';
  if(!validateJobId(message.jobId)) return 'INVALID_JOB_ID';
  if(message.stage !== 'png-encode' || !isPlainObject(message.payload)) return 'UNSUPPORTED_STAGE';
  const { bitmap, width, height } = message.payload;
  if(!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > PERF001_MAX_PIXELS) return 'INVALID_DIMENSIONS';
  if(typeof ImageBitmap !== 'function' || !(bitmap instanceof ImageBitmap) || bitmap.width !== width || bitmap.height !== height) return 'INVALID_BITMAP';
  if(typeof OffscreenCanvas !== 'function') return 'OFFSCREEN_CANVAS_UNAVAILABLE';
  return null;
}

function validateCleanupRequest(message){
  if(!isPlainObject(message) || message.type !== 'process-stage') return 'INVALID_MESSAGE';
  if(!validateJobId(message.jobId)) return 'INVALID_JOB_ID';
  if(message.stage !== 'cleanup' || !isPlainObject(message.payload) || !isPlainObject(message.settings)) return 'UNSUPPORTED_STAGE';
  const { gridBuffer, alphaBuffer, pixelCount } = message.payload;
  const { width, height, frameWidth, frameHeight, passes, threshold } = message.settings;
  if(!(gridBuffer instanceof ArrayBuffer) || !(alphaBuffer instanceof ArrayBuffer)) return 'INVALID_BUFFER';
  if(!Number.isInteger(pixelCount) || pixelCount < 1 || pixelCount > PERF001_MAX_PIXELS) return 'INVALID_PIXEL_COUNT';
  if(gridBuffer.byteLength !== pixelCount * 4 || alphaBuffer.byteLength !== pixelCount) return 'INVALID_BUFFER_LENGTH';
  if(!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height !== pixelCount) return 'INVALID_DIMENSIONS';
  if(!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight) || frameWidth < 1 || frameHeight < 1 || width % frameWidth !== 0 || height % frameHeight !== 0) return 'INVALID_FRAME_DIMENSIONS';
  if(!Number.isInteger(passes) || passes < 1 || passes > 20) return 'INVALID_PASSES';
  if(!Number.isInteger(threshold) || threshold < 1 || threshold > 254) return 'INVALID_THRESHOLD';
  return null;
}

function srgbChannelToLinear(channel){
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function srgbToOklab(r, g, b){
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  ];
}

function nearestColorIndex(r, g, b, palette){
  let best = 0;
  let bestDistance = Infinity;
  for(let index = 0; index < palette.length; index++){
    const color = palette[index];
    const distance = (r-color[0])**2 + (g-color[1])**2 + (b-color[2])**2;
    if(distance < bestDistance){
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function nearestOklabIndex(sourceLab, paletteLabs){
  let best = 0;
  let bestDistance = Infinity;
  for(let index = 0; index < paletteLabs.length; index++){
    const target = paletteLabs[index];
    const distance = (sourceLab[0]-target[0])**2 + (sourceLab[1]-target[1])**2 + (sourceLab[2]-target[2])**2;
    if(distance < bestDistance){
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function getTwoNearestPaletteIndices(r, g, b, palette, algorithm='kmeans-srgb'){
  if(!palette || palette.length === 0) return [-1, -1];
  if(palette.length === 1) return [0, 0];
  const sourceLab = algorithm === 'kmeans-oklab' ? srgbToOklab(r, g, b) : null;
  const paletteLabs = algorithm === 'kmeans-oklab' ? palette.map(color => srgbToOklab(color[0], color[1], color[2])) : null;
  let firstIndex = 0;
  let secondIndex = 0;
  let firstDistance = Infinity;
  let secondDistance = Infinity;
  for(let index = 0; index < palette.length; index++){
    let distance;
    if(sourceLab){
      const target = paletteLabs[index];
      distance = (sourceLab[0]-target[0])**2 + (sourceLab[1]-target[1])**2 + (sourceLab[2]-target[2])**2;
    } else {
      const color = palette[index];
      distance = (r-color[0])**2 + (g-color[1])**2 + (b-color[2])**2;
    }
    if(distance < firstDistance){
      secondDistance = firstDistance;
      secondIndex = firstIndex;
      firstDistance = distance;
      firstIndex = index;
    } else if(distance < secondDistance){
      secondDistance = distance;
      secondIndex = index;
    }
  }
  return [firstIndex, secondIndex];
}

function applyOrderedDither(r, g, b, x, y, palette, ditherMode='off', ditherStrength=50, algorithm='kmeans-srgb'){
  if(ditherMode === 'off' || ditherStrength === 0 || !palette || palette.length <= 1){
    if(algorithm === 'kmeans-oklab'){
      const paletteLabs = palette.map(color => srgbToOklab(color[0], color[1], color[2]));
      return nearestOklabIndex(srgbToOklab(r, g, b), paletteLabs);
    }
    return nearestColorIndex(r, g, b, palette);
  }
  const matrix = PERF001_BAYER_MATRICES[ditherMode];
  if(!matrix) return nearestColorIndex(r, g, b, palette);
  const [firstIndex, secondIndex] = getTwoNearestPaletteIndices(r, g, b, palette, algorithm);
  if(firstIndex === secondIndex) return firstIndex;
  const matrixSize = matrix.length;
  const matrixValue = matrix[((y % matrixSize) + matrixSize) % matrixSize][((x % matrixSize) + matrixSize) % matrixSize];
  const threshold = (matrixValue + 0.5) / (matrixSize * matrixSize);
  const adjustedThreshold = 0.5 + (threshold - 0.5) * (ditherStrength / 100);
  let source;
  let first;
  let second;
  if(algorithm === 'kmeans-oklab'){
    source = srgbToOklab(r, g, b);
    first = srgbToOklab(...palette[firstIndex]);
    second = srgbToOklab(...palette[secondIndex]);
  } else {
    source = [r, g, b];
    first = palette[firstIndex];
    second = palette[secondIndex];
  }
  const vector = [second[0]-first[0], second[1]-first[1], second[2]-first[2]];
  const denominator = vector[0]**2 + vector[1]**2 + vector[2]**2;
  if(denominator === 0) return firstIndex;
  const projection = ((source[0]-first[0])*vector[0] + (source[1]-first[1])*vector[1] + (source[2]-first[2])*vector[2]) / denominator;
  const amount = Math.max(0, Math.min(1, projection));
  return amount >= adjustedThreshold ? secondIndex : firstIndex;
}

function startPaletteMap(message){
  const validationCode = validateProcessRequest(message);
  if(validationCode){
    postWorkerError(validateJobId(message?.jobId) ? message.jobId : '0', validationCode, '팔레트 매핑 요청 형식이 올바르지 않습니다.');
    return;
  }
  const { jobId, payload, settings } = message;
  if(activeJob){
    activeJob.cancelled = true;
    postWorkerMessage({ type:'cancelled', jobId:activeJob.jobId, reason:'superseded', cancelLatencyMs:0 });
  }
  if(cancelledBeforeStart.delete(jobId)){
    postWorkerMessage({ type:'cancelled', jobId, reason:'cancel-before-start', cancelLatencyMs:0 });
    return;
  }
  const data = new Uint8ClampedArray(payload.dataBuffer);
  const alpha = new Uint8Array(payload.alphaBuffer);
  const previousGrid = payload.previousGridBuffer ? new Int32Array(payload.previousGridBuffer) : null;
  const grid = new Int32Array(payload.pixelCount);
  grid.fill(-1);
  const slotCounts = new Uint32Array(payload.palette.length);
  const paletteLabs = payload.palette.map(color => srgbToOklab(color[0], color[1], color[2]));
  const ditherActive = settings.ditherMode !== 'off' && settings.ditherStrength > 0 && payload.palette.length > 1;
  const canStabilize = !ditherActive && settings.algorithm === 'kmeans-oklab' && settings.temporalEpsilon > 0 && previousGrid;
  const metricStride = Math.max(1, Math.ceil(payload.pixelCount / PERF001_MAX_PALETTE_SAMPLES));
  const sampledErrors = [];
  const state = {
    kind:'palette-map',
    jobId,
    data,
    alpha,
    previousGrid,
    grid,
    slotCounts,
    palette:payload.palette,
    paletteLabs,
    pixelCount:payload.pixelCount,
    settings,
    ditherActive,
    canStabilize:Boolean(canStabilize),
    metricStride,
    sampledErrors,
    errorSum:0,
    temporalHeldCount:0,
    index:0,
    lastProgress:-10,
    startedAt:performance.now(),
    maxChunkMs:0,
    cancelled:false,
    cancelRequestedAt:null
  };
  activeJob = state;
  postWorkerMessage({ type:'progress', jobId, stage:'palette-map', percent:0 });
  schedulePaletteChunk(state);
}

function startCleanup(message){
  const validationCode = validateCleanupRequest(message);
  if(validationCode){
    postWorkerError(validateJobId(message?.jobId) ? message.jobId : '0', validationCode, '노이즈 정리 요청 형식이 올바르지 않습니다.');
    return;
  }
  const { jobId, payload, settings } = message;
  if(activeJob){
    activeJob.cancelled = true;
    postWorkerMessage({ type:'cancelled', jobId:activeJob.jobId, reason:'superseded', cancelLatencyMs:0 });
  }
  if(cancelledBeforeStart.delete(jobId)){
    postWorkerMessage({ type:'cancelled', jobId, reason:'cancel-before-start', cancelLatencyMs:0 });
    return;
  }
  const result = new Int32Array(payload.gridBuffer);
  const state = {
    kind:'cleanup', jobId,
    result,
    next:result.slice(),
    alpha:new Uint8Array(payload.alphaBuffer),
    pixelCount:payload.pixelCount,
    settings,
    pass:0,
    index:0,
    lastProgress:-10,
    startedAt:performance.now(),
    maxChunkMs:0,
    cancelled:false,
    cancelRequestedAt:null
  };
  activeJob = state;
  postWorkerMessage({ type:'progress', jobId, stage:'cleanup', percent:0 });
  schedulePaletteChunk(state);
}

function processCleanupChunk(state){
  if(activeJob !== state) return;
  if(state.cancelled){
    const latency = state.cancelRequestedAt === null ? 0 : performance.now() - state.cancelRequestedAt;
    activeJob = null;
    postWorkerMessage({ type:'cancelled', jobId:state.jobId, reason:'requested', cancelLatencyMs:Number(latency.toFixed(3)) });
    return;
  }
  const chunkStartedAt = performance.now();
  const end = Math.min(state.pixelCount, state.index + PERF001_DEFAULT_CHUNK_PIXELS);
  const { width, frameWidth, frameHeight, threshold, passes } = state.settings;
  for(let index=state.index; index<end; index++){
    if(state.alpha[index] < threshold) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const frameStartX = Math.floor(x / frameWidth) * frameWidth;
    const frameStartY = Math.floor(y / frameHeight) * frameHeight;
    const frameEndX = frameStartX + frameWidth;
    const frameEndY = frameStartY + frameHeight;
    const neighbors = [];
    for(let dy=-1; dy<=1; dy++){
      for(let dx=-1; dx<=1; dx++){
        if(dx===0 && dy===0) continue;
        const neighborX=x+dx, neighborY=y+dy;
        if(neighborX>=frameStartX && neighborX<frameEndX && neighborY>=frameStartY && neighborY<frameEndY){
          const neighborIndex=neighborY*width+neighborX;
          if(state.alpha[neighborIndex]>=threshold) neighbors.push(state.result[neighborIndex]);
        }
      }
    }
    if(neighbors.length===0) continue;
    const counts = {};
    for(const value of neighbors) counts[value] = (counts[value] || 0) + 1;
    let majority=null, majorityCount=0;
    for(const key in counts){
      if(counts[key]>majorityCount){ majorityCount=counts[key]; majority=parseInt(key); }
    }
    if(!neighbors.includes(state.result[index]) && majorityCount>=neighbors.length*0.6) state.next[index]=majority;
  }
  state.index=end;
  state.maxChunkMs=Math.max(state.maxChunkMs,performance.now()-chunkStartedAt);
  const completedPixels=state.pass*state.pixelCount+state.index;
  const totalPixels=passes*state.pixelCount;
  const progress=Math.min(100,Math.floor((completedPixels/totalPixels)*10)*10);
  if(progress>state.lastProgress){
    state.lastProgress=progress;
    postWorkerMessage({ type:'progress', jobId:state.jobId, stage:'cleanup', percent:progress });
  }
  if(state.index<state.pixelCount){
    schedulePaletteChunk(state);
    return;
  }
  state.pass++;
  if(state.pass<passes){
    state.result=state.next;
    state.next=state.result.slice();
    state.index=0;
    schedulePaletteChunk(state);
    return;
  }
  state.result=state.next;
  const wallTimeMs=performance.now()-state.startedAt;
  const result={
    gridBuffer:state.result.buffer,
    alphaBuffer:state.alpha.buffer,
    performance:{
      wallTimeMs:Number(wallTimeMs.toFixed(3)),
      maxChunkMs:Number(state.maxChunkMs.toFixed(3)),
      estimatedPeakBytes:state.result.byteLength*2+state.alpha.byteLength
    }
  };
  activeJob=null;
  rememberCompletedJob(state.jobId);
  postWorkerMessage({ type:'progress', jobId:state.jobId, stage:'cleanup', percent:100 });
  postWorkerMessage({ type:'result', jobId:state.jobId, stage:'cleanup', payload:result }, [result.gridBuffer,result.alphaBuffer]);
}

async function startPngEncode(message){
  const validationCode = validatePngRequest(message);
  if(validationCode){
    postWorkerError(validateJobId(message?.jobId) ? message.jobId : '0', validationCode, 'PNG 인코딩 요청 형식이 올바르지 않습니다.');
    return;
  }
  const { jobId, payload } = message;
  if(activeJob){
    activeJob.cancelled = true;
    postWorkerMessage({ type:'cancelled', jobId:activeJob.jobId, reason:'superseded', cancelLatencyMs:0 });
  }
  const state = { jobId, cancelled:false, cancelRequestedAt:null, kind:'png-encode' };
  activeJob = state;
  postWorkerMessage({ type:'progress', jobId, stage:'png-encode', percent:0 });
  try {
    const canvas = new OffscreenCanvas(payload.width, payload.height);
    const context = canvas.getContext('2d', { alpha:true });
    if(!context) throw new Error('OFFSCREEN_CONTEXT_UNAVAILABLE');
    context.drawImage(payload.bitmap, 0, 0);
    payload.bitmap.close();
    postWorkerMessage({ type:'progress', jobId, stage:'png-encode', percent:50 });
    const blob = await canvas.convertToBlob({ type:'image/png' });
    if(activeJob !== state || state.cancelled){
      const latency = state.cancelRequestedAt === null ? 0 : performance.now() - state.cancelRequestedAt;
      if(activeJob === state) activeJob = null;
      postWorkerMessage({ type:'cancelled', jobId, reason:'requested', cancelLatencyMs:Number(latency.toFixed(3)) });
      return;
    }
    const pngBuffer = await blob.arrayBuffer();
    if(activeJob !== state || state.cancelled){
      const latency = state.cancelRequestedAt === null ? 0 : performance.now() - state.cancelRequestedAt;
      if(activeJob === state) activeJob = null;
      postWorkerMessage({ type:'cancelled', jobId, reason:'requested', cancelLatencyMs:Number(latency.toFixed(3)) });
      return;
    }
    activeJob = null;
    rememberCompletedJob(jobId);
    postWorkerMessage({
      type:'progress', jobId, stage:'png-encode', percent:100
    });
    postWorkerMessage({
      type:'result', jobId, stage:'png-encode', payload:{ pngBuffer, size:pngBuffer.byteLength }
    }, [pngBuffer]);
  } catch(error){
    if(activeJob === state) activeJob = null;
    console.error('PERF-001 PNG worker failure', error);
    postWorkerError(jobId, 'PNG_ENCODE_FAILED', 'PNG 인코딩을 완료하지 못했습니다.');
  }
}

function processPaletteChunk(state){
  if(activeJob !== state) return;
  if(state.cancelled){
    const latency = state.cancelRequestedAt === null ? 0 : performance.now() - state.cancelRequestedAt;
    activeJob = null;
    postWorkerMessage({ type:'cancelled', jobId:state.jobId, reason:'requested', cancelLatencyMs:Number(latency.toFixed(3)) });
    return;
  }
  const chunkStartedAt = performance.now();
  const end = Math.min(state.pixelCount, state.index + PERF001_DEFAULT_CHUNK_PIXELS);
  const { data, alpha, grid, slotCounts, palette, paletteLabs, previousGrid, settings } = state;
  for(let index = state.index; index < end; index++){
    if(alpha[index] < settings.threshold || palette.length === 0) continue;
    const red = data[index*4];
    const green = data[index*4+1];
    const blue = data[index*4+2];
    let sourceLab = null;
    let paletteIndex;
    if(state.ditherActive){
      paletteIndex = applyOrderedDither(red, green, blue, index % settings.width, Math.floor(index / settings.width), palette, settings.ditherMode, settings.ditherStrength, settings.algorithm);
    } else if(settings.algorithm === 'kmeans-oklab'){
      sourceLab = srgbToOklab(red, green, blue);
      paletteIndex = nearestOklabIndex(sourceLab, paletteLabs);
    } else {
      paletteIndex = nearestColorIndex(red, green, blue, palette);
    }
    if(state.canStabilize){
      const previousIndex = previousGrid[index];
      if(previousIndex >= 0 && previousIndex < paletteLabs.length && previousIndex !== paletteIndex){
        sourceLab ||= srgbToOklab(red, green, blue);
        const bestTarget = paletteLabs[paletteIndex];
        const previousTarget = paletteLabs[previousIndex];
        const bestDistanceSquared = (sourceLab[0]-bestTarget[0])**2 + (sourceLab[1]-bestTarget[1])**2 + (sourceLab[2]-bestTarget[2])**2;
        const previousDistanceSquared = (sourceLab[0]-previousTarget[0])**2 + (sourceLab[1]-previousTarget[1])**2 + (sourceLab[2]-previousTarget[2])**2;
        if(previousDistanceSquared <= bestDistanceSquared + settings.temporalEpsilon){
          paletteIndex = previousIndex;
          state.temporalHeldCount++;
        }
      }
    }
    grid[index] = paletteIndex;
    slotCounts[paletteIndex]++;
    if(index % state.metricStride === 0){
      sourceLab ||= srgbToOklab(red, green, blue);
      const targetLab = paletteLabs[paletteIndex];
      const error = Math.hypot(sourceLab[0]-targetLab[0], sourceLab[1]-targetLab[1], sourceLab[2]-targetLab[2]);
      state.sampledErrors.push(error);
      state.errorSum += error;
    }
  }
  state.index = end;
  state.maxChunkMs = Math.max(state.maxChunkMs, performance.now() - chunkStartedAt);
  const progress = Math.min(100, Math.floor((state.index / state.pixelCount) * 10) * 10);
  if(progress > state.lastProgress){
    state.lastProgress = progress;
    postWorkerMessage({ type:'progress', jobId:state.jobId, stage:'palette-map', percent:progress });
  }
  if(state.index < state.pixelCount){
    schedulePaletteChunk(state);
    return;
  }
  const sortedErrors = state.sampledErrors.slice().sort((left, right) => left - right);
  const percentileIndex = sortedErrors.length ? Math.min(sortedErrors.length - 1, Math.ceil(sortedErrors.length * 0.95) - 1) : 0;
  const roundMetric = value => Number(value.toFixed(6));
  const wallTimeMs = performance.now() - state.startedAt;
  const result = {
    gridBuffer:state.grid.buffer,
    slotCountsBuffer:state.slotCounts.buffer,
    dataBuffer:state.data.buffer,
    alphaBuffer:state.alpha.buffer,
    slotUsage:Array.from(state.slotCounts).filter(count => count > 0).length,
    temporalStabilityApplied:state.canStabilize,
    temporalEpsilon:state.canStabilize ? settings.temporalEpsilon : 0,
    temporalHeldCount:state.temporalHeldCount,
    ditherApplied:state.ditherActive,
    ditherMode:state.ditherActive ? settings.ditherMode : 'off',
    ditherStrength:state.ditherActive ? settings.ditherStrength : 0,
    error:{
      mean:roundMetric(sortedErrors.length ? state.errorSum / sortedErrors.length : 0),
      p95:roundMetric(sortedErrors.length ? sortedErrors[percentileIndex] : 0),
      max:roundMetric(sortedErrors.length ? sortedErrors[sortedErrors.length - 1] : 0),
      sampleCount:sortedErrors.length
    },
    performance:{
      wallTimeMs:Number(wallTimeMs.toFixed(3)),
      maxChunkMs:Number(state.maxChunkMs.toFixed(3)),
      estimatedPeakBytes:state.data.byteLength + state.alpha.byteLength + state.grid.byteLength + state.slotCounts.byteLength + (state.previousGrid?.byteLength || 0)
    }
  };
  activeJob = null;
  rememberCompletedJob(state.jobId);
  postWorkerMessage({ type:'result', jobId:state.jobId, stage:'palette-map', payload:result }, [
    result.gridBuffer,
    result.slotCountsBuffer,
    result.dataBuffer,
    result.alphaBuffer
  ]);
}

function handleCancelMessage(message){
  if(!validateJobId(message?.jobId)){
    postWorkerError('0', 'INVALID_JOB_ID', '취소 요청의 작업 ID가 올바르지 않습니다.');
    return;
  }
  if(activeJob?.jobId === message.jobId){
    activeJob.cancelled = true;
    activeJob.cancelRequestedAt = performance.now();
    return;
  }
  if(completedJobs.has(message.jobId)){
    postWorkerMessage({ type:'cancelled', jobId:message.jobId, reason:'already-complete', alreadyCompleted:true, cancelLatencyMs:0 });
    return;
  }
  cancelledBeforeStart.add(message.jobId);
}

self.addEventListener('message', event => {
  const message = event.data;
  if(message?.type === 'cancel'){
    handleCancelMessage(message);
    return;
  }
  if(message?.type === 'encode-png'){
    startPngEncode(message);
    return;
  }
  if(message?.type === 'process-stage' && message.stage === 'cleanup'){
    startCleanup(message);
    return;
  }
  startPaletteMap(message);
});
