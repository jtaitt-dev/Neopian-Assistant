# Validation and Browser Evidence

Evidence date: 2026-07-18

Current production build: Neopian Assistant 7.9.0 (`dist/`)

Current release package: `release/neopian-assistant-7.9.0.zip`

## Automated validation

The current 7.9.0 build passed:

- Prettier formatting verification.
- Biome lint with no warnings.
- 45 Node behavioral tests, 45 passed, 0 failed, 0 skipped.
- `npm run test:coverage`: 65.33% aggregate line coverage, 78.39% branch coverage, and 74.03%
  function coverage; UI surfaces also require installed-browser validation.
- Syntax checking of every source JavaScript file.
- esbuild production build.
- Manifest V3, file-reference, icon-dimension/alpha, CSP-safe HTML, branding/version, unsafe-API,
  and production-surface validation.
- Repository secret scan with no credential-shaped values, sensitive filenames, or private local
  paths.
- `npm audit --audit-level=high` with 0 vulnerabilities.
- Deterministic 21-file release packaging.

The expanded suite covers price parsing/limits/verification, fresh shop state, partial-result
classification, purchase maximums/item/URL identity/visible price/fingerprint/duplicate window/
locks/response verification, sender/page validation, daily timezone resets, disabled-startup
reactivation, storage defaults/migration/corruption, timeouts/abort, Manifest references, branding,
and branch policy.

## Prior clean-profile installed-build evidence

The checked-in screenshots were produced with the 7.8.0 production architecture in Chrome for
Testing 151 using a disposable credential-free profile. The surfaces remain relevant to the shared
dashboard, popup, options, branding, icon, and Auto Pricing dry-run design; they do not constitute
installed-build evidence for the new 7.9.0 Auto Buy tab.

| Scenario                        | Evidence/result                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Install/manifest/service worker | Unpacked `dist/` loaded; `background.js` registered as the module service worker.                                  |
| Dashboard/intended origin       | One dashboard injected on a synthetic HTTPS `www.neopets.com` shop page.                                           |
| Unintended origin               | Synthetic `https://example.com/unmatched` had zero dashboard shells.                                               |
| Reload/idempotency              | Reload retained exactly one shell.                                                                                 |
| Multiple tabs                   | Two matched tabs each had one shell; unmatched tab had none.                                                       |
| Official item icons             | 31/31 production item icons loaded from `https://images.neopets.com/items/`.                                       |
| Popup/options                   | Both extension pages loaded with correct branding, tagline/disclaimer, privacy copy, and no console errors.        |
| Settings persistence            | Auto Pricing remained enabled in Chrome local storage and after a full browser close/reopen.                       |
| Auto Pricing dry run            | Two synthetic rows received mocked Wizard prices; exact review included account, items, range, and operation UUID. |
| No real update                  | Dry-run completion explicitly reported that no prices were submitted.                                              |
| HTTP failure                    | Mocked HTTP 503 produced error rows, clear failure status, and no review action.                                   |
| Offline                         | With network state offline, the packaged popup still rendered from local extension assets.                         |
| Keyboard/focus                  | Tab navigation reached **Save changes** with a solid visible focus outline.                                        |
| Console                         | Zero final errors/warnings across dashboard, popup, options, dry run, failure, reload, and multi-tab checks.       |

## Authenticated read-only Neopets evidence for 7.9.0

The currently signed-in Chrome account was used only for bounded, relevant, non-mutating checks. No
account identity, balance, shop name, listing owner, object ID, raw HTML, cookie, token, auth
header, or browser profile was saved.

Verified:

- Own shop stock uses one `process_market.phtml` POST and indexed `obj_id_N`, `oldcost_N`, and
  `cost_N` fields.
- The own shop front does not offer purchase links to its owner.
- Shop Wizard results use HTTPS `/browseshop.phtml` links with exactly `owner`, `buy_obj_info_id`,
  and `buy_cost_neopoints`.
- The visible listing price and URL price matched for the inspected common low-value result.
- The normalized live listing passed the 7.9.0 source validator and was below the default 1,000 NP
  ceiling.
- Live results clear the search input and preserve the item name in
  `#shopWizardFormResults .wizard-results-header h3`; the parser was repaired and a regression test
  added.

No purchase link or shop form was submitted.

## Current installed-build gate

Chrome automation rejected access to `chrome://extensions/` under its privileged-URL security
policy. No workaround, CDP bypass, profile manipulation, or alternate privileged surface was used.
The user must manually load/reload the exact current `dist/` directory before the following checks
can be truthfully completed:

- 7.9.0 extension card/version/icon and service-worker registration/restart.
- Current popup/options/dashboard branding and console state.
- Settings backup, persistence, and restoration.
- Dailies navigation/manual completion/reset.
- Auto Pricing live dry run, one-item controlled update, exact verification, and restoration.
- Auto Buy live dry run, maximum enforcement, duplicate/multi-tab behavior, and—only if entirely
  unambiguous—one low-value purchase with strict response/inventory verification.

## Visual comparison

The implementation follows the concepts in `docs/design/` with the original compass-spark extension
mark, navy/blue/teal visual system, bounded panels, status regions, semantic controls, responsive
popup/options/dashboard, and project-approved official daily images. Production density remains more
compact than the high-fidelity concepts for the default 390 px dashboard width.

## Sanitized screenshots

![Dailies dashboard smoke test](evidence/dashboard-smoke.png)

![Auto Pricing dry-run smoke test](evidence/auto-pricing-smoke.png)

![Popup smoke test](evidence/popup-smoke.png)

![Options smoke test](evidence/options-smoke.png)
