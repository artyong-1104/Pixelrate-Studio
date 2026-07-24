# Changelog

All notable changes to Pixelate Studio are documented in this file.

Entries are grouped by version and change type.

Korean version: [CHANGELOG.ko.md](./CHANGELOG.ko.md)

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
