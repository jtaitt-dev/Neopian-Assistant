# Neopian Assistant Production Audit

Audit date: 2026-07-18

Audited release: 7.9.0

Manifest version: 3

Minimum Chrome version: 114

Baseline branch point: `6f8fec7`

Audit branch: `feature/neopian-assistant-audit-rebrand`

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

## Executive result

The complete source, production build, permissions, storage, runtime messaging, UI, dailies,
approved Auto Pricing, new guarded Auto Buy workflow, build pipeline, tests, icons, and repository
documentation were reviewed against the actual implementation.

This pass found and repaired four consequential-action defects that remained after the prior 7.8.0
hardening:

1. Auto Pricing had no fresh authenticated stock comparison immediately before its update POST.
2. Pricing rules could calculate and select zero, which may remove a shop item from sale.
3. A failed verification request after a submitted mutation was recorded as an ordinary failure even
   though the final state was unknown.
4. The requested auto-buy safety contract did not exist.

The pass also fixed permissive currency grouping, stale “anytime” completion marks in today's
progress, disabled-startup reactivation, a three-tab layout assumption, and a real Shop Wizard
markup difference discovered during authenticated read-only validation.

The 7.9.0 production build passes the automated verification and packaging gates. Authenticated
read-only Neopets validation confirmed the live own-shop and Shop Wizard contracts without exposing
the account identity or following a purchase URL. Full installed-build dry-run/mutation validation
remains pending until the user reloads `dist/` on `chrome://extensions/`; browser automation is
blocked from that privileged URL and no bypass was attempted.

## Scope and method

Reviewed files and surfaces included:

- Manifest, permissions, CSP, background service worker, message routes, storage, migrations, and
  network wrapper.
- Content initialization, teardown, timers, resize observer, dashboard, dailies, progress, shop
  parsing, Auto Pricing, and Auto Buy.
- Popup, options, import/export/delete, operation history, CSS, keyboard/focus states, and branding.
- Build, validation, secret scanning, deterministic packaging, dependency lockfile, CI, branch
  policy, tests, editable SVG, generated icon references, and repository documentation.
- Authenticated live page structure for own shop stock, own shop front, and Shop Wizard results.

The review used direct source tracing, trust-boundary analysis, bounded live DOM inspection, Node
unit/integration tests, production bundling, static unsafe-API searches, secret scanning, dependency
audit, Manifest/icon/reference validation, and deterministic package generation.

## Accurate feature inventory

