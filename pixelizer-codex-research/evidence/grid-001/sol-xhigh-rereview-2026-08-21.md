# GRID-001 algorithm v2 independent Sol xhigh re-review

STATUS: DONE_WITH_CONCERNS

FINDINGS:

1. **P1 - Fresh browser QA for algorithm v2 is absent, so `requiredReview: PASS` is not allowed.** `qa-results.json` records `algorithmVersion: 2` with `status: NEEDS_RERUN`; all detailed browser measurements are explicitly retained history from algorithm v1. The required v2 artifact `browser-clean-pixel-art-auto.jpg`, which must demonstrate automatic 4x4 phase 0/0 detection, does not exist. A direct evaluation of the current evidence returns `browserQaPass: false`, `captureEvidencePass: false`, and `requiredReviewPass: false`. This is an unmet manual-QA acceptance condition, not a remaining detector-code defect.

2. **P3 - The capture gate is stronger than before but does not establish semantic screenshot validity.** `validGrid001JpegEvidence()` checks an exact basename, existence, at least four bytes, and the first three JPEG signature bytes (`scripts/lib/grid001-evidence-gate.mjs:17-22`). The regression test intentionally treats a four-byte pseudo-JPEG as sufficient (`scripts/grid001-evidence-gate-check.mjs:11-43`). The five stored v1 files are decodable JPEGs according to `file` and have non-zero dimensions, but future evidence hardening should validate decodability and dimensions or pin capture hashes. This concern does not unlock or incorrectly mark the current v2 work `DONE`, because the required v2 capture is absent and all evidence gates currently fail closed.

SPEC_ALIGNMENT:

- **Previous P1 clean-fixture gate - RESOLVED.** `scripts/grid-detection-check.mjs:83-103` now asserts QLT `clean-pixel-art` as 4x4, phase 0/0 on both synchronous and asynchronous detector paths. Independent variants also returned exact period and phase for translations 0 through 3 and block sizes 2 through 8. In 500 deterministic random binary rectangle masks, none reached the 0.75 auto-apply threshold; 17 reached only the 0.5-0.749 preview range. An opaque-background variant remained a safe rejection: it returned 4x12 at confidence 0.314, below automatic application.
- **Previous P1 fail-closed evidence gate - RESOLVED, with the P3 screenshot-validity hardening noted above.** Exact required capture names, basename confinement, file existence and signature, review-report basename and existence, report SHA-256, exact `RECOMMENDATION: PASS`, and browser end-to-end chunk <=100ms are enforced. Missing, tampered, traversal, `CHANGES_REQUESTED`, and slow-performance cases all fail closed in executable tests. The current incomplete evidence is rejected rather than promoted to `DONE`.
- **Previous P2 preprocessing/main-thread measurement - CODE RESOLVED; BROWSER EVIDENCE PENDING.** `getGridAnalysisFramesAsync()` measures canvas draw plus `getImageData` as one synchronous chunk and yields afterward (`pixelate_studio.html:2926-2956`). Sheet allocation and copying are measured in 64-row chunks (`pixelate_studio.html:2908-2923`); binary-alpha scanning is measured in 64-row chunks and Sobel in 24-row chunks (`pixelate_studio.html:3666-3715`). `analyzeGridFramesAsync()` propagates the maximum preprocessing and Sobel chunk as one `maxChunkMs` (`pixelate_studio.html:3829-3842`). An independent 4,194,304-pixel Node run completed in 999.508ms with a maximum Sobel/end-to-end chunk of 15.881ms and detected 8x8 phase 0/0. Actual browser canvas extraction and sheet-slicing timing still requires fresh browser QA.
- **Previous P2 executable regression gap - UNIT AND WIRING LEVEL RESOLVED; BROWSER EVIDENCE PENDING.** `scripts/grid001-ui-check.mjs:46-131` executes the confidence boundaries 0.499/0.5/0.749999/0.75, performance boundaries 100/100.001ms, cancellation-state reset, exact 4M and over-limit validation, and whole/sheet `processing.grid` metadata construction. `scripts/grid-detection-check.mjs:91-149` executes preprocessing timing propagation, forced 101ms blocking, simulated `getRawPixels`, asynchronous sheet slicing, and preprocessing cancellation. These tests execute extracted inline functions and verify wiring statically; a real DOM, upload, result JSON, and UI cancellation run is still required by the browser-QA section of the spec.

TEST_EVIDENCE:

