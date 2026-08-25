# Changelog

All notable changes to Pixelate Studio are documented in this file.

Entries are grouped by version and change type.

Korean version: [CHANGELOG.ko.md](./CHANGELOG.ko.md)

## [Unreleased]

### Added

- Added PAL-002 experimental palette generation and sampling: deterministic OKLab K-means, MedianCut, image-balanced sampling, and reference-image sampling behind `Show experimental features`, with settings JSON and `processing.palette` metadata support. Multi-frame OKLab mapping applies a deterministic previous-index retention rule, and the qualifying shared 16-color combination is available as the opt-in `OKLab animation stable` preset. Missing or duplicate reference filenames fail closed without automatic replacement.
- Added CELL-001 experimental cell representative selection with deterministic alpha-aware `mean-srgb`, linear-light mean, center, per-channel median, and exact-RGB majority candidates. Non-default candidates remain behind `Show experimental features`, round-trip through settings JSON, and are recorded in result metadata without changing the default preset.
- Added an `AI Pixel Grid Repair (Experimental)` mode (GRID-001) with alpha-masked Sobel profiles, 2–32px X/Y period and phase detection, confidence reporting, and a 75% auto-apply gate.
- GRID-001 algorithm v2 adds binary-alpha topology evidence for sparse 4×4 clean pixel art, end-to-end main-thread chunk measurement across canvas reads, sheet slicing, alpha scans, and Sobel, plus fail-closed evidence checks.
- Added manual X/Y grid locking, excluded-margin overlays, normalized whole-image/multi-file/sprite-sheet frame analysis, and one grid locked across the complete sequence.
- Added alpha-weighted sRGB cell representatives, full-cell-only output, additive `processing.grid` metadata, a 4M automatic-analysis cap, and cancellable chunked processing.

### Validation

- Stabilized PAL-002 OKLab K-means passed the 48-row matrix with more than 27% mean OKLab-error improvement, temporal regression below 10%, no feature regression, runtime below 3×, and deterministic output. Localhost 16-frame product, 20-cell actual-size, and 390×844 mobile QA also passed while the existing `kmeans-srgb/pixel` default remains unchanged. The item is `NEEDS_REVIEW` until a new independent Sol xhigh review is bound to the changed application hash.
- CELL-001 passed exact-value/tie-break/threshold/1×/route/determinism tests, preserved both default visual hashes and all 12 QLT fixtures, and completed fresh localhost desktop/mobile/settings/actual-size QA. No candidate met the cross-fixture adoption gate, so `mean-srgb` remains the default and no experimental candidate was promoted to a preset.
- Passed automated isolated clean 3/4/8px grid, ±1px wobble, photo-like false-positive, sheet aggregation, determinism, and 4M performance gates. Sparse-edge `clean-pixel-art` safely remains below the auto-apply confidence gate and requires a manual grid, so the item stays `NEEDS_REVIEW` pending real-browser QA and an independent Sol xhigh review.

## [1.8.0] - 2026-08-19

### Added

- Added Animation Review modal (`#animModal`) for multi-file sequences and sprite sheet frames (ANI-001).
- Automatically exposed `애니메이션 검수` button in results toolbar when multiple results or sprite sheet results exist.
- Supported multi-file sequences sorted by uploaded filename ascending (with upload index tie-break) and sprite sheet frame extraction (row-major order with 256 frame upper limit).
- Added variable 1~30 FPS playback (default 8 FPS), loop toggle, previous/next step controls, and 1×/2×/8× quick zoom buttons.
- Added keyboard shortcuts: `Space` (play/pause), `←`/`→` (step frames), `B` (cycle preview background), `Esc` (close modal), safely disabled when focusing form fields.
- Displayed animation policy status chips (`#animPolicyChips`) for shared palette, grid locking, and dithering stability.
- Honored `prefers-reduced-motion: reduce` by defaulting to paused state, and guaranteed complete animation frame cancellation and cleanup on close, tab switch, or background execution.

### Fixed

