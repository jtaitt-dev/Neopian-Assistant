# Neopian Assistant Production Audit

Audit date: 2026-08-15

Audited release: 7.12.0

Manifest version: 3

Minimum Chrome version: 114

Baseline branch point: `6f8fec7`

Audit branch: `feature/neopian-assistant-audit-rebrand`

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

## Executive result

The complete source, production build, permissions, storage, runtime messaging, UI, dailies,
approved Auto Pricing, guarded SW Autobuy monitoring/purchase workflow, build pipeline, tests,
icons, and repository documentation were reviewed against the actual implementation.

This pass found and repaired four consequential-action defects that remained after the prior 7.8.0
hardening:

1. Auto Pricing had no fresh authenticated stock comparison immediately before its update POST.
2. Pricing rules could calculate and select zero, which may remove a shop item from sale.
3. A failed verification request after a submitted mutation was recorded as an ordinary failure even
   though the final state was unknown.
4. The requested auto-buy safety contract did not exist.

The pass also fixed permissive currency grouping, stale “anytime” completion marks in today's
progress, disabled-startup reactivation, a three-tab layout assumption, two real Shop Wizard
response differences, and dashboard settings buttons that called an API unavailable to content
scripts.

The 7.12.0 source suite extends the previously validated production build with dynamic daily claim
cooldowns, a bounded live SW Autobuy watchlist, and the new exact-Kauvara MS Autobuy monitor and
manual haggle handoff. Authenticated installed-build validation confirmed dailies navigation/manual
state, settings persistence, the repaired settings route, and a complete no-purchase SW Autobuy dry
run without exposing account identity. Initial Auto Pricing scans failed closed because
service-worker requests did not receive authenticated Wizard results. Moving the bounded read-only
fetch to the authenticated same-origin Neopets content context exposed a second live-markup defect:
own-stock parsing selected the bold quantity cell instead of the first-cell image label. The
repaired dry run then passed, while the first authorized real attempt stopped before submission
because its final worker-origin stock GET lacked the page session. The original price remained
unchanged. Bounded same-origin Wizard reads and exact worker-authorized mutation transports preserve
that authority boundary. Fresh own-stock validation now uses a short-lived hidden same-origin frame
because Neopets returns only an authenticated shell to programmatic GETs and hydrates stock rows
with its page scripts. The worker retains sender/page/settings/plan/rate/fingerprint/token/lock
authority. The live process endpoint is also corrected. The authenticated 7.10.0 SW Autobuy monitor,
ceiling, persistence, and no-purchase dry run passed after reload. Its review transition exposed a
truthful-status defect, and a final source trace found that in-flight consequential dialogs could be
dismissed before their requests settled. Those review-lifecycle defects and the hydrated-stock gate
are repaired in the current 78-test build. A focused installed-build retest confirmed truthful
monitor-stop status before review, no-purchase dry run completion, dashboard-tab cancellation,
restored settings after reload, single-root mounting, and no extension console error or warning. The
7.11.0 installed build also passed a real no-spend daily claim and dynamic cooldown persistence
check after an exact extension reload through bounded Windows UI Automation; no privileged-URL or
profile-access bypass was used. The installed 7.12.0 build then passed an authenticated Kauvara
exact-match dry run with no haggle navigation or purchase, persisted the temporary test
configuration, removed a discovered literal `null` presentation defect, and restored safe
disabled/empty defaults after reload.

## Scope and method

Reviewed files and surfaces included:

- Manifest, permissions, CSP, background service worker, message routes, storage, migrations, and
  network wrapper.
- Content initialization, teardown, timers, resize observer, dashboard, dailies, Kauvara parsing and
  MS Autobuy, shop parsing, Auto Pricing, and SW Autobuy.
- Popup, options, import/export/delete, operation history, CSS, keyboard/focus states, and branding.
- Build, validation, secret scanning, deterministic packaging, dependency lockfile, CI, branch
  policy, tests, editable SVG, generated icon references, and repository documentation.
- Authenticated live page structure for own shop stock, own shop front, Kauvara stock, and Shop
  Wizard results.

