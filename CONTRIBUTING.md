# Contributing

Thank you for helping improve Neopian Assistant.

## Ground rules

- Preserve the exact product disclaimer and unofficial positioning.
- Do not add official Neopets logos or copied site artwork. Official daily item icons are used only
  under the repository owner's project-specific approval; do not generalize that approval to another
  project.
- Do not remove Auto Pricing solely because it is policy-sensitive. Keep it explicit, opt-in,
  conservative, reviewable, cancellable, and verifiable.
- Keep SW Autobuy disabled by default, dry-run by default, watchlist-bounded, sequential,
  cancellable, quantity one, bounded by a hard maximum, fresh-state checked, duplicate-blocked,
  cross-tab locked, one-shot, and verified.
- Do not add CAPTCHA bypass, anti-bot evasion, stealth behavior, proxy rotation, credential access,
  cookie extraction, hidden automation, or blind retries of consequential actions.
- Never commit real account data, credentials, browser profiles, logs, HAR files, screenshots with
  identifiers, or live price/purchase history.
- No software license has been selected; contributions do not imply an open-source license.

## Setup

```powershell
npm ci
npm run verify
```

Use Node.js 20.9 or later. The project uses vanilla JavaScript, HTML, and CSS, an npm lockfile,
esbuild, Biome, Prettier, and Node's built-in test runner.

## Development workflow

1. Create a focused branch using the naming convention below.
2. Use `npm run dev` for rebuild-on-change development.
3. Add behavioral tests for validation, parsing, storage, message schemas, locking, or
   consequential-operation changes.
4. Run `npm run verify` and `npm audit --audit-level=high`.
5. Build with `npm run build` and load `dist/` in a clean Chrome profile.
6. Use fixture pages and dry-run mode for automated tests. Live tests require explicit account
   authorization, the minimum low-risk action, before/after state, redacted evidence, and restored
   temporary settings.
7. Run `npm run package` only after verification passes.
8. Review staged filenames, staged diff, and secret-scan output before committing.

## Branch naming

Every development branch must use one of these prefixes:

| Prefix      | Use                                         |
| ----------- | ------------------------------------------- |
| `feature/`  | New functionality                           |
| `fix/`      | Normal bug fix                              |
| `hotfix/`   | Urgent production fix                       |
| `refactor/` | Code cleanup without changing behavior      |
| `docs/`     | Documentation                               |
| `test/`     | Tests                                       |
| `chore/`    | Maintenance, dependencies, or configuration |

Follow the prefix with a concise lowercase kebab-case description. Do not add another slash.
Examples: `feature/add-shop-filter`, `fix/pricing-lock-timeout`, and `docs/update-store-guide`.
Branch names are limited to 80 characters. Pull-request CI enforces this convention.

Check a name locally before pushing:

```powershell
npm run validate:branch -- feature/add-shop-filter
```

## Code style

- Keep modules narrowly scoped and retain vanilla JavaScript unless a real requirement justifies a
  framework or language migration.
- Validate storage, DOM, page, API, and runtime-message data at trust boundaries.
- Use safe DOM APIs; do not add `innerHTML`, `outerHTML`, `insertAdjacentHTML`, inline handlers,
  `eval`, or dynamically executed remote code.
- Give every network request a fixed destination, schema validation, response bounds, timeout, abort
  path, and clear failure behavior.
- Consequential operations must require explicit user initiation, feature enablement,
  current-page/account/state validation, bounded inputs, duplicate prevention, an operation ID, no
  blind retry, and verified success.
- Treat any failure after a request may have been submitted as `uncertain`; require manual state
  inspection and never turn ambiguity into an automatic retry.
- Respect keyboard access, visible focus, semantic controls, responsive layouts, and reduced-motion
  preferences.

## Pull requests

Complete the repository pull-request template. Describe actual commands and results; do not claim
tests or browser checks that were not run. Include sanitized screenshots when UI changes materially.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of publishing sensitive details.
