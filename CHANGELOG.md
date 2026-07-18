# Changelog

All notable project changes are documented here.

## 7.8.0 — 2026-07-18

Version 7.7.9 was increased to 7.8.0 because this release is a substantial backward-compatible
rebrand and production-hardening update, not a breaking redesign.

### Added

- Neopian Assistant branding, original extension logo, complete icon set, popup, options page, store
  metadata, and exact unofficial-extension disclaimer.
- Versioned storage migration from the legacy keys without silently enabling real Auto Pricing.
- Explicit Auto Pricing opt-in and dry-run defaults, plan confirmation, operation IDs,
  account/page/item/price validation, conservative request spacing, cancellation, cross-tab locks,
  timeouts, abort handling, one-shot submission, and exact post-update verification.
- Safe daily group/item editing, search, cooldown-aware status, local progress history,
  import/export, and data deletion.
- Reproducible esbuild production build, packaging, Manifest/file/icon/CSP validator, secret
  scanner, Prettier, Biome, npm lockfile, and GitHub Actions CI.
- Twenty-eight behavioral tests for validation, parsing, storage migration, storage corruption, save
  serialization, operation schemas, locks, networking, Manifest configuration, and idempotent
  lifecycle behavior.
- Complete privacy, security, contribution, audit, store-listing, issue, pull-request, and testing
  documentation.
- Sanitized design concepts and clean-profile smoke-test evidence.

### Changed

- Replaced the original monolithic content application with bounded source modules while retaining
  vanilla JavaScript.
- Narrowed host access from all Neopets subdomains and schemes to `https://www.neopets.com/*`.
- Replaced the arbitrary background fetch proxy with a strict fixed-endpoint message router.
- Changed daily navigation so opening a link never records completion; completion is a separate
  explicit control.
- Reduced the original one-second perpetual refresh interval to a cleared 30-second status refresh
  and event-driven updates.
- Kept approved automatic pricing and official item icons while adding the documented safety
  controls.

### Fixed

- Unsafe `innerHTML`, unvalidated storage/DOM/API/message inputs, missing sender validation, missing
  response bounds, false success reporting, unbounded cancellation state, and duplicate
  initialization risk.
- Duplicate dashboard rendering during search and periodic refresh.
- Hidden Auto Pricing controls being made visible by author CSS.
- A shared-data identity race that could show Auto Pricing enabled while the service worker still
  read it as disabled.
- Resilience for empty-body HTML fragments, malformed prices, timeouts, cancellation, HTTP failures,
  missing account context, and exact verification mismatches.

### Removed

- Generic cross-origin fetch proxying, broad host matching, unsafe HTML injection, obsolete
  web-accessible module loading, the old abstract binary icon, and legacy root build files.
