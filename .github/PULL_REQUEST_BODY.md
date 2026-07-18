## Summary

This PR completes the production audit, repair, Manifest V3 hardening, Neopian Assistant rebrand,
test foundation, documentation pass, and release pipeline for extension version 7.8.0.

Neopian Assistant remains a vanilla JavaScript Chrome extension. Approved Auto Pricing and official
daily item icons remain available, with the approval boundary disclosed as project-specific. Auto
Pricing is now off by default, dry-run by default, conservatively paced, explicitly reviewed, locked
across tabs, submitted once, and verified before success.

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

## Architecture changes

- Replaced the five-file/930-line monolith with modular source under `src/` and a generated `dist/`
  production build.
- Added a fixed-endpoint Manifest V3 module service worker, bundled isolated-world content script,
  popup, full options page, shared validation/storage/network modules, build tooling, packaging,
  tests, and CI.
- Removed the arbitrary fetch proxy, unsafe HTML rendering, broad host matching, web-accessible
  application module, and legacy root build files.

## Features reviewed

- Daily navigation, explicit completion/reset, cooldown state, progress/history, groups, search, and
  editing.
- Popup, options, themes, density, import/export, clear-data controls, and storage migration.
- Shop page/account/item parsing, Shop Wizard lookup, price calculation, Auto Pricing
  scan/cancel/review/apply/verify, operation status, and multi-tab behavior.
- Manifest permissions, service-worker lifecycle, content injection, icons, privacy, accessibility,
  performance, packaging, and release documentation.

## Critical defects fixed

- Removed an arbitrary authenticated background fetch proxy accepting caller-controlled URL, method,
  headers, and body. Runtime networking is now limited to audited `www.neopets.com` endpoints with
  strict message/sender/page validation, timeouts, abort handling, and response bounds.

## High-severity defects fixed

- Added exact-plan fingerprinting, operation IDs, confirmation tokens, cross-tab locking, current
  page/account/item/field/price validation, one-shot submission, and exact post-update verification.
- Replaced unsafe `innerHTML` rendering and permissive trust-boundary coercion with safe DOM
  creation and bounded validation.
- Narrowed host access to `https://www.neopets.com/*` and removed web-accessible resources/external
  messaging.
- Separated daily navigation from explicit manual completion so navigation cannot report false
  success.

## Medium-severity defects fixed

- Added idempotent initialization/teardown, bounded state, cleared timers/observers/listeners,
  serialized storage writes, stable shared data identity, and normalized storage equivalence.
- Added request spacing, timeouts, cancellation, HTTP/empty/malformed/wait-state handling, import
  limits, schema migration, and corrupt-storage recovery.
- Fixed duplicate dailies rendering and CSS that incorrectly exposed inactive Auto Pricing controls.
- Added reproducible build, lockfile, formatting, linting, tests, validation, secret scan, CI, and
  release archive generation.
- Standardized development branches under enforced feature/fix/hotfix/refactor/docs/test/chore
  prefixes with lowercase kebab-case descriptions.

## Security improvements

- One narrow host permission and one `storage` permission; no optional permissions.
- No remote executable code, inline script/handlers, `eval`, unsafe HTML APIs, external connection,
  or web-accessible resource.
- Strict runtime message schemas and sender extension/tab/exact-page checks.
- Fixed destinations/headers, 2 MB responses, 15/20-second deadlines, cancellation, bounded run
  data, SHA-256 plan binding, short-lived tokens, cross-tab locks, and redacted operation history.
- Repository and staged-content secret scanning excludes/transparently rejects credentials, private
  paths, profiles, cookies, sessions, logs, databases, and HAR files.

## Reliability and performance improvements

- Reduced the baseline one-second perpetual timer to a cleared 30-second status tick plus
  event-driven updates.
- Added service-worker-persistent session/local operation state rather than relying on globals as
  authority.
- Bounded groups, routines, history, operations, shop rows, response bytes, imports, cancellation
  IDs, prices, and per-run updates.
- Sequential conservative lookups, no blind update retry, exact verification, and accurate
  failure/success messages.

## Code-quality improvements

- Preserved vanilla JavaScript while introducing focused modules, centralized constants/schemas, a
  deterministic esbuild/Sharp build, Prettier, Biome, Node tests, static validation, and release
  packaging.
- Removed stale experiments, unsafe proxy code, old naming, and obsolete production files.

## UX and accessibility improvements

- Added complete loading/running/success/warning/failure/disabled states, progress, cancellation,
  empty states, and consequential-action confirmation.
