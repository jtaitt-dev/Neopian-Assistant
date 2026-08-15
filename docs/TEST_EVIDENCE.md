# Validation and Browser Evidence

Evidence date: 2026-08-15

Current production build: Neopian Assistant 7.11.0 (`dist/`)

Current release package: `release/neopian-assistant-7.11.0.zip`

## Automated validation

The current 7.11.0 build passed:

- Prettier formatting verification.
- Biome lint with no warnings.
- 78 Node behavioral tests, 78 passed, 0 failed, 0 skipped.
- `npm run test:coverage`: 67.64% aggregate line coverage, 76.60% branch coverage, and 75.42%
  function coverage; UI surfaces also require installed-browser validation.
- Syntax checking of every source JavaScript file.
- esbuild production build.
- Manifest V3, file-reference, icon-dimension/alpha, CSP-safe HTML, branding/version, unsafe-API,
  and production-surface validation.
- Repository secret scan with no credential-shaped values, sensitive filenames, or private local
  paths.
- `npm audit --audit-level=high` with 0 vulnerabilities.
- Deterministic 21-file release packaging: 90,623 bytes, SHA-256
  `C9D0989A54A457EA85C30A11E871B0878FB23B3C59069C26027F7450E773702B` on two consecutive runs.

The expanded suite covers price parsing/limits/verification, fresh shop state, partial-result
classification, purchase maximums/item/URL identity/visible price/fingerprint/duplicate window/
locks/response verification, 10-item SW Autobuy watchlist normalization/authorization/dynamic
rendering/parser behavior, sender/page validation, daily timezone resets, disabled-startup
reactivation, storage defaults/migration/corruption, timeouts/abort, Manifest references, branding,
and branch policy.

## Prior clean-profile installed-build evidence

The checked-in screenshots were produced with the 7.8.0 production architecture in Chrome for
Testing 151 using a disposable credential-free profile. The surfaces remain relevant to the shared
dashboard, popup, options, branding, icon, and Auto Pricing dry-run design; they do not constitute
installed-build evidence for the 7.10.0 SW Autobuy tab or monitor.

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

## Prior 7.9.0 installed-build evidence

After each user-performed unpacked-extension reload, authenticated Chrome validation confirmed:

- The production dashboard mounted exactly once on Shop Wizard, own-stock, and daily pages after
  navigation and reload.
- The dashboard settings button opened exactly one options page after its content-context defect was
  repaired. Browser policy prevents automating the privileged extension page itself.
- A dashboard preference persisted through a Neopets page reload and was restored to its original
  value.
- A manual daily completion persisted locally, reset correctly, and was restored. Daily navigation
  reached the intended Bank page without falsely marking the navigation-only task complete; reload
  preserved that incomplete state.
- A common low-value Shop Wizard result produced one validated pre-rename Auto Buy candidate below
  the unchanged 1,000 NP maximum. The complete enable/review/acknowledge/finish dry-run stayed on
  Shop Wizard, opened no purchase page, and submitted no purchase. The feature was restored to
  disabled with dry run enabled.
- The repaired settings route, purchase dry run, and daily flows kept exactly one dashboard root.
- Reloading the unpacked extension while an older content script remained on the page exposed one
  rejected storage promise with Chrome's `Extension context invalidated` error. The stale-context
  boundary now removes the disconnected dashboard, suppresses only that exact expected rejection,
  and leaves ordinary storage failures visible; a regression test covers both classifications.