- Removed an obsolete palette-checkbox event binding that aborted the entire application during startup.
- Fixed desktop and mobile animation text controls that were compressed into the 32px icon-button width.
- Added dialog semantics, focus trapping/restoration, and suppression of per-frame live announcements while playback is active.
- Preserved upload-order `addedIndex` through results and logs, and report missing dithering metadata as unknown instead of assuming dithering is off.
- Strengthened ANI checks to execute functions extracted from the application and to withhold `DONE` when browser or ten-minute playback evidence is missing.

## [1.7.0] - 2026-08-19

### Added

- Added 7 preview background options: checkerboard (`checker`), white (`white`), black (`black`), high-saturation green (`green`, `#00FF00`), magenta (`magenta`, `#FF00FF`), cyan (`cyan`, `#00FFFF`), and custom color (`custom`, `#RRGGBB`) (ALP-001).
- Added `배경 (B)` toolbar/modal buttons and global `B` shortcut for rapid background cycling (automatically bypassed when focusing input, textarea, select, or contentEditable elements).
- Implemented high-performance pure diagnostic function `computeAlphaDiagnostics` operating on pre-cleanup pre-outline logical alpha channels.
- Added 4-neighbor connected component analysis for small isolated foreground islands (area $\le 4$) and partial alpha pixel counts ($0 < \alpha < 255$) with strict sprite-sheet frame boundary isolation.
- Displayed alpha diagnostics summary in result card metadata (`부분 알파 N · 작은 섬 M` / `부분 알파 없음 · 고립 섬 없음` / `알파 진단: 기록 없음`).
- Added modal `알파 진단` toggle button and interactive overlay canvas (`#modalAlphaOverlay`) highlighting island pixels with semi-transparent yellow rectangles and bounding boxes.
- Emitted `diagnostics.alpha` (`partialAlphaCount`, `islandCount`, `islandPixelCount`, `threshold`) in export JSON envelopes.

## [1.6.0] - 2026-08-19

### Added

- Added palette mode selector (`자동 생성 (K-means)` / Auto, `직접 지정 (Custom Palette)` / Custom, `제한 없음 (원본 색상)` / Unlimited) (PAL-001).
- Added custom palette UI: `#RRGGBB` hex textarea, file upload (`.txt`, `.gpl`, `.png`), and clear button.
- Implemented strict HEX parser (`parseHexPalette`), GIMP palette parser (`parseGplPalette`), and PNG raster opaque color extractor (`parsePngPaletteData`).
- Added exact RGB deduplication preserving first-appearance order (`dedupePaletteColors`), live stats (`유효 N색 · 중복 M개 제거 · 무시 K개`), and interactive swatch chip preview grid.
- Guaranteed deterministic tie-breaking for equidistant sRGB colors favoring earlier palette indices.
- Preserved complete custom palettes (including unused colors) in output JSON `palette` object alongside `processing.palette` (`mode`, `inputColors`, `usedColors`, `distance`) metadata.
- Enforced `MAX_COLOR_COMPARISONS` (50,000,000) execution guard against excessive processing workload.
- Integrated `paletteMode` and `customPalette` into versioned settings envelope v1 with backward-compatible migration of legacy `paletteEnabled` flag.

## [1.5.0] - 2026-08-19

### Added

- Added `1×` (native resolution), `2×` (standard), and `8×` (diagnostic) quick zoom buttons in modal view (UX-001).
- Added view mode controls (`결과` / Result, `원본` / Source, `나란히` / Side-by-side A/B comparison).
- Maintained distortion-free aspect alignment and dimension labels across matching comparison frames.
- Isolated the 1-pixel grid overlay strictly to the pixel art result canvas.
- Added graceful fallback for log-restored results lacking original source images (disabling source modes with informative tooltips).
- Added responsive vertical stacking for side-by-side panes on mobile viewports (<= 620px).

## [1.4.0] - 2026-08-19

### Added

