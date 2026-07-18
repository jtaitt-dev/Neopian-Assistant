# Privacy Policy

Last updated: 2026-07-18

Neopian Assistant is an unofficial, fan-made Chrome extension. It has no analytics, telemetry,
advertising, tracking SDK, developer-operated server, or remotely hosted executable code.

> Neopian Assistant is an unofficial fan-made extension and is not affiliated with, endorsed by, or
> sponsored by Neopets.

## Data the extension reads

| Data                                                       | When read                                         | Purpose                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Extension settings and routines                            | Startup and settings changes                      | Render the selected features and migrate or validate stored data.                                 |
| Completion state and history                               | Dashboard display and explicit completion changes | Show local routine status and progress.                                                           |
| Current Neopets page URL                                   | Popup and content-script startup                  | Determine whether the page is supported and whether Auto Pricing may run.                         |
| Visible account name                                       | Only when a pricing run/review is started         | Bind the operation to the account shown on the user's own shop stock page.                        |
| Shop item IDs, names, form field names, and current prices | Only on the user's own shop stock page            | Validate rows, calculate reviewed suggestions, build an exact update plan, and verify the result. |
| Shop Wizard prices and wait/error text                     | During an explicitly started pricing scan         | Calculate and display suggested prices or a precise failure.                                      |

The extension uses the browser's existing signed-in Neopets session for same-origin requests. It
does not read, extract, store, transmit, or log cookie values, passwords, authentication tokens, or
session tokens.

## Data stored

Chrome extension storage contains:

- Feature settings, panel preferences, theme, and density.
- Default or custom routine groups, names, approved Neopets URLs, optional official item-image URLs,
  cooldowns, and notes.
- Manual completion counts, timestamps, and up to 100 completion-history entries.
- Storage schema and migration state.
- Up to 20 redacted pricing-operation records containing an operation ID, timestamp, item count, and
  verified/failure/cancelled status.
- Short-lived session-only lookup timing, confirmation tokens, and cross-tab locks.

Pricing records do not store item names, prices, account names, response bodies, cookies, or request
headers.

## Data transmitted

Data leaves the browser only when the user explicitly starts Auto Pricing:

- A validated item name is sent to the fixed Shop Wizard endpoint at
  `https://www.neopets.com/np-templates/ajax/wizard.php`.
- After opt-in, dry-run is disabled, a complete review is confirmed, and the exact plan is locked,
  validated shop form fields and prices may be sent once to
  `https://www.neopets.com/process_market.phtml`.
- The extension then requests `https://www.neopets.com/market.phtml?type=your` to verify every
  selected price.

The only third party receiving this data is Neopets through `www.neopets.com`. The project owner
receives no extension data. Official item images load from `images.neopets.com` and reveal the
ordinary request metadata inherent in loading an image from that host.

## Retention and deletion

Local data remains until the user removes the extension, clears the extension's browser data, or
uses **Settings → Privacy & Data → Clear extension data**. Completion history is capped at 100
entries and pricing-operation status at 20 entries. Session timing, tokens, and locks are cleared
with the browser session or when an operation finishes or expires.

Users can export their local extension data as JSON, import a validated export of at most 1 MB, or
clear it from the options page. Import and clear operations require user confirmation.

## Security and encryption

Chrome controls storage-at-rest protection for the active browser profile. Neopian Assistant does
not add application-level encryption. Network requests use HTTPS. Normal user-facing messages omit
response bodies, internal stack traces, credentials, and sensitive headers.

## Browsing activity, analytics, and logs

The content script runs only on `https://www.neopets.com/*`. It does not compile or transmit
browsing history. No analytics or telemetry exists. Production code logs only generic initialization
warnings and never logs credentials, account names, price plans, cookies, or server responses.

## User choices

Global enablement, dailies, Auto Pricing, and dry-run are independently controlled. Auto Pricing is
off by default, and legacy migration never silently enables it. Disabling the feature prevents
pricing requests.

For security reporting, see [SECURITY.md](SECURITY.md).