The review used direct source tracing, trust-boundary analysis, bounded live DOM inspection, Node
unit/integration tests, production bundling, static unsafe-API searches, secret scanning, dependency
audit, Manifest/icon/reference validation, and deterministic package generation.

## Accurate feature inventory

| Feature              | Enable/trigger                                    | Page and DOM                                                                    | Requests and storage                                                                       | Success, duplicate behavior, mutation, tests                                                                                                         |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard            | Global setting; content script at `document_idle` | Top frame of `https://www.neopets.com/*`; appends one `#neopian-assistant-root` | Reads/writes sanitized app data                                                            | Symbol claim prevents duplicate initialization; settings listener supports later enablement; lifecycle/save tests                                    |
| Popup                | Toolbar action                                    | Extension popup; reads active-tab URL only                                      | Reads/saves app data; no remote request                                                    | Reports current page/feature availability; Manifest and browser smoke coverage                                                                       |
| Options              | User opens Settings                               | Extension page; labeled controls and confirmed dialogs                          | Local app data, redacted price/purchase histories; export/import/clear                     | Save only after sanitization; ≤1 MB import; clear confirmation; storage tests                                                                        |
| Dailies navigation   | Dailies enabled; user selects **Go**              | Validated `www.neopets.com` daily URL                                           | Browser navigation only                                                                    | Never marks completion; no account mutation; URL/daily/browser coverage                                                                              |
| Daily completion     | User presses separate check control               | Local dashboard row                                                             | App state/history only                                                                     | Explicit manual mark/reset; LA day, monthly, count, and timer rules; daily tests                                                                     |
| Price lookup         | Auto Pricing enabled; user starts scan            | Exact own-stock page; reads visible account and indexed shop form               | Fixed Wizard POST; session lookup rate; app settings                                       | Sequential 6–60 s spacing, cancellation, timeout, bounded response; lookup/parser/network tests                                                      |
| Price review/dry run | User reviews selected suggestions                 | Dashboard table/dialog                                                          | No mutation in dry run                                                                     | Exact rows and 1–999,999 NP prices; explicit checkbox; plan/price tests                                                                              |
| Price update         | Dry run off; user confirms                        | Exact own-stock page plus bounded, script-hydrated same-origin stock snapshot   | One fixed shop POST, verification snapshot, session review/token/lock, redacted history    | Fresh account/row/ID/name/field/current-price match, SHA-256 plan/response binding, no retry, exact verification; hydration/stale/lock/partial tests |
| MS Autobuy monitor   | MS Autobuy enabled; user starts saved watchlist   | Exact Kauvara shop; up to 10 persisted exact names                              | Sequential fixed Kauvara GETs; shared session lookup rate                                  | UUID/watchlist/settings binding, 8–60 s pacing, cancellation, bounded response, exact visible/data identity/price/stock/URL tests                    |
| MS Autobuy handoff   | Dry run off; user confirms one current listing    | Exact Kauvara shop and validated `haggle.phtml` URL                             | Fresh fixed stock GET, session review/lock, hashed local handoff history                   | Ceiling, positive stock, exact fresh identity/URL, duplicate window, one navigation; offer and human verification remain manual                      |
| SW Autobuy monitor   | SW Autobuy enabled; user starts saved watchlist   | Exact Wizard page; up to 10 persisted exact names                               | Sequential fixed Wizard POSTs; shared session lookup rate                                  | UUID/name/settings binding, 6–60 s pacing, cancellation, bounded response, dynamic validated results; watchlist/controller/parser tests              |
| SW Autobuy dry run   | User reviews one monitored or current-page result | Exact Wizard page; reads results heading, listing link, visible price           | No purchase request                                                                        | Quantity one and hard maximum shown; no URL followed; settings/validation/parser tests                                                               |
| SW Autobuy real      | Dry run off; user confirms one listing            | Exact Wizard page and validated `browseshop.phtml` URL                          | Fresh fixed Wizard POST, one purchase GET, session review/token/lock, hashed local history | Exact item/owner/object/visible+URL price, allowed query keys, ceiling, 24 h dedup, no retry, strict response verification; purchase tests           |
| Icons                | Build and runtime image load                      | Original extension mark; approved official daily images                         | Generated local PNGs; ordinary `images.neopets.com` image requests                         | Sharp validates dimensions/alpha; browser evidence checks image loading                                                                              |