- Added responsive popup/options/dashboard surfaces, semantic tabs/forms/dialogs/tables/buttons,
  labels and accessible names, visible focus, polite status regions, keyboard navigation,
  contrast-aware themes, and reduced-motion support.
- Popup/options explain permissions, local data, policy-sensitive behavior, project-specific
  approval, and exact license status.

## Privacy improvements

- No analytics, telemetry, ads, developer backend, cookie access, or sensitive production logging.
- Local storage is schema-validated and documented; pricing transmits only validated item
  names/reviewed form data to fixed Neopets HTTPS endpoints.
- Added accurate export/import/delete controls and `PRIVACY.md` covering data read, stored,
  transmitted, retained, cleared, and logged.

## Branding changes

- Rebranded all product surfaces and package/release metadata as **Neopian Assistant**.
- Added the exact tagline and unofficial-extension disclaimer.
- Added an original compass-spark extension logo and complete generated icon set.
- Retained approved official daily item images from the restricted `images.neopets.com/items/`
  origin; no official Neopets logo is used.

## Manifest and permission changes

- Version: 7.7.9 → 7.8.0 (substantial backward-compatible hardening and rebrand).
- Manifest V3 retained; minimum Chrome version set to 114.
- Host scope changed from broad schemes/subdomains to `https://www.neopets.com/*`.
- Added popup/options, strict extension CSP, complete icon references, `incognito: not_allowed`, and
  top-frame `document_idle` content execution.
- Removed web-accessible resources; no external connection or optional permissions exist.

## Tests executed

- `npm ci` — passed; 31 packages installed from the lockfile.
- `npm audit --audit-level=high` — passed; 0 vulnerabilities.
- `npm run format:check` — passed.
- `npm run lint` — passed; 61 files, no fixes or warnings.
- `npm test` — passed; 31 tests, 31 passed, 0 failed, 0 skipped.
- `npm run validate:branch -- feature/neopian-assistant-audit-rebrand` — passed.
- `npm run test:coverage` — passed; 55.43% aggregate line coverage, with UI behavior additionally
  exercised in the real-browser smoke suite.
- `npm run build` — passed; production output in `dist/`.
- `npm run validate` — passed; Manifest V3, 11 references, icons/alpha, CSP-safe HTML,
  branding/version, and production API constraints.
- `npm run secret-scan` — passed; no credential-shaped values, sensitive filenames, or private local
  paths.
- `npm run package` — passed; 21-file release archive.

## Smoke-test results

Chrome for Testing 151 loaded `dist/` in a disposable profile with no real credentials. Verified:

- Extension install/manifest parsing, module service worker registration and full browser restart.
- Popup, options, dashboard, exact branding/disclaimer, and 31/31 approved official item icons.
- One-shell idempotency after reload, two matched tabs, and zero injection on an unmatched origin.
- Settings and Auto Pricing opt-in persistence across content/service-worker contexts and browser
  restart.
- Mocked two-item dry-run pricing, conservative spacing, results, confirmation checkbox,
  account/item/range/UUID operation summary, and explicit “No prices were submitted” completion.
- Mocked HTTP 503 failure with two error rows and no review action.
- Offline popup startup, keyboard focus visibility, and zero final console errors/warnings.

No real purchase, offer, inventory action, credential, or shop price update was used.

## Manual validation and screenshots

- [Dailies dashboard](docs/evidence/dashboard-smoke.png)
- [Auto Pricing dry run](docs/evidence/auto-pricing-smoke.png)
- [Popup](docs/evidence/popup-smoke.png)
- [Options](docs/evidence/options-smoke.png)
- [Full test evidence](docs/TEST_EVIDENCE.md)
- [Production audit](AUDIT_REPORT.md)

## Remaining limitations

- Live Neopets markup can change; parsers safely abort but require maintenance when selectors
  change.
- Automated tests intentionally did not execute a real shop update. The owner should perform one
  authorized, manually reviewed, one-item validation and retain sanitized evidence.
- Chrome Web Store submission itself is outside this PR; `STORE_LISTING.md` is a reviewed draft.
- GitHub private vulnerability reporting is currently disabled and should be enabled in repository
  settings.
- The owner's project-specific approvals are stated but not independently published; downstream
  users must not treat them as general authorization.

## Policy risks

Chrome Web Store risks are mitigated through Manifest V3, no remote code, minimized permissions, one
documented purpose, and accurate user-data disclosure. Neopets' published terms broadly restrict
automation. The owner states this project has specific approval for Auto Pricing and official item
icons; the implementation keeps that approval boundary visible, requires opt-in and dry-run by
default, uses conservative pacing, and contains no CAPTCHA bypass, stealth, detection evasion, proxy
rotation, or blind retry.
