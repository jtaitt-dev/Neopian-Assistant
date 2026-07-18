# Neopian Assistant

**Neopian Assistant — Dailies, Pricing & Shop Tools**

_Your all-in-one companion for smarter Neopets routines._

Neopian Assistant is an unofficial, fan-made Chrome productivity extension for Neopets. It combines
explicit daily navigation and completion tracking with project-approved, opt-in shop price lookup
and reviewed price updates.

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

## Features

- A movable, resizable on-page dashboard with light, dark, system, compact, and comfortable display
  settings.
- User-initiated daily navigation, separate manual completion controls, cooldown-aware status,
  progress, search, groups, and local history.
- Editable custom routines restricted to HTTPS pages on `www.neopets.com`.
- Auto Pricing on the signed-in user's own shop stock page, with strict item/price/account
  validation, conservative request spacing, progress, cancellation, dry-run review, an exact-plan
  confirmation token, cross-tab locking, one-time submission, and post-update verification.
- A popup for global status and fast access, plus a complete options page for settings, privacy
  information, import/export, and data deletion.
- No analytics, telemetry, advertising, remotely hosted executable code, or developer-operated
  backend.

The production extension is Manifest V3 and supports Chrome 114 or later.

## Requirements

- Node.js 20 or later
- npm 10 or a compatible npm release
- Google Chrome 114 or later for extension use

## Local development

```powershell
npm ci
npm run dev
```

The development command watches source files and rebuilds `dist/`. The project is intentionally
written in vanilla JavaScript, HTML, and CSS; it does not use TypeScript, so there is no separate
type-check command.

Useful commands:

```powershell
npm run format
npm run format:check
npm run lint
npm test
npm run test:coverage
npm run build
npm run validate
npm run secret-scan
npm run verify
npm run package
```

`npm run verify` runs formatting verification, linting, 28 behavioral tests, the production build,
Manifest/file/icon/CSP validation, branding and unsafe-API checks, and the repository secret scan.

## Load the unpacked extension

1. Run `npm ci` and `npm run build`.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository's `dist/` directory.

The unpacked-extension directory and production build directory are both `dist/`. Do not load `src/`
directly.

## Permissions

Neopian Assistant requests only:

- `storage`: stores settings, routines, completion history, migration state, short-lived pricing
  locks, and redacted operation results in Chrome extension storage.
- `https://www.neopets.com/*`: shows the dashboard on supported Neopets pages and lets explicitly
  started Auto Pricing requests reach fixed Neopets endpoints using the browser's existing signed-in
  session.

There are no optional permissions. The content script runs at `document_idle`, in the isolated
world, in the top frame only. The extension does not run in incognito mode and exposes no
web-accessible resources or external message connection.

Official daily item images are loaded from `https://images.neopets.com/items/` under the repository
owner's stated project-specific approval. Neopian Assistant's extension logo is original.

## Privacy and storage

Settings, custom routines, completion state, history, and redacted operation status remain in Chrome
extension storage on the local browser profile. The extension reads the visible account name, shop
item IDs, names, and prices only when needed to validate an explicitly started pricing run. Pricing
requests go only to fixed HTTPS endpoints on `www.neopets.com`; no data is sent to the project owner
or another service.

Use **Settings → Privacy & Data** to export, import, or clear extension data. See
[PRIVACY.md](PRIVACY.md) for the exact data flow and retention behavior.

## Safe use and policy risk

Daily links only navigate; users must mark completion separately. Auto Pricing is off by default,
starts only from the user's own shop stock page, defaults to dry-run, limits each run to 25 changed
items or fewer, waits at least six seconds between lookups, never blindly retries a shop update, and
reports success only after exact verification.

The repository owner has stated that this project has approval for Auto Pricing and official daily
item icons. That project-specific statement is not a general authorization for other users, forks,
or deployments. Neopets' published terms broadly restrict automation, so maintainers and users must
confirm that their own use remains within current permission and rules. The extension contains no
CAPTCHA bypass, stealth behavior, detection evasion, proxy rotation, credential extraction, or
security-control circumvention.

Relevant primary sources:

- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Chrome user-data policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Manifest V3 overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Remote hosted code requirements](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
- [Chrome extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Neopets Terms of Use](https://portal.neopets.com/terms)
- [Neopian Task Force: Play Fair](https://portal.neopets.com/news/may7-neopian-task-force-play-fair)

## Troubleshooting

- **Dashboard is missing:** confirm global enablement in the popup, verify the page is under
  `https://www.neopets.com/`, and reload the page after installing or updating the unpacked build.
- **Auto Pricing cannot start:** open `https://www.neopets.com/market.phtml?type=your`, confirm the
  signed-in account is visible in the page header, enable Auto Pricing, and leave dry-run on for the
  first review.
- **A lookup fails or asks you to wait:** stop the run and wait before retrying. The extension
  intentionally does not accelerate or evade site limits.
- **Verification fails after a submitted update:** reload the shop stock page, inspect every price
  manually, and start a new reviewed operation only after the current state is known.
- **Settings look corrupt:** use the options-page export first if possible, then clear extension
  data. Invalid stored values recover to safe defaults.
- **Build validation fails:** use the supported Node version, run `npm ci`, then rerun
  `npm run verify`.

## Repository structure

```text
src/                    Extension source and Manifest V3 manifest
  background.js         Fixed-endpoint pricing service worker
  content/              Dashboard, pricing UI, parsers, and lifecycle
  popup/                Browser-action popup
  options/              Settings, privacy, and data controls
  shared/               Validation, storage, networking, and operation schemas
scripts/                Build, validation, secret-scan, and packaging tools
test/                   Node behavioral tests and credential-free HTML fixtures
docs/design/            Product design concepts
docs/evidence/          Sanitized clean-profile smoke-test screenshots
dist/                   Generated unpacked production extension (ignored)
release/                Generated release archives (ignored)
```

## Release process

1. Update the synchronized version in `package.json`, `src/manifest.json`,
   `src/shared/constants.js`, and `CHANGELOG.md`.
2. Run `npm ci`, `npm audit --audit-level=high`, and `npm run verify`.
3. Run the clean-profile, fixture-based unpacked-extension smoke test without real credentials or
   real price updates.
4. Run `npm run package`.
5. Inspect `release/neopian-assistant-<version>.zip`, rerun the secret scan, and review the Git diff
   before creating a release.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md),
[AUDIT_REPORT.md](AUDIT_REPORT.md), and [STORE_LISTING.md](STORE_LISTING.md).

## License status

No software license has been selected. All rights are reserved unless the repository owner adds a
license.