No alarm scheduling, Chrome notifications, bidding, offers, trading, donating, discarding, item
transfer, CAPTCHA handling, page-world injection, external messaging, telemetry, analytics, remote
executable code, or developer server exists.

## Findings, root causes, and repairs

### Critical baseline finding retained as repaired

| Finding                                                      | Root cause                                                                                 | Repair and evidence                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arbitrary authenticated fetch proxy in the imported baseline | Caller-controlled URL, method, headers, and body crossed into the signed-in service worker | Replaced in 7.8.0 with typed fixed-endpoint operations. 7.9.0 re-review confirms no generic proxy, external connection, broad host permission, or caller-controlled header/method surface. Message, Manifest, static, and production validation pass. |

### High

| Finding                                                   | Root cause                                                                                                                                                                           | Repair                                                                                                                                                                                                                                                                                                                                                                       | Validation                                                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Price plan could become stale before POST                 | The page was parsed once; worker GETs lacked page-session behavior, and authenticated content-context GETs returned a shell whose stock rows are added later by first-party scripts  | A hidden exact-origin stock frame waits for a bounded paired-field form, serializes it only after hydration, removes itself on success/error/timeout, then performs the exact account/row/ID/name/field/price comparison. The worker still validates sender/settings/plan and binds the snapshot fingerprint before issuing a short-lived token and worker-authored payload. | Live shell-vs-hydrated-frame comparison; fresh-state and client tests cover success, timeout cleanup, oversized pages, rebinding, and ambiguity.                                                                         |
| One selected price included every shop row                | The review plan, fresh-state comparison, and worker-authored POST retained excluded stock rows, so unrelated differences blocked one-item updates and could rewrite untouched prices | Plans and fresh checks now bind only selected changed rows. The mutation reindexes those rows contiguously and submits only their exact object ID, prior-price guard, and proposed price with the selected row count. Excluded stock is never submitted.                                                                                                                     | Two authorized live attempts reproduced the pre-submit failure without mutation; selected-only plan, fresh-state, payload, and review-count regressions.                                                                 |
| Selected-only POST was accepted as a no-op                | The first selected-only payload omitted the live form's `lim` row count and `oldcost_N` prior-price fields, so Neopets returned normally without applying the reviewed price         | Hydrated stock is accepted only with complete object/prior/current field triplets. The worker-authored payload reindexes selected rows from one, includes the exact selected count and current-price guard, and the content client rejects missing, duplicate, mismatched, gapped, or out-of-range fields.                                                                   | The first submission left the exact row at 490 NP and was not retried blindly. Regression tests cover the contract; the repaired 490 NP → 1 NP update and 1 NP → 490 NP restoration both passed exact live verification. |
| Consequential post-submit ambiguity mislabeled as failure | The catch path always wrote `failed`, even when the POST may have succeeded and only verification failed                                                                             | Both price and purchase operations track whether the mutation request started. Any later error records `uncertain`, releases short-lived state, warns against retry, and requires manual inspection.                                                                                                                                                                         | Mutation-classification tests; UI/status source review.                                                                                                                                                                  |
| Auto-buy contract absent                                  | The prior release intentionally had no purchase code despite the production objective requiring guarded behavior and coverage                                                        | Added an independent disabled/dry-run default, one-item-only workflow with exact candidate schema, hard ceiling, fresh Wizard recheck, response hash, short token, global lock, one-way 24-hour duplicate key, one request, no retry, and strict response verification.                                                                                                      | Maximum, schema, URL, visible price, dedup, lock, stale, response, settings, sender/page tests plus authenticated read-only live contract validation.                                                                    |

### Medium

