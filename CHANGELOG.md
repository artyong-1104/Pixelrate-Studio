# Changelog

All notable changes to Pixelate Studio are documented in this file.

Entries are grouped by version and change type.

Korean version: [CHANGELOG.ko.md](./CHANGELOG.ko.md)

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
