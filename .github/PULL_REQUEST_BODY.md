## Summary

This PR releases Neopian Assistant 7.13.0 and expands **MS Autobuy** for Kauvara's Magic Shop. It
does not rename or alter SW Autobuy, and it does not change Auto Pricing behavior.

MS Autobuy now accepts up to 100 exact item names, monitors Kauvara sequentially, and has no user
price ceiling. In live mode the first exact in-stock match is rechecked and bound to one tab and one
short-lived purchase. After the user completes Neopets' official verification, the extension fills
the exact listed price, submits once, and strictly verifies the result.

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

## User-visible changes

- Expands the MS Autobuy watchlist from 10 to 100 case-insensitively deduplicated exact names.
- Removes the MS Autobuy maximum-price control; every valid Kauvara listed price from 1 through
  999,999 NP is eligible.
- Changes live MS monitoring from a manual haggle-page handoff to a guarded one-item continuation:
  exact stock card → user verification → exact listed-price offer → strict result verification.
- Adds a fixed in-page MS purchase status/cancel surface and clear failed/uncertain outcomes.
- Keeps MS Autobuy disabled by default and dry run enabled by default.
- Bumps the extension/package version to 7.13.0 and storage schema to 6.

## Consequential-action protections

- Exact extension sender, integer tab, Kauvara shop URL, candidate name/object/stock/price/URL, and
  saved-watchlist validation.
- Fresh authenticated stock fetch immediately before arming the purchase.
- Four valid one-way phases: `awaiting-listing` → `awaiting-verification` → `awaiting-haggle` →
  `submitting`.
- Short-lived tab-bound state, session cross-tab lock, SHA-256 listing fingerprint, and 24-hour
  duplicate blocking after submission begins.
- Submission is allowed only from the exact candidate-bound `haggle.phtml` URL containing the
  official verification result token; the token is never stored or logged.
- The extension waits for the user to complete the official verification. It does not inspect,
  click, solve, or bypass the verification control.
- The exact listed price is filled and submitted once. There is no automatic retry.
- Success requires both the exact accepted-offer text and exact inventory-addition text. Unknown
  outcomes are recorded as `uncertain` and require manual inspection.
- Local history is redacted to operation ID, time, quantity-one status, and one-way fingerprint.

## Unchanged behavior

- Auto Pricing match/undercut/overcut rules, limits, fresh-state checks, and submission flow.
- SW Autobuy's independent 10-item watchlist, maximum-price control, and purchase flow.
- Dynamic daily cooldown tracking and official item icons.
- Manifest permissions: `storage` plus `https://www.neopets.com/*`.

## Validation

- `npm run format:check` — passed.
- `npm run lint` — passed; 84 files checked, no fixes or warnings.
- Node behavioral suite — 95 passed, 0 failed, 0 skipped.
- Coverage — 71.72% lines, 75.51% branches, 76.20% functions.
- Production build and Manifest V3 validation — passed; 11 referenced files, icons, CSP-safe HTML,
  branding/version, and production API checks.
- Secret scan — passed.
- `npm audit --audit-level=high` — 0 vulnerabilities.
- Branch policy — `feature/ms-autobuy-100-item-watchlist` passed.
- Deterministic package — two identical runs, 21 files, 101,011 bytes:
  `release/neopian-assistant-7.13.0.zip`
- Package SHA-256: `850F2AB09E0D55B5FC8A1222C3C22A130AFA9790B4D373092A87D81E893AD1EF`

## Installed-browser smoke

Chrome loaded v7.13.0 from this branch's unpacked `dist`. On the exact authenticated Kauvara page:

- One dashboard rendered with separate **MS Autobuy**, **Auto Pricing**, and **SW Autobuy** tabs.
- MS Autobuy showed the 100-name limit and no maximum-price field.
- A temporary exact `Nova` watchlist entry matched a current 330 NP/5-stock card.
- One dry-run monitor stopped on the match and opened only the extension's quantity-one review.
- Completing the dry run stayed on the Kauvara shop and did not open a purchase/haggle flow.
- MS Autobuy was restored to disabled, dry run enabled, 10-second interval, and an empty watchlist.
- No Neopian Assistant console error or warning occurred; observed console messages belonged to the
  unrelated Grammarly extension.

No live purchase was executed by the v7.13.0 automated flow during this smoke. The post-verification
offer and result phases are covered with deterministic DOM fixtures and message/state tests.

## Documentation

README, changelog, privacy disclosure, store listing, audit report, test evidence, CI artifact
metadata, and this PR body are synchronized to v7.13.0.

## Remaining limitations

- Live Neopets markup can change; exact parsers fail closed and require maintained fixtures.
- Unknown or changed purchase-result wording is reported as `uncertain`, never guessed as success.
- Network ambiguity after a submission cannot be eliminated, so the extension blocks blind retry.
- Chrome Web Store review and GitHub private-vulnerability-reporting enablement are outside this PR.
- The package remains `UNLICENSED`.
