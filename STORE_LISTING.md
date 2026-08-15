# Chrome Web Store Listing Draft

## Title

Neopian Assistant — Dailies, Pricing & Shop Tools

## Short name

Neopian Assistant

## Tagline

Your all-in-one companion for smarter Neopets routines.

## Short description

An unofficial fan-made companion for daily routines, local progress, reviewed shop pricing, and
guarded one-item shop tools on Neopets.

## Detailed description

Neopian Assistant brings routine tracking and shop productivity tools into a focused on-page
dashboard for `www.neopets.com`.

- Open daily activities without falsely marking them complete.
- Mark completion explicitly, track cooldown-aware status, organize groups, search routines, and
  review local progress.
- Use a separate disabled-by-default MS Autobuy watchlist for up to 10 exact Kauvara names.
  Monitoring is sequential, user-started, cancellable, and read-only. Dry run stops after review;
  real mode rechecks the exact listing and can open one bound haggle page. The user completes the
  offer and human verification manually.
- Use an opt-in Auto Pricing workflow on your own shop stock page. It checks Shop Wizard results at
  a conservative pace, calculates bounded suggestions, supports cancellation and dry-run review,
  rechecks fresh stock, locks one exact plan across tabs, submits at most once, and verifies every
  selected price before reporting success.
- Use a separate disabled-by-default SW Autobuy watchlist for up to 10 exact Shop Wizard names.
  Monitoring is sequential, user-started, cancellable, and read-only. A reviewed one-item action
  enforces a hard maximum price, quantity one, a fresh-listing check, hashed duplicate prevention, a
  cross-tab lock, one request, no retry, and strict response verification.
- Configure themes, density, dailies, Auto Pricing, MS Autobuy, SW Autobuy, dry-run, watchlist
  names, pricing rules, limits, and request spacing.
- Export, import, or clear local extension data from a complete settings page.

Auto Pricing, MS Autobuy, and SW Autobuy are off by default and dry-run is on by default. The
repository owner states that this project has specific approval for the automated pricing workflow
and official daily item icons. MS Autobuy and SW Autobuy remain policy-sensitive and must not be
enabled without applicable authorization. None of these statements grants general authorization to
other users or deployments.

No analytics, telemetry, ads, developer server, remotely hosted executable code, CAPTCHA bypass,
stealth behavior, cookie extraction, automatic haggle offer, or blind retry of a shop update is
included.

Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
sponsored by Neopets.

## Permissions disclosure

- **Storage:** saves settings, routines, completion history, storage migration state, short-lived
  pricing/purchase locks, and redacted operation status in Chrome extension storage.
- **Read and change data on `www.neopets.com`:** displays the dashboard and lets user-started
  pricing and one-item purchase operations call validated Neopets endpoints from the signed-in
  browser session. The extension does not access other sites.

There are no optional permissions.

## User-data disclosure

The extension locally stores preferences, routines, completion history, and redacted operation
status. During a user-started pricing or purchase review it reads only the visible account/shop
fields needed for the selected operation and sends validated item details or reviewed prices only to
`www.neopets.com`. It does not collect or transmit passwords, cookie values, session tokens,
analytics, browsing history, or data to the developer. See [PRIVACY.md](PRIVACY.md).

## Single purpose

Neopian Assistant is a Neopets productivity companion for user-controlled routine tracking and shop
price management. Every surface supports that purpose.

## Suggested screenshots

1. `docs/evidence/dashboard-dailies-7.12.png` — current installed dailies dashboard with dynamic
   next-available tracking and approved official item icons.
2. `docs/evidence/ms-autobuy-7.12.png` — current installed MS Autobuy watchlist and manual
   human-verification boundary.
3. `docs/evidence/auto-pricing-smoke.png` — opt-in dry-run settings and mocked results on a
   synthetic shop page.
4. `docs/evidence/popup-smoke.png` — popup status, local-data summary, and exact disclaimer.
5. `docs/evidence/options-smoke.png` — full settings, privacy, project-approval, and data-management
   surface.

The current installed captures are cropped to the extension surface and omit account identity,
balances, cookies, and session data. The remaining evidence uses a clean browser profile, synthetic
account/shop rows, and mocked price responses.

## Category and support

- Suggested category: Productivity
- Supported browser: Google Chrome 114+
- Manifest version: 3
- Support URL: `https://github.com/jtaitt-dev/Neopian-Assistant/issues`
- Privacy URL after merge: `https://github.com/jtaitt-dev/Neopian-Assistant/blob/main/PRIVACY.md`