| Finding                                                          | Root cause                                                                                                                            | Repair                                                                                                                                                                                                                  | Validation                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Auto Pricing could select 0 NP                                   | Default floor and UI minimum were zero; undercut clamped at zero                                                                      | Default/migrated floor is at least 1; calculation and selected-plan validation independently require 1–999,999 NP. Current unsold rows may still be read as zero but cannot be submitted as a selected zero sale price. | Calculation, settings, plan, and shop-row tests.                                               |
| Currency parser accepted malformed grouping                      | It removed every comma and whitespace before digit validation                                                                         | Parser accepts plain digits or correctly grouped commas plus optional surrounding whitespace/`NP`; rejects `1,2,3`, `1 234`, decimals, negatives, empty, and >999,999.                                                  | Expanded currency and Wizard parser tests.                                                     |
| Real Wizard clears search input after results                    | Initial parser assumed `#shopwizard.value` retained the item name                                                                     | Candidate extraction now falls back to `#shopWizardFormResults .wizard-results-header h3`, the live results contract.                                                                                                   | Authenticated read-only discovery and regression test for results-only markup.                 |
| Own-stock parser selected the quantity as the item name          | The fallback `td:first-child b, b` selector escaped the first cell and matched the live bold quantity cell                            | Item identity now prefers the first-cell image's bounded `alt` label and permits a legacy bold/strong fallback only inside that same first cell.                                                                        | Authenticated live five-column structure inspection and regression fixture.                    |
| Shop update targeted the stock-display route                     | The inherited fixed URL used `/market.phtml` even though the live form action is `/process_market.phtml`                              | The fixed same-origin mutation client now targets only the exact live process action and rejects malformed worker payloads before transport.                                                                            | Authenticated form inspection plus fixed-endpoint/payload client tests.                        |
| “Anytime” marks persisted in today's progress forever            | Manual cooldown returned no reset period                                                                                              | Manual/anytime tracking now resets at the Neopian `America/Los_Angeles` date boundary.                                                                                                                                  | Cross-day daily-state test.                                                                    |
| Enabling after disabled startup required reload                  | Initialization returned before registering storage/runtime/pagehide listeners                                                         | Listener setup now occurs even when the first loaded setting is disabled; later settings changes can mount the app.                                                                                                     | Disabled-startup integration test.                                                             |
| Schema upgrade was not written back for an existing valid record | `loadAppData` only persisted missing or legacy records, so schema 2 sanitized to schema 3 in memory on every load                     | Canonical schema/version/sanitization differences are persisted once; later equivalent loads are no-ops.                                                                                                                | Storage write-decision tests cover current, old-schema, repaired, and missing records.         |
| Unpacked reload left disconnected content UI on the page         | Chrome invalidated the old content-script APIs before the page itself reloaded; local dialogs were mounted outside the dashboard root | The save boundary recognizes only Chrome's exact invalid-context failure, removes the stale dashboard and every owned dialog, absorbs that expected rejection, and continues to surface ordinary storage failures.      | Authenticated reload capture plus invalid-context, dialog-cleanup, and ordinary-failure tests. |
| In-flight consequential review could be visually dismissed       | Dialog close controls and Escape remained active after a real request started; Auto Pricing did not retain its dialog for teardown    | Both pricing and purchase reviews lock close/cancel/Escape only while executing, preserve safe pre-submit cancellation, keep uncertain outcomes non-retryable, and remove owned dialogs during cleanup.                 | Purchase in-flight dismissal and Auto Pricing single-dialog/cleanup regressions.               |
| CI release artifact still targeted 7.8.0                         | Workflow artifact name and archive path were hard-coded and missed both later version updates                                         | CI now uploads `dist/` with the exact 7.10.0 release archive; a regression binds both workflow paths to the manifest/package version.                                                                                   | Manifest/build-metadata test plus local package inspection.                                    |
| Pricing run messages accepted non-UUID identifiers               | Lookup and cancellation schemas allowed any short string while the controller always generated UUIDs                                  | Both routes now require canonical UUIDs, matching consequential operation and SW Autobuy monitor identifiers.                                                                                                           | Pricing lookup schema regression plus route source trace.                                      |
| Expired review tokens accumulated in session storage             | Expiry was checked on use but failed pre-submit reviews were not removed                                                              | Before each new pricing or purchase review, expired/malformed review and confirmation keys are removed while active and unrelated state is preserved.                                                                   | Runtime-state pruning regression.                                                              |
| Fresh purchase check depended on one rotating Wizard section     | A valid exact listing may be absent from any single Shop Wizard response because results rotate across eight market sections          | Fresh validation now checks at most eight independently rate-authorized sections. Exact identity/price changes abort immediately; all-section misses fail closed; the purchase URL is still followed at most once.      | Eight-section success/miss controller tests and changed-listing parser tests.                  |
| Completed daily could erase its own cooldown                     | Pressing the completed check a second time immediately cleared state and history                                                      | Claimed controls remain disabled until their daily, monthly, per-day, or elapsed cooldown expires; guarded claim handling rejects duplicate clicks.                                                                     | Claim idempotency, per-day count, reset-boundary, and daylight-saving tests.                   |