| Feature              | Enable/trigger                                    | Page and DOM                                                                    | Requests and storage                                                                       | Success, duplicate behavior, mutation, tests                                                                                               |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard            | Global setting; content script at `document_idle` | Top frame of `https://www.neopets.com/*`; appends one `#neopian-assistant-root` | Reads/writes sanitized app data                                                            | Symbol claim prevents duplicate initialization; settings listener supports later enablement; lifecycle/save tests                          |
| Popup                | Toolbar action                                    | Extension popup; reads active-tab URL only                                      | Reads/saves app data; no remote request                                                    | Reports current page/feature availability; Manifest and browser smoke coverage                                                             |
| Options              | User opens Settings                               | Extension page; labeled controls and confirmed dialogs                          | Local app data, redacted price/purchase histories; export/import/clear                     | Save only after sanitization; ≤1 MB import; clear confirmation; storage tests                                                              |
| Dailies navigation   | Dailies enabled; user selects **Go**              | Validated `www.neopets.com` daily URL                                           | Browser navigation only                                                                    | Never marks completion; no account mutation; URL/daily/browser coverage                                                                    |
| Daily completion     | User presses separate check control               | Local dashboard row                                                             | App state/history only                                                                     | Explicit manual mark/reset; LA day, monthly, count, and timer rules; daily tests                                                           |
| Price lookup         | Auto Pricing enabled; user starts scan            | Exact own-stock page; reads visible account and indexed shop form               | Fixed Wizard POST; session lookup rate; app settings                                       | Sequential 6–60 s spacing, cancellation, timeout, bounded response; lookup/parser/network tests                                            |
| Price review/dry run | User reviews selected suggestions                 | Dashboard table/dialog                                                          | No mutation in dry run                                                                     | Exact rows and 1–999,999 NP prices; explicit checkbox; plan/price tests                                                                    |
| Price update         | Dry run off; user confirms                        | Exact own-stock page plus freshly fetched authenticated shop HTML               | One fixed shop POST, verification GET, session review/token/lock, redacted local history   | Fresh account/row/ID/name/field/current-price match, SHA-256 plan/response binding, no retry, exact verification; stale/lock/partial tests |
| Auto Buy dry run     | Auto Buy enabled; user reviews Shop Wizard result | Exact Wizard page; reads results heading, listing link, visible price           | No purchase request                                                                        | Quantity one and hard maximum shown; no URL followed; settings/validation/parser tests                                                     |
| Auto Buy real        | Dry run off; user confirms one listing            | Exact Wizard page and validated `browseshop.phtml` URL                          | Fresh fixed Wizard POST, one purchase GET, session review/token/lock, hashed local history | Exact item/owner/object/visible+URL price, allowed query keys, ceiling, 24 h dedup, no retry, strict response verification; purchase tests |
| Icons                | Build and runtime image load                      | Original extension mark; approved official daily images                         | Generated local PNGs; ordinary `images.neopets.com` image requests                         | Sharp validates dimensions/alpha; browser evidence checks image loading                                                                    |

No alarm scheduling, Chrome notifications, bidding, offers, trading, donating, discarding, item
transfer, CAPTCHA handling, page-world injection, external messaging, telemetry, analytics, remote
executable code, or developer server exists.

## Findings, root causes, and repairs

### Critical baseline finding retained as repaired

| Finding                                                      | Root cause                                                                                 | Repair and evidence                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arbitrary authenticated fetch proxy in the imported baseline | Caller-controlled URL, method, headers, and body crossed into the signed-in service worker | Replaced in 7.8.0 with typed fixed-endpoint operations. 7.9.0 re-review confirms no generic proxy, external connection, broad host permission, or caller-controlled header/method surface. Message, Manifest, static, and production validation pass. |

### High

| Finding                                                   | Root cause                                                                                                                          | Repair                                                                                                                                                                                                                                                                                  | Validation                                                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price plan could become stale before POST                 | The content script parsed shop stock once, then the service worker accepted the reviewed plan without fetching current server state | `preparePriceApply` now performs an authenticated no-store GET, bounds the response, and returns it for strict content parsing. Account, exact row count, ID, name, indexed object/price fields, and current prices must match before a 30-second response/plan-bound token is created. | Fresh-state parser tests reject changed price/account/row; live own-stock form contract confirmed read-only.                                          |
| Consequential post-submit ambiguity mislabeled as failure | The catch path always wrote `failed`, even when the POST may have succeeded and only verification failed                            | Both price and purchase operations track whether the mutation request started. Any later error records `uncertain`, releases short-lived state, warns against retry, and requires manual inspection.                                                                                    | Mutation-classification tests; UI/status source review.                                                                                               |
| Auto-buy contract absent                                  | The prior release intentionally had no purchase code despite the production objective requiring guarded behavior and coverage       | Added an independent disabled/dry-run default, one-item-only workflow with exact candidate schema, hard ceiling, fresh Wizard recheck, response hash, short token, global lock, one-way 24-hour duplicate key, one request, no retry, and strict response verification.                 | Maximum, schema, URL, visible price, dedup, lock, stale, response, settings, sender/page tests plus authenticated read-only live contract validation. |

### Medium