- `for check_file in scripts/*check.mjs; do node "$check_file" || exit $?; done` - all ALP-001, ANI-001, CFG-001, GEO-001, GRID-001 detector/evidence/UI, OUT-001, PAL-001, preserve-sheet, security, settings, UX-001, and visual-quality checks passed.
- `node scripts/grid-detection-check.mjs` - clean 3/4/8 grids, QLT clean 4x4 phase 0/0, wobble 8x8 confidence 0.3820, photo confidence 0.2253, alpha-edge/thin-lines auto-apply rejection, flat/low-alpha rejection, aggregate lock, crop/manual/sheet, and deterministic hash `7d972e1967c885640cf996243e514567e601c0add626cf37e1e83c9869b16396` passed.
- `node scripts/grid001-evidence-gate-check.mjs` - missing capture, missing review, report hash tamper, `CHANGES_REQUESTED`, path traversal, and 100.001ms cases all failed closed as expected.
- Independent generalization probes - QLT clean translations 0-3 and block sizes 2-8 were exact; 500 random binary rectangle masks produced zero auto-apply false positives and 17 preview-only ambiguous detections.
- Independent 4M probe - 2048x2048 RGBA, 999.508ms elapsed, 15.881ms Sobel/end-to-end max chunk, 8x8 phase 0/0, confidence 0.998921.
- JSON parsing passed for `qa-results.json`, `report.json`, `tests/fixtures/manifest.json`, and `vercel.json`.
- CSP hash `sha256-VlSApTu3a/fsShbIlOGjwG4JfKO9IsYGvRxPRoyf4pQ=` matched `pixelate_studio.html`, `SECURITY.md`, and `vercel.json`.
- `git diff --check` passed. `node --check` passed for the GRID-001 generator, detector, UI, and evidence-gate scripts.
- Current real evidence evaluation - four of five required filenames exist; `browser-clean-pixel-art-auto.jpg` is missing; browser, capture, and review gates are all `false`.

RISKS:

- Algorithm v1 browser measurements and screenshots do not establish algorithm v2 behavior. Promoting GRID-001 before a fresh v2 run would violate the spec and the fail-closed gate.
- Node algorithm timings do not establish browser canvas decode/`getImageData`, device-specific slicing, mobile long-task behavior, or visual overlay correctness.
- Alpha-topology evidence can produce preview-only warnings on some sparse shapes. No automatic-application false positive was observed in the independent sample, but production-like icon, UI, and texture corpora remain useful follow-up coverage.
- The JPEG gate does not reject every truncated or semantically invalid image that happens to have a JPEG prefix.

PRIOR_RECOMMENDATION: BROWSER_QA_REQUIRED

## Addendum - JPEG semantic evidence gate re-review

ADDENDUM_STATUS: P3_RESOLVED

The P3 screenshot-validity concern recorded above has been resolved. `inspectGrid001JpegEvidence()` now requires an exact basename, a file of at least 1024 bytes, JPEG SOI and terminal EOI markers, a parseable SOF marker, dimensions of at least 64x64, and a SHA-256 value that exactly matches `qa.captureSha256[name]` (`scripts/lib/grid001-evidence-gate.mjs:17-67`). The browser gate therefore rejects a file that merely has a JPEG prefix, a truncated JPEG, a small placeholder image, or a substituted image whose hash does not match the QA record.

The revised executable gate test uses a stored decodable browser JPEG instead of the former four-byte pseudo-JPEG and explicitly verifies that a wrong capture hash fails closed (`scripts/grid001-evidence-gate-check.mjs:12-50`). Independent negative probes additionally confirmed rejection of the former four-byte pseudo-JPEG, a JPEG with a damaged EOI marker, and a JPEG whose SOF dimensions were changed to 63x63. The stored `browser-clean-8px-overlay.jpg` was independently parsed as 360x670, 12,257 bytes, SHA-256 `76098ed7a5588d24bca69284957ed766e33a3e5962d4dd9f67b18677e26c96c7`.

Relevant regression reruns passed: `grid001-evidence-gate-check.mjs`, `grid-detection-check.mjs`, `grid001-ui-check.mjs`, `security-check.mjs`, `settings-check.mjs`, JSON parsing, related `node --check`, and `git diff --check`.

The overall recommendation does not become `PASS`: `qa-results.json` remains `algorithmVersion: 2` with `status: NEEDS_RERUN`, lacks `captureSha256`, and still lacks the required v2 `browser-clean-pixel-art-auto.jpg`. A direct evaluation continues to return `browserQaPass: false`, `captureEvidencePass: false`, and `requiredReviewPass: false`. Fresh algorithm-v2 browser QA remains the sole blocking acceptance condition identified by this re-review.

RECOMMENDATION: BROWSER_QA_REQUIRED
