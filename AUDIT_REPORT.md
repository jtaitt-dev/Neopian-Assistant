# Neopian Assistant Production Audit Report

Audit completed: 2026-07-18

Audited release: 7.8.0 Baseline release: 7.7.9

## Executive summary

The imported extension was a five-file Manifest V3 project with a 930-line monolithic application,
no package manifest, lockfile, build pipeline, tests, CI, popup, options page, privacy/security
documentation, or release process. The most serious defect was an arbitrary background fetch proxy
reachable by the content script with user-supplied URL, method, headers, and body. Other high-risk
findings included unvalidated trust boundaries, unsafe HTML rendering, broad host access, automatic
shop updates without an exact review lock or result verification, false daily-success semantics,
duplicate-initialization risk, and unbounded/tight lifecycle behavior.

The repaired 7.8.0 release remains vanilla JavaScript and Manifest V3 but is now a modular, built
extension with one narrow host permission, fixed network destinations, strict validation, versioned
storage migration, safe DOM rendering, a complete popup/options/dashboard experience, deterministic
packaging, CI, 28 behavioral tests, and clean-profile Chrome evidence. Automatic pricing and
official daily item icons remain because the repository owner stated that the project has approval;
the implementation documents that this is project-specific and retains conservative controls.

No credentials, cookies, browser profiles, account data, HAR files, personal emails, private keys,
tokens, real pricing/purchase history, or existing Git history were found in the source import. The
target repository was empty, so a sanitized baseline was committed to `main` before repair work
began.

## Architecture

| Component         | Entry point                   | Role                                                                                                               | Network/storage                                                 |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Service worker    | `src/background.js`           | Fixed Shop Wizard lookup, confirmation tokens, rate state, apply lock, one-shot price update, verification handoff | Fixed `www.neopets.com` endpoints; local/session Chrome storage |
| Content bootstrap | `src/content/index.js`        | Idempotent isolated-world startup, storage synchronization, teardown                                               | Reads validated app data                                        |
| Dashboard         | `src/content/app.js`          | Dailies, progress, editing, panel lifecycle                                                                        | Local settings/state/history writes                             |
| Auto Pricing      | `src/content/auto-pricing.js` | Opt-in controls, scan, cancellation, calculation, review, confirmation, result reporting                           | Validated runtime messages only                                 |
| Shop parser       | `src/content/shop-parser.js`  | Account, shop-row, Wizard, and verification parsing                                                                | DOM/response validation only                                    |
| Popup             | `src/popup/`                  | Global state, page detection, dashboard/settings entry points                                                      | Local settings and active-tab metadata                          |
| Options           | `src/options/`                | Full settings, policy/privacy details, import/export/delete                                                        | Local storage; no external network                              |
| Shared modules    | `src/shared/`                 | Constants, validation, storage, network deadlines, safe DOM, operation schemas                                     | Trust-boundary enforcement                                      |
| Tooling           | `scripts/`                    | Build, package, static validation, secret scan                                                                     | Local filesystem only                                           |

The final manifest has one `storage` permission, one `https://www.neopets.com/*` host permission, a
module service worker, a top-frame `document_idle` isolated-world content script, a popup, an
options page, strict extension-page CSP, and `incognito: not_allowed`. It has no optional
permissions, web-accessible resources, external connection, side panel, DevTools page, offscreen
document, alarms, notification permission, remote code, OAuth, or update URL.

## Feature inventory