Initial Auto Pricing scans exposed a fail-closed credential-context error: service-worker requests
did not receive authenticated Wizard results even with the endpoint's HTML AJAX headers. One-,
three-, five-, and full eight-row scans produced only explicit error rows and no review or mutation
action. After the bounded read-only fetch moved to the authenticated same-origin Neopets content
context, the live scan executed but revealed a second markup defect: the stock parser selected the
bold quantity cell as the item name. Live structural inspection established that the canonical name
is the first-cell item image's bounded `alt` value. The parser now prefers that label and restricts
the legacy bold fallback to the first cell; a live-layout regression fixture proves quantities
cannot become names. A subsequent full dry scan exposed a third first-party request mismatch: the
same-origin fetch used the own-stock page as its referrer, while Neopets' working AJAX flow
originates from `/shops/wizard.phtml`. The request now supplies that exact same-origin referrer and
a regression test fixes the contract. After the rebuilt extension was loaded, one live stock row
produced one validated suggestion, zero row errors, and exactly one review action. The
acknowledgement and **Finish dry run** flow completed with the explicit message that no prices were
submitted. Auto Pricing was then restored to disabled, dry-run enabled, 10 items, and an 8-second
interval; navigation confirmed those values persisted. The service worker still validates
sender/page/settings/plans, enforces the cross-tab rate, owns cancellation and lock state, binds
fresh-response fingerprints, and authors the exact update payload or purchase URL. Fixed same-origin
content clients transport only those authorized values and return bounded HTML for strict
verification. Prices are still extracted only from known Wizard elements.

The first authorized real-price attempt then exposed the same credential-context defect in the
service worker's final stock GET. The fresh-state gate stopped before submission, the exact original
price was re-read unchanged, and disabled/dry-run/10-item/8-second settings were restored. The
repair moves all authenticated stock reads and fixed mutation transport into bounded same-origin
clients while keeping sender/settings/plan/token/rate/lock/payload authority in the service worker.
It also corrects the update target to the live form's `/process_market.phtml` action. Four new
request-client tests cover fixed endpoints, credentials, referrers, worker-authored payload
validation, exact purchase URLs, and response-size rejection.

Two later action-time-authorized one-item attempts failed closed before POST with **Shop stock
changed after the scan**; a fresh scan confirmed the selected item's original 490 NP price remained
unchanged. Source tracing found that the one-item review still fingerprinted every stock row and the
worker-authored payload preserved excluded prices. That made unrelated rows part of both the fresh
gate and mutation. Plans, comparisons, and payloads now contain only explicitly selected changed
rows; excluded stock is never submitted. The review button also updates from three to one when rows
are deselected. Selected-only plan/payload, unrelated-stock freshness, and review-count regressions
raise the rebuilt suite. After the user reloaded the repaired build, an authenticated three-row dry
scan again selected the same low-value candidate at its unchanged 490 NP price. Deselecting the
other rows immediately changed **Review 3 price changes** to **Review 1 price change**; the dialog
contained only the selected 490 NP → 1 NP row, and the acknowledged dry run submitted no price.

A later read-only comparison isolated why that real review still failed before POST. An
authenticated programmatic GET returned HTTP 200 and account/form chrome but zero stock rows. A
normal hidden same-origin frame running Neopets' own page scripts hydrated eight rows and the exact
selected item. The repaired client therefore loads only the exact own-stock URL in a hidden frame,
polls for a complete paired-field form within a fixed deadline, caps the serialized result at 2 MB,
and removes the frame on every exit path. Three new client regressions prove hydrated success,
timeout cleanup, and oversized-page rejection; that suite reached 74 tests. A fresh installed
eight-row scan completed with eight validated suggestions, and deselecting seven left the exact
one-row review.

The next selected-only submission returned without changing the exact live row. The extension did
not retry it: a reload confirmed the original 490 NP remained in place. The live form requires an
exact row count plus `obj_id_N`/`oldcost_N`/`cost_N` triplets, while the first selected-only payload
had omitted the count and prior-price guard. The repaired builder reindexes selected rows
contiguously, includes the current price as `oldcost_N`, and the content client rejects incomplete,
duplicated, mismatched, or gapped payloads.

## Current 7.10.0 Auto Pricing mutation evidence

The user authorized the exact reversible low-value pair. The repaired production build then:

- Submitted only the selected row as a contiguous one-row payload with the exact prior-price guard.
- Reported **Verified 1 shop price change** for 490 NP → 1 NP.
- Reloaded own stock and independently read the exact row at 1 NP.
- Ran one new scan, recalculated only the restoration candidate, and submitted 1 NP → 490 NP.
- Reported exactly one verified restoration and independently read 490 NP after reload.
- Restored Auto Pricing to disabled, dry run enabled, undercut by 1,000 NP, floor 1, maximum 10, and
  an 8-second interval; all values persisted across another reload.

