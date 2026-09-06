import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research/evidence/out-001');
const qaPath = path.resolve(evidenceDir, 'browser-qa.json');

const requiredCaptures = Object.freeze({
  'browser-desktop-outputs.jpg': { width: 1272, height: 716 },
  'browser-mobile-390px.jpg': { width: 382, height: 827 },
  'browser-mobile-390px-results.jpg': { width: 382, height: 827 },
  'browser-limit-disabled.jpg': { width: 1272, height: 716 },
});

const requiredArtifacts = Object.freeze([
  'browser-native-run1.png',
  'browser-native-run2.png',
  'browser-2x-run1.png',
  'browser-2x-run2.png',
  'browser-8x-run1.png',
  'browser-8x-run2.png',
  'browser-normal-run1.zip',
  'browser-normal-run2.zip',
  'browser-none-native.png',
  'browser-none.zip',
  'browser-limit.zip',
]);

const normalEntries = Object.freeze([
  'hero-valid-factor8-768x1344_96x168.png',
  'hero-valid-factor8-768x1344_96x168_2x.png',
  'hero-valid-factor8-768x1344_96x168_8x.png',
  'hero-valid-factor8-768x1344_96x168.json',
]);

const noneEntries = Object.freeze([
  'hero-valid-factor8-768x1344_96x168.png',
  'hero-valid-factor8-768x1344_96x168.json',
]);

const limitEntries = Object.freeze([
  'perf-1024x1024_1024px.png',
  'perf-1024x1024_1024px.json',
]);

function sha256Bytes(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath){
  return sha256Bytes(fs.readFileSync(filePath));
}