### Low / UX

| Finding                           | Root cause                                  | Repair                                                                                                                           | Validation                                                        |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Dashboard grid assumed three tabs | CSS used `repeat(3, 1fr)`                   | Updated to four equal tabs, with the purchase feature now labeled SW Autobuy.                                                    | Production build/static review and installed 7.10.0 visual check. |
| Documentation contradicted source | 7.8.0 docs said 28/31 tests and no auto-buy | README, privacy, security, changelog, audit, contribution, store, evidence, and PR materials updated for actual 7.10.0 behavior. | Version/branding/search/format validation.                        |

## Dedicated Auto Pricing trace

1. **Discovery:** `extractShopRows` accepts only the exact process-market form with numeric object
   IDs, indexed `obj_id_N`/`cost_N` fields, bounded names, and parsed current prices.
2. **Price source:** the isolated content client posts exact item names only to the fixed Neopets
   Wizard AJAX endpoint using the signed-in same-origin page session; the worker rate-authorizes
   every lookup first.
3. **Parsing:** bounded response HTML is parsed in the isolated content script; positive visible
   prices are normalized, deduplicated, and sorted.
4. **Rules:** match, undercut, or overcut use bounded adjustment, floor ≥1, and maximum 999,999.
5. **Pacing/cancellation:** lookups are globally serialized, session-rate-limited, abortable, and
   deadline bounded; cancellation IDs are capped.
6. **Review:** only changed, explicitly included rows up to the configured run maximum are shown in
   an exact dialog. Dry run stops here.
7. **Fresh gate:** a new authenticated stock GET must exactly match the account and every selected
   row's ID, name, fields, and current price. Unrelated stock does not enter the plan.
8. **Confirmation/locking:** SHA-256 plan and response fingerprints, tab binding, operation UUID,
   30-second token, and session-backed cross-tab lock are all required.
9. **Submission:** after worker authorization and lock acquisition, one fixed same-origin POST uses
   the worker-authored payload and live `/process_market.phtml` action. Only selected changed rows
   are submitted; excluded rows are untouched. There is no automatic retry.
10. **Verification:** a new stock GET must show every selected ID at the proposed price. Mismatch is
    not success; ambiguous submitted failures are `uncertain`.
11. **History/logging:** up to 20 redacted records contain only operation ID, timestamp, count, and
    status. Production warnings are generic and contain no account or plan data.

## Dedicated SW Autobuy trace

1. **Watchlist:** storage sanitization retains at most 10 bounded, non-empty, case-insensitively
   unique names. Each lookup message must carry a UUID and match a saved name.
2. **Monitor boundary:** monitoring runs only on the exact Shop Wizard page while its dashboard tab
   remains open. Requests are sequential, share the global 6–60 second lookup spacing, have a
   15-second deadline and 2 MB cap, and stop on authorization mismatch, explicit stop, tab switch,
   navigation, or teardown. Monitoring never invokes the purchase endpoint.
3. **Candidate:** the live result item name, owner, object ID, visible price, URL price, HTTPS
   origin, `/browseshop.phtml` path, and exact three allowed query keys must validate.
4. **Quantity and ceiling:** quantity is hard-coded to one; no quantity parameter is accepted; price
   must be positive and no higher than the sanitized configured maximum.
5. **Dry run:** the default flow presents the exact item/price/maximum and follows no purchase URL.
6. **Fresh gate:** at most eight independently worker-authorized and globally paced exact Wizard
   reads cover the rotating market sections. The same listing must reappear with the same item,
   owner, object ID, price, and canonical URL. A changed identity/price aborts immediately; a miss
   across all eight sections fails closed.
