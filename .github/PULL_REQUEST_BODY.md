## Summary

This PR completes the production audit, repair, Manifest V3 hardening, Neopian Assistant rebrand,
guarded shop workflows, test foundation, documentation, and release pipeline through extension
version 7.10.0.

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

The existing approved Auto Pricing feature remains available with its match/undercut/overcut rules.
It now requires fresh authenticated shop state immediately before a one-shot update. The PR also
adds a separate disabled-by-default, dry-run-by-default SW Autobuy workflow: a live watchlist of up
to 10 exact Shop Wizard names plus one-item review with a hard maximum, quantity one, stale-listing
checks, cross-tab locking, hashed duplicate prevention, no retry, and strict response verification.

## User-visible changes

- Four dashboard sections: Dailies, Progress, Auto Pricing, and SW Autobuy.
- Auto Pricing selected-price minimum of 1 NP and strict thousands-separator parsing.
- Fresh stock comparison before price submission and `uncertain` status for ambiguous submitted
  outcomes.
- SW Autobuy 10-item watchlist, 6–60 second sequential monitoring, dynamic validated results,
  explicit cancellation, review dialog, dry run, maximum-price control, redacted history, and clear
  failure guidance.
- Manual/anytime completion marks reset at the Neopian day boundary.
- Enabling the extension after disabled startup mounts it without a page reload.
- Synchronized 7.10.0 version, schema 4 migration, rebuilt release package, and complete current
  documentation.

## Consequential-action protections

- Exact feature enablement, sender extension ID, integer tab, and own-stock/Wizard page checks.
- Strict item, account, row, field, URL, quantity, price, maximum, and message schemas.
- Fixed HTTPS Neopets endpoints and 2 MB response caps.
- Conservative global lookup spacing, deadlines, scan/monitor cancellation, persisted-name lookup
  authorization, and bounded state.
- Fresh script-hydrated same-origin stock snapshot plus SHA-256 plan/response/candidate binding.
- Short-lived confirmations, operation UUIDs, and service-worker-session cross-tab locks.
- Strict UUID lookup/cancellation schemas and pruning of expired review/confirmation state before
  new consequential reviews.
- Hashed 24-hour duplicate blocking for running, pending, verified, or uncertain purchases.
- One mutation request, no blind retry, and explicit `uncertain` classification after ambiguous
  submission.
- Exact post-price verification and strict expected-item/success-text purchase verification.
- Redacted local operation history with no account, owner, item, price, URL, response, cookie, or
  credential logging.

## Security and privacy

- Permissions remain `storage` plus `https://www.neopets.com/*`; no optional permissions.
- No cookies/history/password APIs, alarms, notifications, external messaging, web-accessible
  resources, page-world injection, inline scripts/handlers, unsafe HTML APIs, `eval`, remote code,
  telemetry, ads, or developer backend.
- Exact origin validation rejects alternate schemes, subdomains, and ports.
- Existing schema data now persists its canonical schema 4 migration once; corrupt/excessive values
  recover to safe defaults.
- Original editable extension logo and generated 16/19/24/32/38/48/64/96/128 PNGs are retained.
  Official daily item icons remain under the owner's project-specific approval.

## Reliability, performance, UX, and accessibility

- Idempotent content initialization, disabled-state reactivation, deterministic teardown, serialized
  writes, and storage-backed operation state.
- Bounded routines, rows, prices, histories, cancellations, responses, imports, tokens, and locks.
- One cleared 30-second status tick, event-driven updates, sequential lookups, and resize debounce.
- Semantic controls, tables, dialogs, status regions, progress, cancellation, visible focus,
  keyboard operation, responsive surfaces, themes, and reduced-motion support.
- Dry-run tests prove neither controller sends a mutation message.

## Validation

- `npm audit --audit-level=high` — passed; 0 vulnerabilities.
- All source JavaScript `node --check` — passed.
- `npm run format:check` — passed.
- `npm run lint` — passed.
- `npm test` — passed; 74 passed, 0 failed, 0 skipped.
- `npm run test:coverage` — passed; 75.53% lines, 79.89% branches, 79.04% functions.
- `npm run build` — passed; production output in `dist/`.
- `npm run validate` — passed; Manifest V3, 11 references, icons/alpha, CSP-safe HTML, branding,
  synchronized version, and production API constraints.
- `npm run secret-scan` — passed; no credential-shaped values, sensitive filenames, or private local
  paths.
- `npm run package` — passed twice deterministically; 21-file, 88,867-byte
  `release/neopian-assistant-7.10.0.zip`, SHA-256
  `7222DB2BAF0509D1F8261534886D573CE1B8429FCBACF96F2DDA9F268119DB7E`.
- `npm run validate:branch -- feature/neopian-assistant-audit-rebrand` — passed.

Added coverage for strict price parsing, zero protection, fresh shop state, partial-result status,
purchase limits/item/URL/visible-price validation, duplicate history, locks, strict response
verification, SW Autobuy watchlist bounds/authorization/mismatch shutdown/dynamic parser/review-stop
status, dry-run non-mutation, sender/page binding, disabled-startup reactivation, daily timezone
reset, schema write-back, and live-results heading fallback.

## Browser and live-account validation

Prior sanitized clean-profile evidence verifies installation, service worker, popup, options,
dashboard, icons, intended/unintended origins, reload/idempotency, multiple tabs, settings
persistence, Auto Pricing dry run, HTTP failure, offline popup, keyboard focus, and clean console.

Authenticated read-only 7.9.0 validation confirmed before the 7.10.0 watchlist addition:

