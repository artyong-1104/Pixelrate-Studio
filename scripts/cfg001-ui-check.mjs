import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Check DOM structure
assert.match(html, /<div class="preset-toolbar"/, 'preset-toolbar container must exist');
assert.match(html, /<select id="presetSelect"/, 'presetSelect must exist');
assert.match(html, /<option value="default">/, 'default preset option must exist');
assert.match(html, /<option value="animation-safe">/, 'animation-safe preset option must exist');
assert.match(html, /<option value="preserve-sheet">/, 'preserve-sheet preset option must exist');
assert.match(html, /<button[^>]*id="applyPresetBtn"/, 'applyPresetBtn must exist');
assert.match(html, /<button[^>]*id="exportSettingsBtn"/, 'exportSettingsBtn must exist');
assert.match(html, /<button[^>]*id="importSettingsBtn"/, 'importSettingsBtn must exist');
assert.match(html, /<input type="file" id="importSettingsInput"/, 'importSettingsInput must exist');
assert.match(html, /<div id="presetDiffBox"/, 'presetDiffBox must exist');
assert.match(html, /<ul id="presetDiffList"/, 'presetDiffList must exist');
assert.match(html, /<button[^>]*id="presetDiffCancelBtn"/, 'presetDiffCancelBtn must exist');
assert.match(html, /<button[^>]*id="presetDiffConfirmBtn"/, 'presetDiffConfirmBtn must exist');
assert.match(html, /<div id="settingsFeedback"[^>]*aria-live="polite"/, 'settingsFeedback with aria-live="polite" must exist');

// 2. Check Event Wiring in Script
assert.match(html, /applyPresetBtn\.addEventListener\('click'/, 'applyPresetBtn click listener must exist');
assert.match(html, /presetDiffCancelBtn\.addEventListener\('click'/, 'presetDiffCancelBtn click listener must exist');
assert.match(html, /presetDiffConfirmBtn\.addEventListener\('click'/, 'presetDiffConfirmBtn click listener must exist');
assert.match(html, /exportSettingsBtn\.addEventListener\('click'/, 'exportSettingsBtn click listener must exist');
assert.match(html, /importSettingsBtn\.addEventListener\('click'/, 'importSettingsBtn click listener must exist');
assert.match(html, /importSettingsInput\.addEventListener\('change'/, 'importSettingsInput change listener must exist');
assert.match(html, /applyUiSettings\(DEFAULT_SETTINGS\)/, 'resetBtn must call applyUiSettings(DEFAULT_SETTINGS)');

console.log('CFG-001 DOM elements and interaction wiring verified successfully.');