| Finding                                                          | Root cause                                                                                                        | Repair                                                                                                                                                                                                                  | Validation                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Auto Pricing could select 0 NP                                   | Default floor and UI minimum were zero; undercut clamped at zero                                                  | Default/migrated floor is at least 1; calculation and selected-plan validation independently require 1–999,999 NP. Current unsold rows may still be read as zero but cannot be submitted as a selected zero sale price. | Calculation, settings, plan, and shop-row tests.                                       |
| Currency parser accepted malformed grouping                      | It removed every comma and whitespace before digit validation                                                     | Parser accepts plain digits or correctly grouped commas plus optional surrounding whitespace/`NP`; rejects `1,2,3`, `1 234`, decimals, negatives, empty, and >999,999.                                                  | Expanded currency and Wizard parser tests.                                             |
| Real Wizard clears search input after results                    | Initial parser assumed `#shopwizard.value` retained the item name                                                 | Candidate extraction now falls back to `#shopWizardFormResults .wizard-results-header h3`, the live results contract.                                                                                                   | Authenticated read-only discovery and regression test for results-only markup.         |
| “Anytime” marks persisted in today's progress forever            | Manual cooldown returned no reset period                                                                          | Manual/anytime tracking now resets at the Neopian `America/Los_Angeles` date boundary.                                                                                                                                  | Cross-day daily-state test.                                                            |
| Enabling after disabled startup required reload                  | Initialization returned before registering storage/runtime/pagehide listeners                                     | Listener setup now occurs even when the first loaded setting is disabled; later settings changes can mount the app.                                                                                                     | Disabled-startup integration test.                                                     |
| Schema upgrade was not written back for an existing valid record | `loadAppData` only persisted missing or legacy records, so schema 2 sanitized to schema 3 in memory on every load | Canonical schema/version/sanitization differences are persisted once; later equivalent loads are no-ops.                                                                                                                | Storage write-decision tests cover current, old-schema, repaired, and missing records. |

### Low / UX

| Finding                           | Root cause                                  | Repair                                                                                                                          | Validation                                                                          |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dashboard grid assumed three tabs | CSS used `repeat(3, 1fr)`                   | Updated to four equal tabs for Auto Buy.                                                                                        | Production build/static review; installed-build visual check pending manual reload. |
| Documentation contradicted source | 7.8.0 docs said 28/31 tests and no auto-buy | README, privacy, security, changelog, audit, contribution, store, evidence, and PR materials updated for actual 7.9.0 behavior. | Version/branding/search/format validation.                                          |

## Dedicated Auto Pricing trace

1. **Discovery:** `extractShopRows` accepts only the exact process-market form with numeric object
   IDs, indexed `obj_id_N`/`cost_N` fields, bounded names, and parsed current prices.
2. **Price source:** the service worker posts exact item names only to the fixed Neopets Wizard AJAX
   endpoint using the signed-in session.
3. **Parsing:** bounded response HTML is parsed in the isolated content script; positive visible
   prices are normalized, deduplicated, and sorted.
4. **Rules:** match, undercut, or overcut use bounded adjustment, floor ≥1, and maximum 999,999.
5. **Pacing/cancellation:** lookups are globally serialized, session-rate-limited, abortable, and
   deadline bounded; cancellation IDs are capped.
6. **Review:** only changed, explicitly included rows up to the configured run maximum are shown in
   an exact dialog. Dry run stops here.
7. **Fresh gate:** a new authenticated stock GET must exactly match the account and every shop row.
8. **Confirmation/locking:** SHA-256 plan and response fingerprints, tab binding, operation UUID,
   30-second token, and session-backed cross-tab lock are all required.
9. **Submission:** one fixed POST contains all rows, preserving unselected current values. There is
   no automatic retry.
10. **Verification:** a new stock GET must show every selected ID at the proposed price. Mismatch is
    not success; ambiguous submitted failures are `uncertain`.
11. **History/logging:** up to 20 redacted records contain only operation ID, timestamp, count, and
    status. Production warnings are generic and contain no account or plan data.

## Dedicated Auto Buy trace