- Live own-shop indexed form fields and fixed process endpoint.
- Live Wizard purchase URL path and exact three query parameters.
- Matching visible/URL price and a normalized common low-value candidate below the default ceiling.
- A real markup difference where results clear the input and preserve item identity in the results
  heading; implementation and test were repaired.

No account identity, balance, shop name, owner, object ID, cookie, token, header, profile, or raw
HTML was saved. No shop form or purchase URL was submitted.

Prior 7.9.0 installed-build validation confirmed single-root reload behavior, settings-route repair,
Neopets-page persistence/restoration, daily navigation/manual state, and the full Auto Buy dry-run
review with no purchase. Full live Auto Pricing samples first failed closed because service-worker
requests did not receive authenticated Wizard results. Moving the bounded read-only fetch to the
authenticated same-origin Neopets content context exposed a second fail-closed defect: the own-stock
parser read the live bold quantity cell as the item name. It now uses the bounded first-cell image
label, with a legacy fallback restricted to that cell. Neopets' working AJAX flow also originates
from its official Wizard page, so the bounded same-origin fetch now supplies that first-party
referrer. After reload, one live row produced one validated suggestion, zero errors, and one review;
the acknowledged dry run submitted no prices, and settings were restored. The first authorized
real-price attempt then stopped before submission because the worker-origin fresh-stock GET lacked
the page session; the original price remained unchanged. Fixed bounded same-origin clients now
perform fresh reads and transport only worker-authorized exact payloads/URLs after sender, settings,
plan, fingerprint, token, rate, and lock validation. The update endpoint now also matches the live
form's `/process_market.phtml` action.

The user reloaded 7.10.0 and current SW Autobuy validation confirmed the exact renamed tab, one
dashboard root, disabled/dry-run defaults, exactly 10 persisted names, sequential authenticated
lookups, multiple dynamic validated results, above-ceiling review blocking, an exact quantity-one
review, and explicit dry-run completion without following a purchase URL. Settings were restored and
verified after reload, and no Neopian Assistant console errors occurred. The review transition
exposed a status-only defect: polling stopped, but the background status still said monitoring was
active. The controller now announces the stop before review. A final source trace also found that
real-operation dialogs could be dismissed while their requests were in flight and that Auto Pricing
did not own its dialog for teardown. The repaired dialogs lock dismissal only during execution,
retain safe pre-submit cancellation, and clean up deterministically. Regression coverage also binds
CI's artifact paths to 7.10.0, requires pricing-run UUIDs, prunes expired review state, and verifies
dashboard-dialog teardown. After the final manual reload, the focused installed check confirmed that
review announces the monitor stop before opening, dry-run completion follows no purchase URL,
dashboard-tab switching cancels an active monitor, restored settings persist after reload, exactly
one dashboard remains mounted, and the extension emits no console error or warning. Browser
automation remains correctly blocked from privileged extension pages and no bypass was used.

The action-time-authorized price update then failed closed twice before POST because a one-item
review still retained every excluded shop row in its fingerprint and worker-authored payload. Both
attempts left the selected item's original price unchanged. Auto Pricing now binds plans, fresh
checks, and POST fields only to explicitly selected changed rows, so unrelated stock cannot block or
be rewritten by a one-item update. The review action count also follows checkbox selections. The
reloaded installed build passed a three-row dry scan: deselecting two rows changed the review action
from three to one, the dialog contained only the selected 490 NP → 1 NP row, and completion
submitted no price. The selected-only real review remains action-time gated.

The next real attempt isolated a final Neopets transport detail: authenticated programmatic stock
GETs return only a shell, while the site's own scripts hydrate the actual rows. Auto Pricing now
uses a bounded hidden same-origin frame for fresh and post-submit snapshots, waits for complete
paired form fields, enforces the response cap/deadline, and always removes the frame. Client tests
cover hydration success, timeout cleanup, and oversized pages. The installed eight-row scan then
completed with eight validated suggestions; seven rows were excluded and the exact one-row review
remains unsubmitted pending action-time confirmation.

The final manual unpacked-extension reload also exposed Chrome's stale-content
`Extension context invalidated` rejection. The repaired save boundary now removes that disconnected
dashboard without an unhandled promise while preserving ordinary storage failures for diagnosis.

## Documentation and policy

- Rebuilt README with feature modes, architecture, commands, installation, popup/options/dailies/
  pricing/SW Autobuy guides, dry run, safeguards, permissions, privacy, clearing, troubleshooting,
  service-worker inspection, branches, contributions, PRs, releases, versioning, reporting,
  limitations, policy risk, and license status.
- Updated changelog, privacy, security, audit, contributing, store listing, test evidence, and PR
  template to match source.
- Auto Pricing and official-icon approval remains explicitly project-specific. SW Autobuy is
  disclosed as policy-sensitive and must not be enabled without applicable authorization.

## Remaining limitations

- Live Neopets markup can change; parsers fail closed and require maintained fixtures/selectors.
- Unknown purchase-success wording produces `uncertain` rather than a false success.
- Network ambiguity after submission cannot be eliminated; the extension blocks retry and requires
  manual state inspection.
- Chrome Web Store review and GitHub private-vulnerability-reporting enablement are outside this
  branch.
- No license has been added; the package remains `UNLICENSED`.

See [AUDIT_REPORT.md](../AUDIT_REPORT.md) and [docs/TEST_EVIDENCE.md](../docs/TEST_EVIDENCE.md) for
detailed evidence.