7. **Confirmation/locking:** a response fingerprint, candidate fingerprint, tab/page binding,
   operation UUID, 30-second token, and global purchase lock are required.
8. **Duplicate prevention:** running, pending-verification, verified, or uncertain fingerprints
   block the same listing for 24 hours. Only the one-way hash and redacted operation status persist.
9. **Mutation:** after worker authorization and lock acquisition, the exact validated URL is
   requested once by the fixed same-origin client with credentials and a 20-second deadline. There
   is no retry.
10. **Verification:** returned bounded HTML must contain the expected item identity and unambiguous
    success language without known failure language. Otherwise status is `uncertain` and inventory
    must be checked manually.

## Dailies audit

- Navigation and claim tracking remain deliberately separate; **Go** never marks success.
- All default/custom URLs are HTTPS `www.neopets.com`; official image URLs require exact
  `https://images.neopets.com` origin.
- Daily/count/manual state uses the Neopian LA date boundary; monthly state counts down to the next
  month; timers compare the last claim timestamp and elapsed duration. Daily and monthly reset
  timestamps are calculated across daylight-saving transitions.
- Local claims are explicit, bounded, and idempotent while unavailable. Multiple tabs converge
  through sanitized storage-change handling rather than sending account mutations.
- No daily destination action is automated or falsely verified. Layout changes at destination pages
  therefore cannot create a false claim; the user remains responsible for marking a successful claim
  with the separate check control.

## Security, privacy, and permission review

- Manifest permissions remain `storage` plus one host permission, `https://www.neopets.com/*`;
  incognito is denied.
- No optional permissions, cookies/history/password APIs, alarms, notifications, external messages,
  web-accessible resources, page-world scripts, inline scripts/handlers, unsafe HTML APIs, dynamic
  code execution, or remote logic exists.
- Runtime sender validation binds this extension ID, an integer tab, and the exact own-stock or
  Wizard page before feature routing.
- Storage, DOM, URL, message, settings, network response, operation, and import boundaries are
  bounded and fail closed.
- Response bodies, account identity, owners, item identity, prices, headers, and credentials are not
  logged or stored in redacted operation history.
- The production secret scan and manual searches found no credential-shaped values, private browser
  data, account artifacts, HAR files, local backup, or hard-coded personal identity in tracked
  files.

## Reliability, performance, UX, and accessibility

- Service-worker session/local storage is authoritative for rates, tokens, locks, and duplicate
  state; in-memory queues only serialize work while the worker is alive.
- Writes are serialized; settings and imported/corrupt data sanitize to schema v5 safe defaults.
- Timers, resize debounce, observer, listeners, and active price scans are cleaned up.
- The only repeating content timer is a cleared 30-second visible-status refresh; lookups are
  sequential by design.
- Groups, routines, state, history, rows, price changes, cancellations, responses, import size,
  operation history, and purchase history are capped.
- Semantic tabs, headings, tables, dialogs, buttons, labels, progress, live regions,
  disabled/running states, focus outlines, responsive layouts, themes, and reduced-motion behavior
  are present.
- Technical failures are translated into actionable user messages; submitted ambiguity is never
  presented as success or a retry instruction.

## Automated validation evidence

- `npm audit --audit-level=high`: 0 vulnerabilities.
- All source JavaScript: `node --check` passed.
- `npm run verify`: formatting, Biome, Node tests, production build, Manifest/file/icon/CSP/API
  validation, and secret scan passed.
- `npm test`: 92 passed, 0 failed, 0 skipped.
- `npm run test:coverage`: 71.14% lines, 76.17% branches, and 75.65% functions.
- `npm run package`: deterministically creates the 21-file, 95,993-byte
  `release/neopian-assistant-7.12.0.zip` (SHA-256
  `647CCDDC8B31213ABF0AEF2010D176595219BA70EFE929FABD581BD639A10AE3`).
- Manifest validator confirmed 11 referenced files, generated icon dimensions/alpha, narrow
  permissions, CSP-safe HTML, no unsafe production API, consistent branding, and synchronized
  version.
