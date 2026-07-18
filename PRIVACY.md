# Privacy Policy

Last updated: 2026-07-18

Neopian Assistant is an unofficial, fan-made Chrome extension. It has no analytics, telemetry,
advertising, tracking SDK, developer-operated server, or remotely hosted executable code.

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

## Data the extension reads

| Data                                                       | When read                                          | Purpose                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Settings and routines                                      | Startup and settings changes                       | Render enabled features and sanitize or migrate local data.                 |
| Completion state and history                               | Dashboard display and explicit completion changes  | Show local daily status and progress.                                       |
| Current Neopets page URL                                   | Popup, content startup, and runtime messages       | Limit each feature to its exact supported page.                             |
| Visible signed-in account name                             | A price scan or fresh price review                 | Bind Auto Pricing to the account visible on the user's own shop-stock page. |
| Shop item IDs, names, field names, and prices              | Own shop-stock page and fresh pricing verification | Build, compare, submit, and verify an exact reviewed price plan.            |
| Shop Wizard item name, listing owner, object ID, and price | Explicit pricing lookup or Auto Buy review         | Validate prices and bind one purchase review to one exact listing.          |
| Neopets response text                                      | Pricing and purchase operations                    | Parse bounded prices/errors and require unambiguous final verification.     |

The extension uses the browser's existing signed-in Neopets session for same-origin requests. It
does not read, extract, store, transmit, or log cookie values, passwords, authentication headers,
session tokens, browser passwords, account-recovery data, email, or unrelated browsing activity.

## Data stored

Chrome extension local storage contains:

- Feature settings, panel position, theme, and density.
- Default or custom routine groups, names, approved Neopets URLs, optional official item-image URLs,
  cooldowns, and notes.
- Manual completion counts, timestamps, and up to 100 completion-history entries.
- Storage schema and migration state.
- Up to 20 redacted Auto Pricing records containing operation ID, timestamp, item count, and status.
- Up to 20 redacted Auto Buy records containing operation ID, timestamp, status, and a one-way
  SHA-256 listing fingerprint used for duplicate prevention.

Purchase history does not store the account name, listing owner, item name, object ID, price,
purchase URL, response body, cookie, or request header. A fingerprint is retained only as a
non-display identity check; verified and uncertain fingerprints block the same listing for 24 hours.

Chrome session storage contains bounded lookup timing, short-lived fresh-review records,
confirmation tokens, and cross-tab locks. These values expire, are removed when operations finish,
or clear with the browser session.

## Data transmitted

Data leaves the browser only when the user explicitly starts Auto Pricing or Auto Buy.

### Auto Pricing

- A validated item name is sent to the fixed Shop Wizard endpoint at
  `https://www.neopets.com/np-templates/ajax/wizard.php`.
- Fresh shop stock is fetched from `https://www.neopets.com/market.phtml?type=your` before a real
  update and again afterward for verification.
- After opt-in, disabling dry run, exact review, fresh-state comparison, and confirmation, validated
  shop fields and prices are sent once to `https://www.neopets.com/process_market.phtml`.

### Auto Buy

- The exact item name is sent to the same fixed Shop Wizard endpoint to recheck a selected listing.
- After opt-in, disabling dry run, price-ceiling validation, fresh-listing comparison, and explicit
  one-item confirmation, the exact validated `https://www.neopets.com/browseshop.phtml` purchase URL
  is requested once.
- The bounded returned page is parsed locally to verify the expected item and an unambiguous success
  message.

The only service receiving feature data is Neopets through `www.neopets.com`. The project owner
receives no extension data. Official daily images load from `images.neopets.com` and expose only the
ordinary request metadata inherent in loading a web image.

## Retention, export, import, and deletion

Local data remains until the user removes the extension, clears its Chrome data, or uses **Settings
→ Privacy & Data → Clear extension data**. The clear action requires confirmation and removes
settings, routines, completion history, migration records, pricing history, purchase history,
tokens, timing records, and locks.

Users can export the main validated settings/routine data as JSON and import a validated export of
at most 1 MB. Redacted operation histories and session-only safety state are not exported.

## Security and encryption

Chrome controls storage-at-rest protection for the active browser profile. Neopian Assistant does
not add application-level encryption. Requests use HTTPS and fixed Neopets origins. User-facing
messages omit response bodies, stack traces, credentials, account names, store owners, and internal
request data.

## Browsing activity, analytics, and logs

The content script runs only on `https://www.neopets.com/*`. It neither requests nor compiles Chrome
browsing history. No analytics or telemetry exists. Production logging is limited to generic
initialization warnings; prices, plans, listing identity, response bodies, cookies, and account
identity are never logged.

## User choices

Global enablement, dailies, Auto Pricing, and Auto Buy are independently controlled. Both
consequential features are off by default and dry-run by default. Legacy migration never silently
enables either feature. Disabling a feature prevents its service-worker requests.

For security reporting, see [SECURITY.md](SECURITY.md).
