import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research/evidence/geo-001');
const qaPath = path.resolve(evidenceDir, 'browser-qa.json');
const requiredCaptures = [
  'browser-desktop-valid-1x.jpg',
  'browser-desktop-valid-8x.jpg',
  'browser-desktop-sheet-8x.jpg',
  'browser-mobile-invalid-disabled.jpg',
  'browser-mobile-valid-8x.jpg',
];

function sha256Bytes(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath){
  return sha256Bytes(fs.readFileSync(filePath));
}

function inspectJpeg(evidenceRoot, filename){
  if(path.basename(filename) !== filename || !filename.endsWith('.jpg')) return null;
  const filePath = path.resolve(evidenceRoot, filename);
  if(path.dirname(filePath) !== path.resolve(evidenceRoot) || !fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  if(bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  if(bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  try {
    const decoded = execFileSync('sips', ['-g', 'format', '-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const format = decoded.match(/format:\s*(\S+)/i)?.[1]?.toLowerCase();
    const width = Number(decoded.match(/pixelWidth:\s*(\d+)/i)?.[1]);
    const height = Number(decoded.match(/pixelHeight:\s*(\d+)/i)?.[1]);
    if(format !== 'jpeg' || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) return null;
    return { sha256: sha256Bytes(bytes), format, width, height };
  } catch {
    return null;
  }
}

function currentGitHead(){
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function evaluateGeo001Evidence(qa, targetEvidenceDir){
  const reasons = [];
  const require = (condition, message) => {
    if(!condition) reasons.push(message);
  };

  require(qa?.itemId === 'GEO-001', 'itemId must be GEO-001');
  require(qa?.status === 'PASS', 'browser QA status must be PASS');
  require(/^http:\/\/localhost:8000\/pixelate_studio\.html(?:\?|$)/.test(qa?.url || ''), 'URL must bind localhost:8000/pixelate_studio.html');
  require(typeof qa?.browser === 'string' && qa.browser.length > 0, 'browser identifier is required');
  require(qa?.gitHead === currentGitHead(), 'git HEAD is stale');

  const currentApplicationSha256 = sha256File(path.resolve(root, 'pixelate_studio.html'));
  const currentWorkerSha256 = sha256File(path.resolve(root, 'pixelate-worker.js'));
  require(qa?.applicationSha256 === currentApplicationSha256, 'application SHA-256 is stale');
  require(qa?.servedApplicationSha256 === currentApplicationSha256, 'served application SHA-256 is stale');
  require(qa?.workerSha256 === currentWorkerSha256, 'Worker SHA-256 is stale');
  require(qa?.baselineHashes?.changed === false, 'existing result baseline changed');

  const requiredScenarioPasses = [
    ['desktop.modeTransition', qa?.desktop?.modeTransition?.pass],
    ['desktop.hiddenControlsDisabled', qa?.desktop?.hiddenControlsDisabled?.pass],
    ['desktop.liveCalculation', qa?.desktop?.liveCalculation?.pass],
    ['desktop.validHero', qa?.desktop?.validHero?.pass],
    ['desktop.validNonSquare', qa?.desktop?.validNonSquare?.pass],
    ['desktop.invalidSingle', qa?.desktop?.invalidSingle?.pass],
    ['desktop.invalidRemovalTransition', qa?.desktop?.invalidRemovalTransition?.pass],
    ['desktop.invalidMultiFile', qa?.desktop?.invalidMultiFile?.pass],
    ['desktop.sheet', qa?.desktop?.sheet?.pass],
    ['desktop.quickView', qa?.desktop?.quickView?.pass],
    ['mobile.valid', qa?.mobile?.valid?.pass],
    ['mobile.invalid', qa?.mobile?.invalid?.pass],
    ['keyboard', qa?.keyboard?.pass],
    ['console', qa?.console?.pass],
  ];
  for(const [name, pass] of requiredScenarioPasses) require(pass === true, `required scenario failed: ${name}`);
  require(qa?.desktop?.hiddenControlsDisabled?.factorInputDisabled === true, 'hidden factor input was not disabled');
  require(qa?.desktop?.invalidSingle?.runDisabledAfterCleanSingleUpload === true, 'invalid single input was not blocked');
  require(qa?.desktop?.invalidRemovalTransition?.runDisabledImmediatelyAfterRemoval === true, 'invalid removal transition was not blocked immediately');
  require(qa?.desktop?.invalidMultiFile?.runDisabled === true, 'invalid multi-file input was not blocked');
  require(qa?.desktop?.quickView?.zoom1Pressed === true && qa?.desktop?.quickView?.zoom8Pressed === true, 'quick-view 1x/8x states were not both measured');
  require(qa?.mobile?.horizontalOverflow === false, 'mobile horizontal overflow detected');
  require(qa?.mobile?.documentScrollWidth <= qa?.mobile?.viewport?.[0], 'mobile document exceeds viewport width');
  require(qa?.mobile?.valid?.quickZoomControlsVisible === true, 'mobile quick-view controls were not visible');
  require(qa?.keyboard?.runButtonFocusedBeforeActivation === true, 'run button focus was not measured');
  require(qa?.keyboard?.enterActivationProducedResult === true, 'Enter did not produce a result');
  require(qa?.keyboard?.spaceActivationProducedResult === true, 'Space did not produce a result');
  require(qa?.console?.errors === 0, 'console errors were reported');
  require(qa?.console?.warnings === 0, 'console warnings were reported');
  if(qa?.console?.pageErrorChannelAvailable === true){
    require(qa?.console?.pageErrors === 0, 'page errors were reported');
  } else {
    require(qa?.console?.pageErrorChannelAvailable === false, 'page-error measurement availability is missing');
    require(qa?.console?.pageErrorsObservedThroughErrorLog === 0, 'page errors were observed through browser error logs');
  }

  for(const filename of requiredCaptures){
    const declared = qa?.captures?.[filename];
    require(Boolean(declared), `capture declaration missing: ${filename}`);
    const inspected = inspectJpeg(targetEvidenceDir, filename);
    require(Boolean(inspected), `capture is missing or not decoder-valid JPEG: ${filename}`);
    if(declared && inspected){
      require(declared.sha256 === inspected.sha256, `capture SHA-256 mismatch: ${filename}`);
      require(declared.format === inspected.format, `capture format mismatch: ${filename}`);
      require(declared.width === inspected.width && declared.height === inspected.height, `capture dimensions mismatch: ${filename}`);
    }
  }

  return { pass: reasons.length === 0, reasons };
}

function setRequiredScenariosPass(qa){
  qa.status = 'PASS';
  qa.desktop.modeTransition.pass = true;
  qa.desktop.hiddenControlsDisabled.pass = true;
  qa.desktop.hiddenControlsDisabled.factorInputDisabled = true;
  qa.desktop.liveCalculation.pass = true;
  qa.desktop.validHero.pass = true;
  qa.desktop.validNonSquare.pass = true;
  qa.desktop.invalidSingle.pass = true;
  qa.desktop.invalidRemovalTransition.pass = true;
  qa.desktop.invalidRemovalTransition.runDisabledImmediatelyAfterRemoval = true;
  qa.desktop.invalidMultiFile.pass = true;
  qa.desktop.sheet.pass = true;
  qa.desktop.quickView.pass = true;
  qa.mobile.valid.pass = true;
  qa.mobile.invalid.pass = true;
  qa.keyboard.pass = true;
  qa.keyboard.runButtonFocusedBeforeActivation = true;
  qa.keyboard.enterActivationProducedResult = true;
  qa.keyboard.spaceActivationProducedResult = true;
  qa.console.pass = true;
  qa.blockingFindings = [];
  return qa;
}

const actualQa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo001-evidence-gate-'));

try {
  for(const filename of requiredCaptures){
    fs.copyFileSync(path.resolve(evidenceDir, filename), path.resolve(tempDir, filename));
  }
  const passingFixture = setRequiredScenariosPass(structuredClone(actualQa));
  assert.equal(evaluateGeo001Evidence(passingFixture, tempDir).pass, true, 'complete current-hash evidence must pass');

  const missingTarget = requiredCaptures[0];
  fs.unlinkSync(path.resolve(tempDir, missingTarget));
  assert.equal(evaluateGeo001Evidence(passingFixture, tempDir).pass, false, 'missing capture must fail closed');
  fs.copyFileSync(path.resolve(evidenceDir, missingTarget), path.resolve(tempDir, missingTarget));

  const tamperedTarget = requiredCaptures[1];
  fs.appendFileSync(path.resolve(tempDir, tamperedTarget), Buffer.from([0x00]));
  assert.equal(evaluateGeo001Evidence(passingFixture, tempDir).pass, false, 'tampered capture must fail closed');
  fs.copyFileSync(path.resolve(evidenceDir, tamperedTarget), path.resolve(tempDir, tamperedTarget));

  const staleHash = structuredClone(passingFixture);
  staleHash.applicationSha256 = '0'.repeat(64);
  assert.equal(evaluateGeo001Evidence(staleHash, tempDir).pass, false, 'stale application SHA-256 must fail closed');

  const staleWorkerHash = structuredClone(passingFixture);
  staleWorkerHash.workerSha256 = '0'.repeat(64);
  assert.equal(evaluateGeo001Evidence(staleWorkerHash, tempDir).pass, false, 'stale Worker SHA-256 must fail closed');

  const failedStatus = structuredClone(passingFixture);
  failedStatus.status = 'FAIL';
  assert.equal(evaluateGeo001Evidence(failedStatus, tempDir).pass, false, 'status FAIL must fail closed');

  const failedScenario = structuredClone(passingFixture);
  failedScenario.desktop.quickView.pass = false;
  assert.equal(evaluateGeo001Evidence(failedScenario, tempDir).pass, false, 'required scenario false must fail closed');

  console.log('GEO-001 negative evidence tests passed: missing, tampered, stale HTML/Worker hashes, FAIL status, and false scenario all fail closed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const actual = evaluateGeo001Evidence(actualQa, evidenceDir);
if(!actual.pass){
  console.error('GEO-001 evidence gate: FAIL');
  for(const reason of actual.reasons) console.error(`- ${reason}`);
  process.exitCode = 1;
} else {
  console.log('GEO-001 evidence gate: PASS');
}