function currentGitHead(){
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function inspectJpeg(targetEvidenceDir, filename){
  if(path.basename(filename) !== filename || !filename.endsWith('.jpg')) return null;
  const filePath = path.resolve(targetEvidenceDir, filename);
  if(path.dirname(filePath) !== path.resolve(targetEvidenceDir) || !fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  if(bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9){
    return null;
  }
  try {
    const decoded = execFileSync('sips', ['-g', 'format', '-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const format = decoded.match(/format:\s*(\S+)/i)?.[1]?.toLowerCase();
    const width = Number(decoded.match(/pixelWidth:\s*(\d+)/i)?.[1]);
    const height = Number(decoded.match(/pixelHeight:\s*(\d+)/i)?.[1]);
    if(format !== 'jpeg' || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1){
      return null;
    }
    return { format, width, height, bytes: bytes.length, sha256: sha256Bytes(bytes), decoder: 'sips' };
  } catch {
    return null;
  }
}

function paeth(left, above, upperLeft){
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if(leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if(aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(filePath){
  if(!fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  if(bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const idat = [];
  let sawIend = false;
  while(offset + 12 <= bytes.length){
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if(dataEnd + 4 > bytes.length) return null;
    if(type === 'IHDR'){
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if(type === 'IDAT'){
      idat.push(bytes.subarray(dataStart, dataEnd));
    } else if(type === 'IEND'){
      sawIend = true;
    }
    offset = dataEnd + 4;
    if(type === 'IEND') break;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if(!sawIend || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      bitDepth !== 8 || channels === null || interlace !== 0 || idat.length === 0){
    return null;
  }
  try {
    execFileSync('sips', ['-g', 'format', '-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
        else if(filter === 4) value = encoded + paeth(left, above, upperLeft);
        else return null;
        raw[rowOffset + x] = value & 255;
      }
    }
    const rgba = channels === 4 ? raw : Buffer.from(Array.from({ length: width * height }, (_, pixel) => [
      raw[pixel * 3], raw[pixel * 3 + 1], raw[pixel * 3 + 2], 255,
    ]).flat());
    const colors = new Set();
    for(let pixel = 0; pixel < width * height; pixel++){
      colors.add(rgba.readUInt32BE(pixel * 4));
    }
    return {
      width,
      height,
      rgba,
      uniqueColorCount: colors.size,
      pixelSha256: sha256Bytes(rgba),
      fileSha256: sha256Bytes(bytes),
      bytes: bytes.length,
      decoder: 'sips+png-scanline',
    };
  } catch {
    return null;
  }
}

function isExactNearest(native, scaled, scale){
  if(!native || !scaled || scaled.width !== native.width * scale || scaled.height !== native.height * scale){
    return false;
  }
  for(let y = 0; y < scaled.height; y++){
    const sourceY = Math.floor(y / scale);
    for(let x = 0; x < scaled.width; x++){
      const sourceX = Math.floor(x / scale);
      const sourceOffset = (sourceY * native.width + sourceX) * 4;
      const targetOffset = (y * scaled.width + x) * 4;
      if(!native.rgba.subarray(sourceOffset, sourceOffset + 4).equals(scaled.rgba.subarray(targetOffset, targetOffset + 4))){
        return false;
      }
    }
  }
  return true;
}

function inspectZip(filePath){
  if(!fs.existsSync(filePath)) return null;
  try {
    execFileSync('unzip', ['-t', filePath], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    const entries = execFileSync('unzip', ['-Z1', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    }).trim().split('\n').filter(Boolean);
    const entrySha256 = {};
    for(const entry of entries){
      const bytes = execFileSync('unzip', ['-p', filePath, entry], {
        encoding: null,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      });
      entrySha256[entry] = sha256Bytes(bytes);
    }
    return {
      entries,
      entrySha256,
      bytes: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
      decoder: 'unzip -t/-Z1/-p',
    };
  } catch {
    return null;
  }
}

function compareObject(left, right){
  return JSON.stringify(left) === JSON.stringify(right);
}

function evaluateOut001Evidence(qa, targetEvidenceDir){
  const reasons = [];
  const require = (condition, message) => {
    if(!condition) reasons.push(message);
  };

  require(qa?.itemId === 'OUT-001', 'itemId must be OUT-001');
  require(qa?.status === 'PASS', 'browser QA status must be PASS');
  require(/^http:\/\/localhost:8000\/pixelate_studio\.html(?:\?|$)/.test(qa?.url || ''), 'URL must bind localhost:8000/pixelate_studio.html');
  require(typeof qa?.browser === 'string' && qa.browser.length > 0, 'browser identifier is required');
  require(qa?.gitHead === currentGitHead(), 'git HEAD is stale');

  const currentApplicationSha256 = sha256File(path.resolve(root, 'pixelate_studio.html'));
  const currentWorkerSha256 = sha256File(path.resolve(root, 'pixelate-worker.js'));
  require(qa?.applicationSha256 === currentApplicationSha256, 'application SHA-256 is stale');
  require(qa?.servedApplicationSha256 === currentApplicationSha256, 'served application SHA-256 is stale');
  require(qa?.workerSha256 === currentWorkerSha256, 'Worker SHA-256 is stale');
  require(qa?.servedWorkerSha256 === currentWorkerSha256, 'served Worker SHA-256 is stale');
  require(qa?.baselineHashes?.generatedOutputsChanged === false, 'existing generated result hash changed');

  const requiredScenarioPasses = [
    ['initialDisabled', qa?.scenarios?.initialDisabled?.pass],
    ['noneSelectedCompatibility', qa?.scenarios?.noneSelectedCompatibility?.pass],
    ['desktopOutputs', qa?.scenarios?.desktopOutputs?.pass],
    ['browserDownloads', qa?.scenarios?.browserDownloads?.pass],
    ['zipContents', qa?.scenarios?.zipContents?.pass],
    ['reupload', qa?.scenarios?.reupload?.pass],
    ['determinism', qa?.scenarios?.determinism?.pass],
    ['mobile390', qa?.scenarios?.mobile390?.pass],
    ['keyboardCheckbox', qa?.scenarios?.keyboardCheckbox?.pass],
    ['limitExceeded', qa?.scenarios?.limitExceeded?.pass],
    ['console', qa?.scenarios?.console?.pass],
  ];
  for(const [name, pass] of requiredScenarioPasses){
    require(pass === true, `required scenario failed: ${name}`);
  }
  require(qa?.scenarios?.initialDisabled?.runDisabled === true, 'initial run button was not disabled');
  require(compareObject(qa?.scenarios?.desktopOutputs?.selectedScales, [2, 8]), 'desktop selected scales must be [2,8]');
  require(compareObject(qa?.scenarios?.desktopOutputs?.buttons, ['PNG', '2× PNG', '8× PNG', 'JSON']), 'desktop result buttons mismatch');
  require(qa?.scenarios?.desktopOutputs?.nativeDimensions === '96x168', 'native dimensions mismatch');
  require(qa?.scenarios?.desktopOutputs?.scale2Dimensions === '192x336', '2x dimensions mismatch');
  require(qa?.scenarios?.desktopOutputs?.scale8Dimensions === '768x1344', '8x dimensions mismatch');
  require(qa?.scenarios?.mobile390?.horizontalOverflow === false, 'mobile horizontal overflow detected');
  require(qa?.scenarios?.mobile390?.documentScrollWidth <= qa?.scenarios?.mobile390?.viewport?.[0], 'mobile document exceeds viewport width');
  require(qa?.scenarios?.mobile390?.allOutputButtonsVisible === true, 'mobile output buttons were not all visible');
  require(qa?.scenarios?.keyboardCheckbox?.focused === true, 'keyboard checkbox focus was not measured');
  require(qa?.scenarios?.keyboardCheckbox?.spaceToggledOff === true, 'Space did not toggle the checkbox off');
  require(qa?.scenarios?.keyboardCheckbox?.spaceToggledOn === true, 'Space did not toggle the checkbox on');
  require(qa?.scenarios?.limitExceeded?.checkboxDisabled === true, 'limit-exceeded 8x checkbox was not disabled as specified');
  require(qa?.scenarios?.limitExceeded?.scaleButtonDisabled === true, 'limit-exceeded scale button was not disabled');
  require(qa?.scenarios?.limitExceeded?.warningVisible === true, 'limit-exceeded warning was not visible');
  require(qa?.scenarios?.limitExceeded?.zipScaleOmitted === true, 'limit-exceeded ZIP did not omit the scale output');
  require(qa?.scenarios?.console?.errors === 0, 'console errors were reported');
  require(qa?.scenarios?.console?.warnings === 0, 'console warnings were reported');

  for(const [filename, expected] of Object.entries(requiredCaptures)){
    const declared = qa?.captures?.[filename];
    require(Boolean(declared), `capture declaration missing: ${filename}`);
    const inspected = inspectJpeg(targetEvidenceDir, filename);
    require(Boolean(inspected), `capture is missing or not decoder-valid JPEG: ${filename}`);
    if(declared && inspected){
      require(declared.sha256 === inspected.sha256, `capture SHA-256 mismatch: ${filename}`);
      require(declared.format === inspected.format, `capture format mismatch: ${filename}`);
      require(declared.width === inspected.width && declared.height === inspected.height, `capture dimensions mismatch: ${filename}`);
      require(inspected.width === expected.width && inspected.height === expected.height, `capture expected dimensions mismatch: ${filename}`);
    }
  }

  for(const filename of requiredArtifacts){
    const declared = qa?.artifacts?.[filename];
    const filePath = path.resolve(targetEvidenceDir, filename);
    require(Boolean(declared), `artifact declaration missing: ${filename}`);
    require(path.dirname(filePath) === path.resolve(targetEvidenceDir) && fs.existsSync(filePath), `artifact missing: ${filename}`);
    if(declared && fs.existsSync(filePath)){
      require(declared.sha256 === sha256File(filePath), `artifact SHA-256 mismatch: ${filename}`);
      require(declared.bytes === fs.statSync(filePath).size, `artifact byte size mismatch: ${filename}`);
    }
  }

  const native1 = decodePng(path.resolve(targetEvidenceDir, 'browser-native-run1.png'));
  const native2 = decodePng(path.resolve(targetEvidenceDir, 'browser-native-run2.png'));
  const noneNative = decodePng(path.resolve(targetEvidenceDir, 'browser-none-native.png'));
  const scale2Run1 = decodePng(path.resolve(targetEvidenceDir, 'browser-2x-run1.png'));
  const scale2Run2 = decodePng(path.resolve(targetEvidenceDir, 'browser-2x-run2.png'));
  const scale8Run1 = decodePng(path.resolve(targetEvidenceDir, 'browser-8x-run1.png'));
  const scale8Run2 = decodePng(path.resolve(targetEvidenceDir, 'browser-8x-run2.png'));
  for(const [name, decoded] of Object.entries({ native1, native2, noneNative, scale2Run1, scale2Run2, scale8Run1, scale8Run2 })){
    require(Boolean(decoded), `PNG is missing or decoder-invalid: ${name}`);
  }
  if(native1 && native2 && noneNative && scale2Run1 && scale2Run2 && scale8Run1 && scale8Run2){
    require(native1.width === 96 && native1.height === 168, 'native PNG dimensions are not 96x168');
    require(scale2Run1.width === 192 && scale2Run1.height === 336, '2x PNG dimensions are not 192x336');
    require(scale8Run1.width === 768 && scale8Run1.height === 1344, '8x PNG dimensions are not 768x1344');
    require(native1.fileSha256 === native2.fileSha256, 'native PNG is not deterministic');
    require(native1.fileSha256 === noneNative.fileSha256, 'none-selected native PNG changed');
    require(scale2Run1.fileSha256 === scale2Run2.fileSha256, '2x PNG is not deterministic');
    require(scale8Run1.fileSha256 === scale8Run2.fileSha256, '8x PNG is not deterministic');
    require(native1.uniqueColorCount === scale2Run1.uniqueColorCount && native1.uniqueColorCount === scale8Run1.uniqueColorCount, 'nearest outputs changed color count');
    require(isExactNearest(native1, scale2Run1, 2), '2x PNG contains a non-uniform or recomputed block');
    require(isExactNearest(native1, scale8Run1, 8), '8x PNG contains a non-uniform or recomputed block');
  }

  const normalRun1 = inspectZip(path.resolve(targetEvidenceDir, 'browser-normal-run1.zip'));
  const normalRun2 = inspectZip(path.resolve(targetEvidenceDir, 'browser-normal-run2.zip'));
  const noneZip = inspectZip(path.resolve(targetEvidenceDir, 'browser-none.zip'));
  const limitZip = inspectZip(path.resolve(targetEvidenceDir, 'browser-limit.zip'));
  for(const [name, inspected] of Object.entries({ normalRun1, normalRun2, noneZip, limitZip })){
    require(Boolean(inspected), `ZIP is missing or decoder-invalid: ${name}`);
  }
  if(normalRun1 && normalRun2 && noneZip && limitZip){
    require(compareObject(normalRun1.entries, normalEntries), 'normal ZIP run 1 entry list mismatch');
    require(compareObject(normalRun2.entries, normalEntries), 'normal ZIP run 2 entry list mismatch');
    require(compareObject(normalRun1.entrySha256, normalRun2.entrySha256), 'normal ZIP entry hashes are not deterministic');
    require(compareObject(noneZip.entries, noneEntries), 'none-selected ZIP contains unexpected entries');
    require(compareObject(limitZip.entries, limitEntries), 'limit ZIP contains unexpected or scaled entries');
    require(!limitZip.entries.some(entry => /_8x\.png$/i.test(entry)), 'limit ZIP silently included forbidden 8x output');
  }

  require(Array.isArray(qa?.blockingFindings) && qa.blockingFindings.length === 0, 'blocking findings remain');
  return { pass: reasons.length === 0, reasons };
}

function makePassingFixture(qa){
  const passing = structuredClone(qa);
  passing.status = 'PASS';
  for(const scenario of Object.values(passing.scenarios)) scenario.pass = true;
  passing.scenarios.keyboardCheckbox.focused = true;
  passing.scenarios.keyboardCheckbox.spaceToggledOff = true;
  passing.scenarios.keyboardCheckbox.spaceToggledOn = true;
  passing.scenarios.limitExceeded.checkboxDisabled = true;
  passing.blockingFindings = [];
  return passing;
}

const actualQa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'out001-evidence-gate-'));

try {
  for(const filename of [...Object.keys(requiredCaptures), ...requiredArtifacts]){
    fs.copyFileSync(path.resolve(evidenceDir, filename), path.resolve(tempDir, filename));
  }
  const passingFixture = makePassingFixture(actualQa);
  assert.equal(evaluateOut001Evidence(passingFixture, tempDir).pass, true, 'complete current-hash fixture must pass');

  const missingTarget = Object.keys(requiredCaptures)[0];
  fs.unlinkSync(path.resolve(tempDir, missingTarget));
  assert.equal(evaluateOut001Evidence(passingFixture, tempDir).pass, false, 'missing capture must fail closed');
  fs.copyFileSync(path.resolve(evidenceDir, missingTarget), path.resolve(tempDir, missingTarget));

  const tamperedTarget = Object.keys(requiredCaptures)[1];
  fs.appendFileSync(path.resolve(tempDir, tamperedTarget), Buffer.from([0x00]));
  assert.equal(evaluateOut001Evidence(passingFixture, tempDir).pass, false, 'tampered capture must fail closed');
  fs.copyFileSync(path.resolve(evidenceDir, tamperedTarget), path.resolve(tempDir, tamperedTarget));

  const staleHash = structuredClone(passingFixture);
  staleHash.applicationSha256 = '0'.repeat(64);
  assert.equal(evaluateOut001Evidence(staleHash, tempDir).pass, false, 'stale application SHA-256 must fail closed');

  const failedStatus = structuredClone(passingFixture);
  failedStatus.status = 'FAIL';
  assert.equal(evaluateOut001Evidence(failedStatus, tempDir).pass, false, 'status FAIL must fail closed');

  const failedScenario = structuredClone(passingFixture);
  failedScenario.scenarios.mobile390.pass = false;
  assert.equal(evaluateOut001Evidence(failedScenario, tempDir).pass, false, 'required scenario false must fail closed');

  console.log('OUT-001 negative evidence tests passed: missing file, tampered capture, stale HTML hash, FAIL status, and false scenario all fail closed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const actual = evaluateOut001Evidence(actualQa, evidenceDir);
if(!actual.pass){
  console.error('OUT-001 evidence gate: FAIL');
  for(const reason of actual.reasons) console.error(`- ${reason}`);
  process.exitCode = 1;
} else {
  console.log('OUT-001 evidence gate: PASS');
}