No unrelated shop row was submitted or changed. No account identity, balance, shop name, object ID,
raw HTML, authentication material, or screenshot was saved or committed.

## Current 7.10.0 SW Autobuy installed-build evidence

After the user reloaded the unpacked extension, authenticated same-origin validation confirmed:

- The dashboard mounted exactly once and displayed the exact **SW Autobuy** tab label.
- Disabled-by-default and dry-run defaults remained intact. The unchanged maximum was 1,000 NP and
  the default monitor interval was 8 seconds.
- Exactly 10 bounded names saved and persisted across a Neopets page reload.
- The monitor issued sequential authenticated Shop Wizard lookups and updated multiple validated
  results dynamically without invoking a purchase URL.
- A result above the 1,000 NP ceiling could not be reviewed. Selecting an eligible result stopped
  the monitor and opened an exact quantity-one review showing item, observed price, and maximum.
- The acknowledged dry-run completion explicitly reported that no purchase URL was followed. No
  purchase occurred.
- SW Autobuy was restored to disabled, dry run enabled, maximum 1,000 NP, interval 8 seconds, and an
  empty watchlist; a reload verified the restored state and one dashboard root.
- No Neopian Assistant console error occurred. Unrelated first-party page and other-extension
  messages were not attributed to this extension.

The review transition exposed one truthful-status defect: although polling stopped, the background
status still said monitoring was active while the dialog was open. The controller now announces the
stop before opening review. A final source trace also found that real-operation dialogs could be
dismissed while a request was in flight and that Auto Pricing did not own its dialog for teardown.
Both consequential dialogs now disable close/cancel controls and prevent Escape only while
executing; Auto Pricing owns one dialog and removes it during cleanup. Build-metadata coverage binds
the CI artifact name and release path to version 7.10.0. Pricing run IDs now use the same strict
UUID contract for lookup and cancellation; expired review/confirmation records are pruned before new
consequential reviews; and dashboard-owned dialogs are removed during extension cleanup.

After the final manual reload, the focused installed-build retest confirmed that opening an exact
dry-run review stopped monitoring first and displayed **SW Autobuy monitoring stopped. No purchase
was attempted.** behind the dialog. The quantity-one acknowledgement completed without following a
purchase URL. Starting the monitor and switching to another dashboard section cancelled it;
returning to SW Autobuy showed a non-running queued state. Disabled, dry run, the 1,000 NP maximum,
the 8-second interval, and an empty watchlist were then restored and verified after a page reload.
The dashboard still mounted exactly once and no Neopian Assistant console error or warning occurred.

## Current 7.11.0 daily-cooldown installed-build evidence

An ignored local PowerShell helper used Windows UI Automation to invoke the exact visible reload
control for the single **Neopian Assistant** card on Chrome's existing Extensions tab. It required
exactly one Chrome window, one Extensions tab, and one matching extension card, and verified the
loaded version as 7.11.0. It did not inspect Chrome profile data, extension storage, cookies, or
authentication material.

On the authenticated Anchor Management page, the no-spend site action was invoked once. The site
removed its claim control and displayed its own daily-limit/cooldown state without a CAPTCHA or
error. Only after that site-side verification, the dashboard's separate tracking control was clicked
once. The row changed to a disabled **Claimed · available in 10h 24m** state. A full page reload
preserved the claim and displayed **Claimed · available in 10h 23m**, demonstrating both storage
persistence and a live countdown to the next Neopian daily boundary. No account identity, balance,
reward details, token, raw page HTML, or screenshot was saved.

## Remaining installed-build gate

Chrome browser automation rejects direct DOM access to `chrome://extensions/` under its
privileged-URL security policy. The exact visible reload control was invoked through bounded Windows
UI Automation as described above; no CDP bypass or profile manipulation was used. The remaining
installed-build gates are:

- One low-value purchase with strict response verification plus duplicate/multi-tab behavior, only
  after action-time user confirmation.
- Popup/options internals remain a manual check because privileged `chrome-extension://` pages are
  blocked from browser automation.

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
