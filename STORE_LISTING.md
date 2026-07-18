# Chrome Web Store Listing Draft

## Title

Neopian Assistant — Dailies, Pricing & Shop Tools

## Short name

Neopian Assistant

## Tagline

Your all-in-one companion for smarter Neopets routines.

## Short description

An unofficial fan-made companion for daily routines, local progress, shop price research, and
reviewed shop updates on Neopets.

## Detailed description

Neopian Assistant brings routine tracking and shop productivity tools into a focused on-page
dashboard for `www.neopets.com`.

- Open daily activities without falsely marking them complete.
- Mark completion explicitly, track cooldown-aware status, organize groups, search routines, and
  review local progress.
- Use an opt-in Auto Pricing workflow on your own shop stock page. It checks Shop Wizard results at
  a conservative pace, calculates bounded suggestions, supports cancellation and dry-run review,
  locks one exact plan across tabs, submits at most once, and verifies every selected price before
  reporting success.
- Configure themes, density, dailies, Auto Pricing, dry-run, pricing rules, limits, and request
  spacing.
- Export, import, or clear local extension data from a complete settings page.

Auto Pricing is off by default and dry-run is on by default. The repository owner states that this
project has specific approval for the automated pricing workflow and official daily item icons. That
statement is not a general authorization for other users or deployments. Users remain responsible
for confirming current rules and their own permission.

No analytics, telemetry, ads, developer server, remotely hosted executable code, CAPTCHA bypass,
stealth behavior, cookie extraction, or blind retry of a shop update is included.

Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
sponsored by Neopets.

## Permissions disclosure

- **Storage:** saves settings, routines, completion history, storage migration state, short-lived
  pricing locks, and redacted operation status in Chrome extension storage.
- **Read and change data on `www.neopets.com`:** displays the dashboard and lets user-started
  pricing operations call fixed Neopets endpoints from the signed-in browser session. The extension
  does not access other sites.

There are no optional permissions.

## User-data disclosure

The extension locally stores preferences, routines, completion history, and redacted operation
status. During a user-started pricing run it reads the visible account name plus shop item IDs,
names, and prices, and sends validated item names or reviewed prices only to fixed `www.neopets.com`
endpoints. It does not collect or transmit passwords, cookie values, session tokens, analytics,
browsing history, or data to the developer. See [PRIVACY.md](PRIVACY.md).

## Single purpose

Neopian Assistant is a Neopets productivity companion for user-controlled routine tracking and shop
price management. Every surface supports that purpose.

## Suggested screenshots

1. `docs/evidence/dashboard-smoke.png` — on-page dailies dashboard using approved official item
   icons on a credential-free fixture.
2. `docs/evidence/auto-pricing-smoke.png` — opt-in dry-run settings and mocked results on a
   synthetic shop page.
3. `docs/evidence/popup-smoke.png` — popup status, local-data summary, and exact disclaimer.
4. `docs/evidence/options-smoke.png` — full settings, privacy, project-approval, and data-management
   surface.

All evidence uses a clean browser profile, synthetic account/shop rows, and mocked price responses.
It contains no real account credentials or real shop history.

## Category and support

- Suggested category: Productivity
- Supported browser: Google Chrome 114+
- Manifest version: 3
- Support URL: `https://github.com/jtaitt-dev/Neopian-Assistant/issues`
- Privacy URL after merge: `https://github.com/jtaitt-dev/Neopian-Assistant/blob/main/PRIVACY.md`