| Feature                       | Trigger and page                                         | Inputs/outputs                                   | Protection and test coverage                                                                                                                          | Risk   |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Daily navigation              | User clicks **Go** on any matched Neopets page           | Validated fixed/custom Neopets URL; opens a page | Navigation is separate from completion; URL/storage tests                                                                                             | Low    |
| Completion tracking           | User clicks explicit completion/reset                    | Daily ID, cooldown, local timestamp/count        | Bounded state/history; cooldown/date tests                                                                                                            | Low    |
| Daily/group management        | User opens **Manage** and confirms a dialog              | Name, URL, icon URL, cooldown, notes             | HTTPS/origin/length/schema validation; safe DOM                                                                                                       | Low    |
| Progress/history              | Dashboard tab                                            | Local validated state/history                    | Capped arrays and map/set lookups                                                                                                                     | Low    |
| Settings/import/export/delete | Popup/options user actions                               | Validated settings or ≤1 MB JSON                 | Schema sanitization and confirmation; migration/corruption tests                                                                                      | Medium |
| Price lookup                  | Explicit enabled scan on own shop stock page             | Valid account, item ID/name, fixed Wizard POST   | Sender/page/schema validation, 6–60 s spacing, timeout, abort, response bound, parser tests                                                           | High   |
| Price update                  | Explicit review, checkbox confirmation, dry-run disabled | Exact validated plan and token                   | Account/page/state/price/field validation, SHA-256 fingerprint, operation ID, cross-tab lock, one POST, no retry, exact verification, lock/plan tests | High   |

No auto-buy, purchase, bid, offer, item transfer, inventory mutation, scheduling, notification,
analytics, telemetry, injected page-world script, or externally callable API exists in the final
release.

## Findings and repairs

### Critical

| Finding                             | Affected baseline files           | Root cause                                                                                                                    | Repair                                                                                                                                                                                                                          | Validation                                                                                                                                          |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arbitrary authenticated fetch proxy | `background.js`, `modules/app.js` | The service worker accepted caller-controlled URLs, methods, headers, and bodies without a fixed allowlist or message schema. | Replaced with typed operations for one Wizard endpoint, one shop-update endpoint, and one verification page. Added sender extension/tab/page validation, bounded response reads, fixed headers, timeouts, and user-safe errors. | Manifest/static validator rejects generic proxy APIs; unit tests cover payloads/message data; clean-profile service worker loaded with zero errors. |

### High

| Finding                                                                                            | Affected baseline files           | Root cause                                                                                                                     | Repair                                                                                                                                                                                                                                                                                                               | Validation                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Consequential price changes lacked exact confirmation, cross-tab idempotency, and verified success | `modules/app.js`, `background.js` | Scan results were applied directly; there was no exact-plan binding, persistent lock, operation ID, or post-update comparison. | Retained approved Auto Pricing but made it off by default and dry-run by default. Added plan validation/fingerprint, per-run limits, review dialog, authorization checkbox, short-lived token, session lock, one-shot POST, no blind retry, follow-up fetch, exact per-item comparison, and redacted status history. | Plan/fingerprint/lock/parser tests; dry-run browser flow showed operation/account/items and reported “No prices were submitted.” |
| Unsafe HTML injection and untrusted DOM/API/storage values                                         | `modules/app.js`                  | Large interpolated `innerHTML` templates and permissive coercion crossed multiple trust boundaries.                            | Replaced with safe node creation and `textContent`; added bounded URL/name/account/item/field/price/settings/state/response validation and schema recovery.                                                                                                                                                          | Static unsafe-API scan; validation/storage/parser tests; 31/31 tests pass.                                                       |
| Broad host permission and remotely exposed module architecture                                     | `manifest.json`, `content.js`     | The extension matched every scheme and every Neopets subdomain and exposed its module as a web-accessible resource.            | Narrowed to HTTPS `www.neopets.com`, bundled the isolated-world content script, removed web-accessible resources, external connections, and arbitrary cross-origin fetch behavior.                                                                                                                                   | Manifest tests and production validator; unmatched-origin browser page had zero injected shells.                                 |
| Daily navigation could imply false completion                                                      | `modules/app.js`                  | A daily could be treated as successful before the destination action was confirmed.                                            | Separated **Go** navigation from explicit manual completion/reset controls and updated status language.                                                                                                                                                                                                              | Browser snapshot and daily-state tests.                                                                                          |

### Medium

