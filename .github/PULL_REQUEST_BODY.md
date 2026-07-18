## Summary

This PR completes the production audit, repair, Manifest V3 hardening, Neopian Assistant rebrand,
guarded shop workflows, test foundation, documentation, and release pipeline through extension
version 7.9.0.

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

The existing approved Auto Pricing feature remains available with its match/undercut/overcut rules.
It now requires fresh authenticated shop state immediately before a one-shot update. The PR also
adds a separate disabled-by-default, dry-run-by-default Auto Buy review for one exact Shop Wizard
listing with a hard maximum, quantity one, stale-listing checks, cross-tab locking, hashed duplicate
prevention, no retry, and strict response verification.

## User-visible changes

- Four dashboard sections: Dailies, Progress, Auto Pricing, and Auto Buy.
- Auto Pricing selected-price minimum of 1 NP and strict thousands-separator parsing.
- Fresh stock comparison before price submission and `uncertain` status for ambiguous submitted
  outcomes.
- One-item Auto Buy settings, review dialog, dry run, maximum-price control, redacted history, and
  clear failure guidance.
- Manual/anytime completion marks reset at the Neopian day boundary.
- Enabling the extension after disabled startup mounts it without a page reload.
- Synchronized 7.9.0 version, schema 3 migration, rebuilt release package, and complete current
  documentation.

## Consequential-action protections

- Exact feature enablement, sender extension ID, integer tab, and own-stock/Wizard page checks.
- Strict item, account, row, field, URL, quantity, price, maximum, and message schemas.
- Fixed HTTPS Neopets endpoints and 2 MB response caps.
- Conservative global lookup spacing, deadlines, price-scan cancellation, and bounded state.
- Fresh server response plus SHA-256 plan/response/candidate binding.
- Short-lived confirmations, operation UUIDs, and service-worker-session cross-tab locks.
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
- Existing schema data now persists its canonical schema 3 migration once; corrupt/excessive values
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
- `npm test` — passed; 45 passed, 0 failed, 0 skipped.
- `npm run test:coverage` — passed; 65.33% lines, 78.39% branches, 74.03% functions.
- `npm run build` — passed; production output in `dist/`.
- `npm run validate` — passed; Manifest V3, 11 references, icons/alpha, CSP-safe HTML, branding,
  synchronized version, and production API constraints.
- `npm run secret-scan` — passed; no credential-shaped values, sensitive filenames, or private local
  paths.
- `npm run package` — passed; 21-file `release/neopian-assistant-7.9.0.zip`.
- `npm run validate:branch -- feature/neopian-assistant-audit-rebrand` — passed.

Added coverage for strict price parsing, zero protection, fresh shop state, partial-result status,
purchase limits/item/URL/visible-price validation, duplicate history, locks, strict response
verification, dry-run non-mutation, sender/page binding, disabled-startup reactivation, daily
timezone reset, schema write-back, and live-results heading fallback.

## Browser and live-account validation

Prior sanitized clean-profile evidence verifies installation, service worker, popup, options,
dashboard, icons, intended/unintended origins, reload/idempotency, multiple tabs, settings
persistence, Auto Pricing dry run, HTTP failure, offline popup, keyboard focus, and clean console.

Authenticated read-only 7.9.0 validation confirmed:

- Live own-shop indexed form fields and fixed process endpoint.
- Live Wizard purchase URL path and exact three query parameters.
- Matching visible/URL price and a normalized common low-value candidate below the default ceiling.
- A real markup difference where results clear the input and preserve item identity in the results
  heading; implementation and test were repaired.

No account identity, balance, shop name, owner, object ID, cookie, token, header, profile, or raw
HTML was saved. No shop form or purchase URL was submitted.

Current 7.9.0 installed-build validation is waiting on a manual `chrome://extensions/` reload of
`dist/`; browser automation is correctly blocked from that privileged page and no bypass was used.

## Documentation and policy

- Rebuilt README with feature modes, architecture, commands, installation, popup/options/dailies/
  pricing/buying guides, dry run, safeguards, permissions, privacy, clearing, troubleshooting,
  service-worker inspection, branches, contributions, PRs, releases, versioning, reporting,
  limitations, policy risk, and license status.
- Updated changelog, privacy, security, audit, contributing, store listing, test evidence, and PR
  template to match source.
- Auto Pricing and official-icon approval remains explicitly project-specific. Auto Buy is disclosed
  as policy-sensitive and must not be enabled without applicable authorization.

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