- Added portable, versioned settings envelope v1 (`pixelate-studio-settings`) JSON export and import (CFG-001).
- Added goal-oriented built-in presets (`default`, `animation-safe`, `preserve-sheet`).
- Added deterministic inline diff preview and user confirmation before applying preset changes.
- Added strict envelope validation, 64KB size limit, and prototype pollution protection (`__proto__`, `prototype`, `constructor`).
- Ensured atomic validation where invalid imported files leave UI settings completely unmodified.
- Migrated legacy IndexedDB flat settings to normalized v1 representation for backward-compatibility.

## [1.3.0] - 2026-08-14

### Added

- Added optional 2×/4×/8× nearest-neighbor enlarged PNG dual export alongside native logical resolution PNGs (OUT-001).
- Generated enlarged PNGs on-demand as exact N×N uniform RGBA pixel blocks with immediate memory release.
- Added dynamic individual PNG download buttons per selected scale on result cards.
- Supported sequential ZIP export bundling native PNGs, scaled PNGs, and JSON metadata with `exports` configuration.
- Added boundary limit warnings and graceful exclusion for canvases exceeding maximum pixel or dimension limits.

## [1.2.0] - 2026-08-14

### Added

- Added an exact integer factor downscaling mode (`factor`) preserving aspect ratios with native logical resolution output (GEO-001).
- Supported whole-image downscaling and sprite sheet frame-local downscaling.
- Kept noise cleanup and outline effects confined within frame boundaries in sheet mode.
- Added live dimension calculation and pre-execution validation rejecting non-divisible inputs with file names and calculations.
- Added `factor`, `frameMode`, and logical dimension metadata to saved settings and JSON results.

## [1.1.0] - 2026-08-02

### Added

- Added an original-geometry mode that preserves a sprite sheet's canvas size and frame layout.
- Added frame width, frame height, and 1/2/4/8-pixel block-size controls.
- Kept cleanup and outlines inside each frame in original-geometry mode.
- Added processing-mode, frame-geometry, and block-size metadata to saved settings and JSON results.

### Changed

- Replaced the downscale checkbox with square-downscale, original-geometry, and no-resize modes.
- Mapped older work-history records from the previous `downscaleEnabled` setting.
- Renamed the frame control to clarify that it expects the source frame size and does not resize the output.
- Added per-file column, row, and total-frame previews plus invalid-division and single-frame warnings.
- Removed the unused legacy transform pipeline and added regression checks for layout, validation, blocks, alpha, and frame boundaries.

## [1.0.1] - 2026-07-24

### Added

- Added separate preview-background and browser-storage sections to the Settings dialog.
- Added hover-based help tooltips with keyboard-focus support.

### Changed

- Refined the upload instructions, Settings dialog spacing, labels, alignment, and close button.
- Updated the left control panel so settings scroll independently while the action buttons remain fixed.
- Hid the control panel scrollbar without disabling wheel or trackpad scrolling.
- Matched the scroll area background to the surrounding panel in both themes.

### Fixed

- Ensured the Settings backdrop dims the sticky top bar and left control panel.
- Removed click-to-toggle behavior from help buttons.
- Added a Vercel root rewrite so `/` serves `pixelate_studio.html`.

### Security

- Synchronized the inline-script CSP hash across the HTML document, Vercel headers, and security documentation.

## [1.0.0] - 2026-07-23

### Added

- Released browser-only image conversion with no application-level server upload.
- Added multi-image upload for sprite frames.
- Added configurable downscaling, palette reduction, shared palettes, isolated-pixel cleanup, and outlines.
- Added PNG, JSON, and combined ZIP downloads.
- Added optional IndexedDB work-history storage and result restoration.
- Added dark and light themes plus configurable preview backgrounds.
- Added local JSZip and font assets with bundled license files.
- Added a security guide and automated security checks.

### Security

- Added a restrictive Content Security Policy and deployment security headers.
- Added upload count, file-size, decoded-pixel, processing, and palette-computation limits.
- Kept persistent work-history storage disabled by default and available only through explicit opt-in.
