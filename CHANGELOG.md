# Changelog

All notable project changes are documented here.

## 7.9.0 — 2026-07-18

Version 7.8.0 was increased to 7.9.0 because this release adds a backward-compatible guarded
one-item purchase capability and materially strengthens existing consequential-action boundaries.

### Added

- Disabled-by-default, dry-run-by-default Auto Buy for one exact Shop Wizard listing, with a hard
  maximum price, quantity fixed at one, strict item/owner/object/price/URL validation, a fresh
  listing check, short-lived confirmation, cross-tab lock, one-way duplicate fingerprint, 24-hour
  duplicate blocking, one request, no retry, and strict success-response verification.
- Separate bounded purchase-operation history and options controls.
- Tests for maximum-price enforcement, listing validation, duplicate purchases, purchase locks,
  fresh price/shop state, partial-success classification, strict currency formatting, daily reset
  boundaries, disabled-startup reactivation, and sender/page validation.

### Changed

- Auto Pricing now fetches and parses fresh authenticated shop stock immediately before issuing a
  short-lived confirmation. Account, row count, item ID/name, form fields, and current prices must
  still match the reviewed plan.
- Selected shop prices now have a hard minimum of 1 NP. Thousands separators must be correctly
  grouped; malformed commas and internal whitespace are rejected.
- Consequential requests that may have reached Neopets but cannot be verified are recorded as
  `uncertain` and never treated as ordinary retryable failures.
- Manual `anytime` daily tracking resets at the Neopian day boundary so “Today's progress” cannot
  include an old completion indefinitely.
- Disabled content-script startup now keeps its settings listener active, allowing later enablement
  without a page reload.
- Schema upgrades and sanitization repairs now write their canonical result back once instead of
  repeating an in-memory migration on every load.
- Updated the storage schema to version 3 and synchronized the extension/package version at 7.9.0.

### Fixed

- Stale price plans could reach the price-update endpoint without a fresh server comparison.
- An undercut could calculate a zero sale price, which may remove an item from sale.
- A failed verification request after a submitted price mutation was mislabeled as a normal failure
  even though the final shop state was unknown.
- The dashboard tab grid assumed exactly three tabs.

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
- Thirty-one behavioral tests for validation, parsing, storage migration, storage corruption, save
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
