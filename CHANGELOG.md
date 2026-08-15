# Changelog

All notable project changes are documented here.

## 7.12.0 — 2026-08-15

Version 7.11.0 was increased to 7.12.0 because this release adds the backward-compatible MS Autobuy
feature, replaces the standalone Progress tab, and adds an automated tagged-release path.

### Added

- MS Autobuy for Kauvara's Magic Shop with a persisted 10-name exact watchlist, an 8–60 second
  sequential monitor, positive-stock and hard-price-ceiling checks, and dynamic per-item results.
- Strict Kauvara card parsing that binds visible and data names/prices, object and stock IDs,
  positive stock, and an exact three-parameter `haggle.phtml` URL.
- A dry-run review that sends no handoff message and performs no navigation, plus a real-mode fresh
  stock recheck, short-lived review, one-way listing fingerprint, duplicate window, and cross-tab
  lock for one exact haggle-page handoff.
- A GitHub Actions release workflow that verifies a matching `v<version>` tag, audits dependencies,
  runs the full release gate, packages the extension, and publishes the versioned ZIP.
- Current sanitized installed-build screenshots for dynamic dailies and MS Autobuy.

### Changed

- Replaced the dashboard's standalone **Progress** tab with **MS Autobuy**. Daily progress remains
  visible in the Dailies experience through claim states and live next-available countdowns.
- Updated storage to schema 5 for MS Autobuy settings and redacted handoff history.
- Synchronized extension, package, build, CI artifact, documentation, and release archive metadata
  at version 7.12.0.

### Fixed

- Prevented an absent Kauvara-page notice from rendering as the literal text `null`; the installed
  UI and regression suite verify the corrected state.

MS Autobuy deliberately stops at Neopets' official haggle page. The user completes the offer and
human verification manually; the extension does not solve or click verification, submit an offer, or
claim purchase success. Auto Pricing rules and behavior are unchanged in 7.12.0.

## 7.11.0 — 2026-08-15

Version 7.10.0 was increased to 7.11.0 because this release adds backward-compatible dynamic daily
claim tracking and extends the guarded SW Autobuy fresh-listing workflow across Shop Wizard's
rotating market sections.

### Added

- Exact next-available countdowns for daily, monthly, manual/anytime, elapsed-time, and exhausted
  per-day claim limits using the Neopian `America/Los_Angeles` reset boundary, including daylight
  saving transitions.
- Claim-focused dailies guidance and regression coverage for daily claim persistence, idempotent
  clicks, per-day limits, daily/monthly resets, and spring/fall time changes.
- Bounded SW Autobuy fresh-listing discovery across at most eight independently rate-authorized Shop
  Wizard sections before a confirmed purchase can proceed.

### Changed

- The daily check now records a successful claim and remains disabled until the routine is actually
  available again. A second click can no longer silently erase cooldown tracking.
- Daily rows show `Claimed · available in …`; count-based routines remain ready until their daily
  cap and then count down to the next Neopian reset.
- Synchronized the extension, package, build, documentation, CI artifact, and release archive at
  version 7.11.0. Storage schema 4 remains compatible and unchanged.

### Fixed

- Updated the development-only `sharp` image dependency to 0.35.3 after the upstream libvips
  advisory affected earlier releases; dependency audit now reports zero vulnerabilities. The
  documented Node.js minimum is 20.9 to match the patched package's engine requirement.
- A valid SW Autobuy listing no longer fails merely because a single fresh Shop Wizard response
  rotated to a different market section. Every additional read is worker-authorized and paced; an
  identity or price change aborts immediately, all-eight-section misses fail closed, and the exact
  purchase URL is still followed at most once with no purchase retry.

Auto Pricing rules and pricing behavior are unchanged in 7.11.0.

## 7.10.0 — 2026-07-18

Version 7.9.0 was increased to 7.10.0 because this release adds a backward-compatible live Shop
Wizard watchlist and its persisted configuration, authorization, cancellation, UI, and tests.