1. **Candidate:** the live result item name, owner, object ID, visible price, URL price, HTTPS
   origin, `/browseshop.phtml` path, and exact three allowed query keys must validate.
2. **Quantity and ceiling:** quantity is hard-coded to one; no quantity parameter is accepted; price
   must be positive and no higher than the sanitized configured maximum.
3. **Dry run:** the default flow presents the exact item/price/maximum and follows no purchase URL.
4. **Fresh gate:** a fixed exact Wizard search is repeated; the same listing must still appear with
   the same item, owner, object ID, price, and canonical URL.
5. **Confirmation/locking:** a response fingerprint, candidate fingerprint, tab/page binding,
   operation UUID, 30-second token, and global purchase lock are required.
6. **Duplicate prevention:** running, pending-verification, verified, or uncertain fingerprints
   block the same listing for 24 hours. Only the one-way hash and redacted operation status persist.
7. **Mutation:** the exact validated URL is requested once with credentials and a 20-second
   deadline. There is no retry.
8. **Verification:** returned bounded HTML must contain the expected item identity and unambiguous
   success language without known failure language. Otherwise status is `uncertain` and inventory
   must be checked manually.

## Dailies audit

- Navigation and completion remain deliberately separate; **Go** never marks success.
- All default/custom URLs are HTTPS `www.neopets.com`; official image URLs require exact
  `https://images.neopets.com` origin.
- Daily/count/manual state uses the Neopian LA date boundary; monthly state compares year/month;
  timers compare the last completion timestamp and elapsed duration.
- Local marks are explicit and bounded. Multiple tabs converge through sanitized storage-change
  handling rather than sending account mutations.
- No daily destination action is automated or falsely verified. Layout changes at destination pages
  therefore cannot create a false completion; the user remains responsible for marking completion.
- Live daily navigation/installed-build UI checks remain pending the manual extension reload.

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
- Writes are serialized; settings and imported/corrupt data sanitize to schema v3 safe defaults.
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
- `npm run package`: created `release/neopian-assistant-7.9.0.zip` with 21 production files.
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

No username, balance, shop name, third-party owner, object ID, raw page HTML, cookie, token, auth
header, browser profile, or account screenshot was saved or committed. No shop form or purchase URL
was submitted.

Pending installed-build checks require the user to load/reload `dist/` manually because Chrome
browser automation rejected access to `chrome://extensions/` under its privileged-URL policy. The
policy was respected; no CDP, alternate surface, shell profile manipulation, or other bypass was
used.

## Remaining limitations and required follow-up

1. **Manual unpacked-build reload and authenticated dry-run are pending.** Load `dist/`, preserve
   current settings, run dailies/Auto Pricing/Auto Buy dry-run checks, inspect popup/options/service
   worker, and restore settings. A single low-value real operation should occur only if all
   identity, price, response, and restoration checks are unambiguous.
2. **Live markup can change.** Parsers fail closed, but maintainers must update bounded selectors
   and fixtures after verified site changes.
3. **Purchase response wording is intentionally strict.** Unknown success wording produces
   `uncertain`, requiring manual inventory inspection; it is never broadened based on guesswork.
4. **Network ambiguity cannot be eliminated.** A transport failure after submission may leave remote
   state changed. The extension blocks blind retry and tells the user to inspect state.
5. **Policy authorization is deployment-specific.** The owner states project approval for Auto
   Pricing and official icons; Auto Buy remains especially sensitive and must not be enabled without
   applicable authorization. Neopets' current terms broadly prohibit unauthorized automation.
6. **Chrome Web Store review is outside this repository task.** Store disclosures and policy fit
   must be reviewed again at submission time.
7. **GitHub private vulnerability reporting remains disabled.** Enable it in repository security
   settings to provide a direct private intake.

No unresolved source-level critical, high, or medium defect identified by this audit remains open.
The installed-build live-validation requirement above is a release gate, not a claim of completion.
