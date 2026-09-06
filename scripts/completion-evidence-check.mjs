import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const dir = 'pixelizer-codex-research/evidence/completion-20260906';
const read = name => fs.readFileSync(path.join(root, name));
const json = name => JSON.parse(read(name));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest = json(`${dir}/manifest.json`);
function verify(m, get = read) {
  assert.equal(m.applicationSha256, hash(get('pixelate_studio.html')));
  assert.equal(m.workerSha256, hash(get('pixelate-worker.js')));
  assert.ok(Object.keys(m.files).length >= 20);
  for (const [name, expected] of Object.entries(m.files)) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..'));
    const bytes = get(name);
    assert.equal(bytes.length, expected.bytes, name);
    assert.equal(hash(bytes), expected.sha256, name);
  }
  const report = JSON.parse(get(`${dir}/integration.json`));
  assert.equal(report.status, 'PASS');
  assert.equal(report.applicationSha256, m.applicationSha256);
  assert.equal(report.workerSha256, m.workerSha256);
  assert.equal(report.scenarios.length, 5);
  for (const scenario of report.scenarios) assert.equal(scenario.status, 'PASS', scenario.name);
  for (const [name, expected] of Object.entries(report.artifacts)) {
    const bytes = get(`${dir}/${name}`);
    assert.equal(hash(bytes), expected.sha256, name);
    assert.equal(bytes.length, expected.bytes, name);
  }
  const qa = JSON.parse(get('pixelizer-codex-research/evidence/completion-session.json'));
  assert.equal(qa.cfg.cancelFocus, 'applyPresetBtn');
  assert.equal(qa.ux.logFallback.sourceDisabled, true);
  assert.equal(qa.ux.logFallback.splitDisabled, true);
  assert.equal(qa.ux.closed.sourceCanvasCount, 0);
  assert.equal(qa.ux.closed.open, false);
  assert.notEqual(qa.ux.pan.before.left, qa.ux.pan.after.left);
  assert.equal(qa.alp.measurements.length, 3);
  assert.equal(qa.alp.backgrounds.length, 7);
  assert.equal(qa.alp.inputShortcutIgnored, true);
  assert.equal(qa.alp.invalidCustomPreserved, '#12AB34');
}
verify(manifest);
assert.throws(() => verify({...manifest, applicationSha256:'stale'}));
const target = `${dir}/integration.json`;
assert.throws(() => verify(manifest, name => {
  if (name === target) throw new Error('missing evidence');
  return read(name);
}));
assert.throws(() => verify(manifest, name => name === target ? Buffer.from('tampered') : read(name)));
const failed = structuredClone(manifest);
const failedReport = json(target);
failedReport.status = 'FAIL';
const failedBytes = Buffer.from(JSON.stringify(failedReport));
failed.files[target] = {bytes:failedBytes.length, sha256:hash(failedBytes)};
assert.throws(() => verify(failed, name => name === target ? failedBytes : read(name)));
console.log('PASS: current-source integration/artifact integrity and missing/tampered/stale/FAIL rejection. This does not replace the dedicated PERF evidence gate.');