### Added

- SW Autobuy watchlist for up to 10 exact item names, with case-insensitive deduplication, dynamic
  per-item results, and a review action for the lowest fully validated listing within the configured
  ceiling.
- Continuous sequential monitoring while the SW Autobuy dashboard tab remains open, with a
  configurable 6–60 second interval, shared global lookup pacing, explicit stop control, navigation/
  tab-switch cancellation, bounded authenticated responses, and no parallel requests.
- Background authorization that binds each monitor lookup to the saved watchlist, exact Shop Wizard
  page, feature enablement, canonical item name, and monitor UUID before the same-origin request can
  run.
- Settings and regression coverage for watchlist limits, persistence, authorization mismatch,
  response parsing, and schema migration.

### Changed

- Renamed the user-facing **Auto Buy** tab and controls to **SW Autobuy**.
- Monitoring remains read-only. A match still requires exact one-item review, a configured hard
  price ceiling, a fresh listing recheck, short-lived confirmation, cross-tab lock, duplicate
  protection, one purchase request, strict verification, and no blind retry.
- Updated the storage schema to version 4 and synchronized the extension/package version at 7.10.0.

### Fixed

- Fresh Auto Pricing checks no longer rely on authenticated `fetch()` returning hydrated shop rows.
  A bounded hidden same-origin frame waits for Neopets' script-populated paired fields, enforces the
  existing timeout/size limits, and removes itself on success or failure before strict fresh-state
  or post-submit verification.
- One-item SW Autobuy results remain reviewable while the next globally paced lookup authorization
  is pending instead of briefly reverting to an in-progress state.
- Opening a monitored result now reports that SW Autobuy stopped before showing its exact review.
- Real pricing and purchase reviews cannot be dismissed while their request is in flight. Safe
  pre-submit cancellation remains available, uncertain outcomes stay non-retryable, and Auto Pricing
  now owns and removes its review dialog during cleanup.
- CI artifact upload now targets the synchronized 7.10.0 production directory and release archive,
  with regression coverage preventing future manifest/package/workflow version drift.
- Pricing lookup and cancellation messages now require UUID run identifiers. Expired/malformed
  review state is pruned before a new consequential review, and dashboard-owned dialogs are removed
  during extension cleanup.
- Auto Pricing plans, fresh-state checks, and mutation payloads now contain only explicitly selected
  changed rows. Unrelated stock can no longer invalidate a one-item review or be rewritten by its
  POST, and the review button count updates when selections change.
- Auto Pricing update payloads now match the live Neopets form contract: selected rows are
  contiguously reindexed and include the exact row count plus each current price as an `oldcost_N`
  guard. Payloads with missing, duplicate, mismatched, or noncontiguous triplets fail closed.

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

- Dashboard settings buttons on Neopets pages now request the options page through a validated
  service-worker message instead of calling an unavailable content-context API.
- Stale content UI left behind by an unpacked-extension reload now removes itself when Chrome
  reports an invalidated extension context instead of emitting an unhandled storage rejection.
- Shop Wizard response parsing now accepts bounded JSON envelopes containing the same validated
  result HTML; numeric JSON fields are never trusted as prices.
- Own-stock item parsing now uses the bounded first-cell image label and cannot mistake the live
  bold quantity cell for an item name; the legacy bold fallback remains scoped to the first cell.
- Read-only pricing and Auto Buy fresh-listing checks now fetch bounded Wizard HTML from the
  authenticated same-origin Neopets content context. Fixed mutation transport now uses that same
  context only after the service worker validates the exact page/sender/settings/plan, binds fresh
  response fingerprints, acquires a cross-tab lock, and returns a one-time worker-authored payload
  or exact purchase URL.
- Same-origin Wizard requests now use Neopets' official `/shops/wizard.phtml` referrer contract,
  matching the site's working AJAX flow without changing pricing rules or adding retries.
- Shop updates now target the live form's exact `/process_market.phtml` action rather than the
  non-processing stock-display route.
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