- Detailed synthetic browser evidence and final test counts are maintained in
  [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## Authenticated live-account evidence

Completed without mutation or sensitive capture:

- Confirmed the signed-in own-stock page exposes one `process_market.phtml` POST with indexed
  `obj_id_N`, `oldcost_N`, and `cost_N` fields and an own-shop front link.
- Confirmed own-shop front does not expose purchase links to the owner.
- Ran one ordinary Shop Wizard search for a common low-value item.
- Confirmed each result purchase link uses exactly `owner`, `buy_obj_info_id`, and
  `buy_cost_neopoints` on HTTPS `www.neopets.com/browseshop.phtml`.
- Confirmed the source validator accepts the normalized live candidate, the visible and URL prices
  match, and the observed result is below the default 1,000 NP ceiling.
- Detected and repaired the cleared-input/results-heading item-name difference.
- Verified exactly one dashboard root after reload and daily navigation.
- Marked and reset one manual daily locally, restored its original state, navigated to the intended
  daily page, and confirmed navigation did not falsely complete the task.
- Invoked one no-spend Anchor Management daily action after validating the exact page-owned control.
  The site removed the action and displayed its own daily-limit/cooldown state without a CAPTCHA or
  error. The dashboard then recorded the verified claim, disabled its tracking control, displayed
  **Claimed · available in 10h 24m**, and preserved the claim after reload while advancing the live
  countdown to **10h 23m**.
- Verified the repaired dashboard settings route opened exactly one options page. A dashboard
  preference persisted across reload and was restored.
- Reloaded the current 7.10.0 SW Autobuy build and verified its exact renamed tab, disabled/dry-run
  defaults, bounded 10-name persistence, sequential authenticated monitoring, multiple dynamic
  validated results, above-ceiling review blocking, quantity-one exact review, and explicit dry-run
  no-purchase result. The watchlist and settings were restored and verified after reload with one
  dashboard root and no Neopian Assistant console errors.
- That review exposed a truthful-status defect: polling stopped correctly, but the background status
  still described the monitor as active while the dialog was open. The repaired transition now
  announces the stop before review. The final review also locked dismissal during in-flight pricing
  and purchase requests and made Auto Pricing own/clean up its dialog. These lifecycle repairs have
  regression coverage and their installed check passed after reload.
- Ran one-, three-, five-, and full eight-row Auto Pricing scans. All service-worker lookups failed
  closed with explicit error rows, no review, and no mutation; this isolated the authenticated
  request-context defect. After moving only the read-only fetch to the same-origin content context,
  a one-item live scan executed and exposed the separate quantity-as-name selector defect. The
  repaired parser now uses the first-cell image label, backed by a live-layout regression fixture.
  The bounded same-origin client is shared with SW Autobuy's monitor and fresh-listing checks, while
  the service worker retains sender/settings/plan/rate/token/lock/payload authorization.
- Compared the failed content request with Neopets' working AJAX handler and isolated its official
  `/shops/wizard.phtml` same-origin referrer contract. After aligning that bounded read-only request
  and reloading `dist/`, one live stock row produced one validated suggestion, zero errors, and one
  exact review. The acknowledged dry run finished with no price submission, and disabled/dry-run/
  10-item/8-second settings were restored and verified after navigation.
- The first authorized real-price attempt stopped before POST when the extension-origin worker's
  fresh-stock GET lacked the signed-in page context. Later content-context GETs were authenticated
  but returned a stock-page shell with zero rows; a normal same-origin frame hydrated eight rows.
  The bounded frame loader now waits for complete object/prior/current-price triplets, enforces the
  2 MB cap and timeout, removes itself deterministically, and feeds the unchanged strict parser. The
  price endpoint remains the exact live `/process_market.phtml` form action.
- Two later authorized attempts exposed that excluded rows still entered a one-item plan and failed
  the fresh gate before POST; the selected price remained 490 NP. The selected-only repair was
  rebuilt and reloaded. A three-row dry scan changed its review action from three to one as the two
  unrelated rows were deselected, and its dialog contained only the 490 NP → 1 NP row. Finishing the
  dry run submitted no price.
- A read-only network/DOM comparison then proved that authenticated programmatic stock GETs return
  only a page shell: HTTP 200, account and form chrome, but zero paired rows. A normal hidden
  same-origin frame running Neopets' page scripts hydrated all eight stock rows. The repaired frame
  loader and cleanup/size regressions entered the earlier 74-test build. Its installed eight-row
  scan completed with eight validated suggestions; excluding seven produced the exact one-row
  review.
- The user authorized a reversible low-value 490 NP → 1 NP → 490 NP validation. The initial
  selected-only POST returned without the extension's success marker, so the exact row was reloaded
  before any retry and remained 490 NP. Live form tracing isolated the missing `lim` and `oldcost_N`
  contract. The repaired payload reindexed the selected row from one, included the row count and 490
  NP prior-price guard, and then reported exactly one verified price change. Reloading the stock
  page independently showed 1 NP. A fresh scan prepared only the inverse 1 NP → 490 NP restoration;
  the one-shot POST again verified exactly one change, and a final reload showed 490 NP. Auto
  Pricing was restored to disabled, dry run enabled, undercut by 1,000 NP, floor 1, maximum 10, and
  an 8-second interval; a reload verified every value persisted.
- Reloaded the 7.12.0 build and validated MS Autobuy on the exact Kauvara page. One current
  low-value in-stock card passed the strict visible/data name and price, positive-stock, and exact
  haggle-URL contract. A temporary one-name watchlist persisted across reload, the worker-authorized
  monitor stopped on the exact match, and the acknowledged dry run stayed on Kauvara with an
  unchanged tab count and the explicit result that no haggle page opened. The check exposed a
  literal `null` UI artifact from an absent notice; the conditional rendering and regression test
  were repaired, rebuilt, reloaded, and verified. MS Autobuy was restored to disabled, dry run
  enabled, a 10,000 NP maximum, a 10-second interval, and an empty watchlist; reload confirmed those
  values and one dashboard root. No offer, CAPTCHA/human-verification interaction, or purchase was
  attempted.

No username, balance, shop name, third-party owner, object ID, raw page HTML, cookie, token, auth
header, browser profile, or account screenshot was saved or committed. Only the controlled one-item
shop price update and its restoration were submitted; no purchase URL was followed.

Early `dist/` builds were manually reloaded because Chrome browser automation correctly rejects
direct DOM access to `chrome://extensions/`. Computer Use later invoked the visible extension reload
control at the user's explicit request; the newly repaired monitor behavior proved that build
active. For 7.12.0, an ignored local PowerShell helper used bounded Windows UI Automation and
required exactly one Chrome window, one Extensions tab, and one exact **Neopian Assistant** card
before invoking its reload control and verifying version 7.12.0. It did not inspect Chrome profile
data, storage, cookies, or authentication material. No privileged-URL bypass or profile manipulation
was used.

## Remaining limitations and required follow-up

1. **The controlled SW Autobuy purchase remains action-time gated.** The one-item pricing mutation
   and exact restoration passed with safe settings restored. A single low-value SW purchase remains
   limited to unambiguous identity, price, and response checks, with confirmation immediately before
   the purchase. MS Autobuy intentionally has no automatic final purchase: offer entry and human
   verification remain manual on Neopets' haggle page.
2. **Live markup can change.** Parsers fail closed, but maintainers must update bounded selectors
   and fixtures after verified site changes.
3. **Purchase response wording is intentionally strict.** Unknown success wording produces
   `uncertain`, requiring manual inventory inspection; it is never broadened based on guesswork.
4. **Network ambiguity cannot be eliminated.** A transport failure after submission may leave remote
   state changed. The extension blocks blind retry and tells the user to inspect state.
5. **Policy authorization is deployment-specific.** The owner states project approval for Auto
   Pricing and official icons; MS Autobuy and SW Autobuy remain especially sensitive and must not be
   enabled without applicable authorization. Neopets' current terms broadly prohibit unauthorized
   automation.
6. **Chrome Web Store review is outside this repository task.** Store disclosures and policy fit
   must be reviewed again at submission time.
7. **GitHub private vulnerability reporting remains disabled.** Enable it in repository security
   settings to provide a direct private intake.

No unresolved source-level critical, high, or medium defect identified by this audit remains open.
The action-time-gated purchase above remains a release gate, not a claim of completion.