| Finding                                                                | Affected baseline files             | Root cause                                                                                                                | Repair                                                                                                                                                                                                    | Validation                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate initialization, timers, and stale shared state               | `content.js`, `modules/app.js`      | Dynamic injection had no idempotent claim; a one-second interval lived indefinitely; saves replaced a shared data object. | Added per-frame initialization claim/release, deterministic teardown, cleared 30-second timer and resize observer, serialized snapshot writes, stable shared identity, and sanitized storage equivalence. | Lifecycle/save/equivalence tests; reload and multi-tab smoke each showed one shell; settings persisted through browser restart. |
| Missing timeout, abort, rate, response-size, and cancellation controls | `background.js`, `modules/app.js`   | Caller options were not enforced at the actual fetch boundary and retry/rate behavior was undefined.                      | Added 15/20-second deadlines, `AbortController`, cancellation, 2 MB response cap, global session lookup spacing, no blind update retry, bounded cancellation state, and explicit failure messages.        | Network timeout/abort and parser tests; synthetic HTTP 503 smoke produced two error rows and no review action.                  |
| Unvalidated/corrupt storage and no safe migration                      | `modules/app.js`                    | One legacy JSON blob was trusted and renamed behavior could have broken existing settings.                                | Added schema v2, strict sanitization, caps, corruption recovery, legacy-key migration, and migration marker. Legacy Auto Pricing always migrates disabled/dry-run.                                        | Storage migration, precedence, corruption, sanitization, and equivalence tests.                                                 |
| Incomplete controls and hidden-state CSS bug                           | `modules/app.js` and new pricing UI | Baseline had no complete options surface; first production UI CSS overrode native hidden behavior.                        | Added popup/options/privacy/data controls and explicit scoped hidden styles placed after display rules.                                                                                                   | Browser review caught and verified the repair; inactive Cancel/Review controls resolve to zero accessible elements.             |
| No reproducible build, validation, tests, CI, or release packaging     | Entire baseline                     | Source files doubled as an unpacked extension and had no project tooling.                                                 | Added npm lockfile, esbuild, Sharp icon generation, Prettier, Biome, Node tests, static validation, secret scan, ZIP packaging, and GitHub Actions.                                                       | `npm ci`, `npm run verify`, package and dependency-audit evidence.                                                              |

### Low

| Finding                                                        | Affected baseline files | Root cause                                                                                           | Repair                                                                                                                                                                                                          | Validation                                                                                 |
| -------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Old branding, abstract binary icon, and incomplete disclosures | All baseline files      | Product identity and repository materials were incomplete and inconsistent.                          | Rebranded to Neopian Assistant, added an original SVG/PNG extension mark, exact disclaimer, project-specific icon/automation approval disclosure, privacy/security/store docs, and synchronized 7.8.0 metadata. | Branding/version validator and repository searches.                                        |
| Limited accessibility and responsive behavior                  | `modules/app.js`        | The monolith lacked a complete semantic/options system and consistent focus/reduced-motion behavior. | Added semantic tabs/buttons/forms/dialogs/tables/status regions, labels, visible focus, disabled/running states, responsive layout, contrast-aware themes, and reduced-motion support.                          | Clean-profile snapshots; keyboard Tab reached **Save changes** with a solid focus outline. |

## Security review

- Repository and staged-content scans found no credential-shaped values, private local paths,
  sensitive filenames, real account data, cookies, tokens, profiles, logs, databases, HAR files, or
  screenshots with personal data.
- No prior local Git history existed, so there was no historical secret corpus to scan. The empty
  target remote also had no history.
- `eval`, `Function`, remote executable code, inline JavaScript, inline handlers, unsafe HTML APIs,
  `document.write`, external messaging, and web-accessible resources are absent from production
  output.
- All pricing messages validate type, sender extension ID, tab ID, exact own-shop page, feature
  enablement, account, IDs, names, fields, current/proposed prices, plan size, duplicates, token,
  fingerprint, lock, and operation state.
- Background memory is not authoritative: rate timestamps, locks, tokens, migration state, and
  redacted history live in Chrome storage and survive service-worker suspension as appropriate.

## Reliability and performance review

- Replaced one-second perpetual work with event-driven rendering and a cleared 30-second status
  tick.
- Added teardown for intervals, resize debounce timers, observers, content message listeners, and
  in-flight pricing work.
- Bounded groups (50), routines (500), completion history (100), operation history (20),
  cancellation IDs (100), shop rows (100), per-run price changes (25), price values, response size,
  and import size.
