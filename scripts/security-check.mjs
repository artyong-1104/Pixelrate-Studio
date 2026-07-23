import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');
const securityGuide = readFileSync(resolve(root, 'SECURITY.md'), 'utf8');
const vercelConfig = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
const jszip = readFileSync(resolve(root, 'vendor/jszip.min.js'));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const csp = html.match(
  /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([^"']*(?:'[^']*'[^"']*)*)["']\s*>/i,
)?.[1] ?? '';

check(csp.includes("default-src 'none'"), "CSP must start from default-src 'none'");
check(csp.includes("script-src 'self'"), "CSP must restrict scripts to this project");
check(csp.includes("connect-src 'none'"), "CSP must block runtime network connections");
check(csp.includes("object-src 'none'"), "CSP must block plugin objects");
check(csp.includes("base-uri 'none'"), "CSP must block base URL injection");
check(csp.includes("form-action 'none'"), "CSP must block form submission");
check(!csp.includes("'unsafe-eval'"), "CSP must not allow unsafe-eval");
check(!/script-src[^;]*'unsafe-inline'/.test(csp), "CSP must not allow inline scripts broadly");

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.trim());
check(inlineScripts.length === 1, 'Exactly one application inline script is expected');

if (inlineScripts.length === 1) {
  const inlineHash = createHash('sha256').update(inlineScripts[0]).digest('base64');
  check(
    csp.includes(`'sha256-${inlineHash}'`),
    'CSP inline script hash is stale; recalculate it after changing application JavaScript',
  );
  check(
    securityGuide.includes(`'sha256-${inlineHash}'`),
    'SECURITY.md deployment CSP hash is stale',
  );
  const vercelHeaders = vercelConfig.headers
    ?.flatMap(rule => rule.headers ?? [])
    .find(header => header.key.toLowerCase() === 'content-security-policy')
    ?.value ?? '';
  check(
    vercelHeaders.includes(`'sha256-${inlineHash}'`),
    'vercel.json deployment CSP hash is stale',
  );

  try {
    new Function(inlineScripts[0]);
  } catch (error) {
    failures.push(`Application JavaScript syntax error: ${error.message}`);
  }
}

const jszipTag = html.match(/<script\s+src=["']\.\/vendor\/jszip\.min\.js["'][^>]*>/i)?.[0] ?? '';
const expectedIntegrity = jszipTag.match(/\sintegrity=["']sha384-([^"']+)["']/i)?.[1] ?? '';
const actualIntegrity = createHash('sha384').update(jszip).digest('base64');
check(Boolean(jszipTag), 'JSZip must be loaded from the local vendor directory');
check(expectedIntegrity === actualIntegrity, 'Local JSZip integrity hash does not match its file');
check(
  vercelConfig.rewrites?.some(rule => rule.source === '/' && rule.destination === '/pixelate_studio.html'),
  'Vercel root path must rewrite to pixelate_studio.html',
);

const pinnedAssets = new Map([
  ['vendor/fonts/PressStart2P-Regular.ttf', '7b939b816f8ce185dd8c2c59e85fb05d3dcd5cde0c0b0de4a1651cb5af9c2c2b'],
  ['vendor/fonts/Galmuri11.woff2', 'f467d1b10e6b88dfa8399c9f93b38c7643e050abfe4fc15800ac0b000f5a57d6'],
  ['vendor/fonts/Galmuri11-Bold.woff2', '8643094f395aa2dbad6bc4385cc043314801eaec2e759d549435ec8ac4f2d078'],
]);
for (const [relativePath, expectedHash] of pinnedAssets) {
  const actualHash = createHash('sha256')
    .update(readFileSync(resolve(root, relativePath)))
    .digest('hex');
  check(actualHash === expectedHash, `${relativePath} does not match its pinned hash`);
}

check(!/https?:\/\//i.test(html), 'HTML must not load or reference remote HTTP resources');
check(!/@latest\b/i.test(html), 'Mutable @latest dependencies are forbidden');
check(!/\son[a-z]+\s*=/i.test(html), 'Inline HTML event handlers are forbidden');
check(!/\b(?:innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write\s*\(/.test(html), 'HTML parsing sinks are forbidden');
check(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(html), 'Dynamic JavaScript evaluation is forbidden');
check(
  !/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon\s*\(/.test(html),
  'Unexpected runtime network API found',
);
check(!/accept=["']image\/\*["']/i.test(html), 'File input must use an explicit raster image allowlist');
check(/const MAX_FILE_COUNT = \d+;/.test(html), 'File count limit is required');
check(/const MAX_FILE_BYTES = \d+ \* 1024 \* 1024;/.test(html), 'Per-file byte limit is required');
check(/const MAX_TOTAL_BYTES = \d+ \* 1024 \* 1024;/.test(html), 'Total upload byte limit is required');
check(/const MAX_IMAGE_PIXELS = \d+ \* \d+;/.test(html), 'Decoded pixel limit is required');
check(/const MAX_TOTAL_IMAGE_PIXELS = \d+ \* 1024 \* 1024;/.test(html), 'Total decoded pixel limit is required');
check(/const MAX_RAW_PROCESS_PIXELS = \d+ \* 1024 \* 1024;/.test(html), 'Raw processing limit is required');
check(/const MAX_PALETTE_SAMPLES = \d+;/.test(html), 'Palette sampling limit is required');
check(/const MAX_COLOR_COMPARISONS = \d+;/.test(html), 'Color comparison limit is required');
check(
  /lastResults\.length > 0 && persistLogsEnabled/.test(html),
  'Persistent result logging must remain explicit opt-in',
);

if (failures.length) {
  console.error('Security checks failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Security checks passed (CSP, integrity, unsafe sinks, network APIs, input limits, storage opt-in).');
}