- Serialized local writes and normalized storage comparisons to eliminate stale controller state and
  tab resets during local saves.
- Search, group rendering, daily status, and progress now use arrays/sets/maps at bounded sizes;
  background lookups are deliberately sequential.

## UX and accessibility review

The final UI includes accurate disabled/running/success/warning/failure states, progress and
cancellation, safe empty states, separate navigation/completion, confirmation for
deletion/import/clear/update, responsive popup/options/dashboard surfaces, keyboard-operable
semantic controls, logical focus, visible focus outlines, labels and accessible names, polite status
regions, light/dark/system themes, and reduced-motion behavior. Technical stack traces and raw
response bodies are not shown to users.

## Privacy review

The extension reads only page/account/shop fields needed for the visible feature, stores validated
settings/routines/history plus redacted operation status locally, and transmits pricing data only to
fixed Neopets HTTPS endpoints after an explicit start. It has no analytics, telemetry, ads,
developer server, cookie access, or sensitive production logging. Exact retention and deletion
behavior is documented in [PRIVACY.md](PRIVACY.md).

## Policy review

Chrome policy risk was reduced through a narrow single purpose, minimized permission scope, clear
user-data disclosure, Manifest V3, locally packaged executable code, and no remote code. Primary
references are the
[Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies),
[user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
[Manifest V3 overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3),
[remote hosted code requirements](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code),
and
[permissions guidance](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).

Auto Pricing remains policy-sensitive because
[Neopets' Terms of Use](https://portal.neopets.com/terms) broadly restrict automation and Neopets
publishes a [Play Fair](https://portal.neopets.com/news/may7-neopian-task-force-play-fair) notice.
The owner states this project has specific approval for automated pricing and official item icons.
This was treated as project evidence, not general permission. The implementation provides explicit
opt-in, a master disable control, dry-run, conservative pacing, review, no blind retry, visible
operation state, and no evasion.

## Validation evidence

- `npm ci`: completed using the committed npm lockfile.
- `npm run verify`: formatting, Biome, 31/31 tests, build,
  Manifest/icon/file/CSP/branding/unsafe-API validation, and secret scan passed.
- `npm audit --audit-level=high`: see the final release-readiness record; no known dependency
  vulnerabilities at audit time.
- `npm run package`: creates `release/neopian-assistant-7.8.0.zip` from `dist/`.
- Clean-profile Chrome for Testing 151 loaded the unpacked `dist/` build and registered the module
  service worker.
- Browser smoke: popup, options, dashboard, official icons (31/31), service-worker restart, settings
  persistence, reload/idempotency, intended and unintended origins, multiple tabs, mocked successful
  dry-run pricing, HTTP 503 failure, offline popup startup, keyboard focus, exact
  branding/disclaimer, and zero page/service-worker console errors.
- Sanitized screenshots are in [docs/evidence](docs/evidence), with detailed results in
  [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## Remaining limitations and manual follow-up

1. **Live Neopets markup can change.** Risk: account/shop selectors may stop matching and safely
   abort. Action: re-run the fixture/parser suite and a manual dry-run after major site changes;
   update `src/content/shop-parser.js` only with bounded selectors and tests.
2. **No live consequential update was executed.** Risk: a site-side form change may only be observed
   on an authorized real review. Action: the repository owner should manually perform a one-item
   reviewed update within their approval, verify the exact result, and record sanitized evidence.
   Automated tests intentionally never submit a real price.
3. **Chrome Web Store submission was not part of this GitHub publication task.** Risk: listing
   disclosures/screenshots may need store-console adjustments. Action: review
   [STORE_LISTING.md](STORE_LISTING.md) and current policies before submission.
4. **GitHub private vulnerability reporting is disabled.** Risk: reporters lack a direct
   repository-native private intake button. Action: enable private vulnerability reporting in
   repository security settings.
5. **Project-specific approvals are not independently published in the repository.** Risk:
   downstream users cannot treat the owner's statement as their authorization. Action: retain the
   current disclosure and, if appropriate, add a sanitized written approval record without personal
   or confidential details.

No unresolved critical, high, or medium implementation defect found during this audit remains open.
