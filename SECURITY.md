# Security Policy

## Supported versions

Security fixes are provided for the latest version on the `main` branch. The currently supported
extension release is 7.10.x.

## Reporting a vulnerability

Do not publish credentials, cookies, session data, account identifiers, private price/shop history,
proof-of-concept exploits, or detailed reproduction steps in a normal public issue.

GitHub private vulnerability reporting is not currently enabled for this repository. For a
potentially sensitive finding, open a minimal issue that asks the maintainer to establish a private
reporting channel, but include no exploit details or sensitive data. Repository maintainers can then
create a private draft security advisory and invite the reporter. Non-sensitive defense-in-depth
suggestions may use a normal issue.

When reporting privately, include:

- Affected version and component.
- Impact and realistic preconditions.
- Minimal reproduction steps using synthetic data.
- Suggested mitigation, if known.
- Whether any real credential or account data may have been exposed.

Allow a reasonable remediation window before public disclosure. Do not test against accounts, shops,
or data you do not own or control.

## Scope

In scope:

- Manifest permissions and content-script isolation.
- Service-worker authorization/message validation and fixed same-origin network destinations.
- Auto Pricing validation, confirmation, locking, idempotency, and verification.
- SW Autobuy watchlist authorization, item/price/URL validation, fresh-listing binding, duplicate
  prevention, locking, and response verification.
- Storage validation and migration.
- Import/export behavior and unsafe DOM rendering.
- Build, packaging, dependency, and secret-exposure risks.

Out of scope:

- Neopets service vulnerabilities unrelated to this extension.
- Social engineering, denial of service, rate-limit abuse, or account access without authorization.
- Reports that require CAPTCHA bypass, credential interception, cookie extraction, stealth
  automation, or security-control circumvention.

## Sensitive-data guidance

Use synthetic fixtures and a clean browser profile. Never attach real cookies, tokens, passwords,
HAR files, browser profiles, private database files, account screenshots, or real shop/purchase
history. Redact local machine paths and personal identifiers.

## Security design summary

The extension uses Manifest V3, no remote executable code, top-frame isolated-world content scripts,
one narrow host permission, no external message interface, strict runtime message schemas and
sender/page validation, response-size limits, request deadlines, safe DOM creation, storage
sanitization, fresh-state checks, explicit consequential-action confirmation, cross-tab session
locks, hashed duplicate-purchase protection, one-shot submission, no blind retry, uncertain-result
classification, and exact post-update verification.

## Consequential-action invariants

- Auto Pricing can mutate only the signed-in user's own shop-stock page, and SW Autobuy can monitor
  or act only from a Shop Wizard page.
- Every SW Autobuy lookup must match a persisted bounded watchlist name and monitor UUID; lookups
  are globally spaced, sequential, cancellable, and read-only.
- Content messages must originate from this extension in an integer tab whose URL matches the exact
  feature page.
- Feature enablement, dry-run state, plan/item identity, price limits, operation ID, confirmation
  expiry, fingerprint, and lock ownership are revalidated in the service worker. The isolated
  content client verifies fresh account/listing state from bounded same-origin responses before a
  worker-authored payload or exact URL can be transported.
- A mutation is issued at most once. Any error after submission is `uncertain`, not a retry signal.
- Price success requires exact fresh shop values; purchase success requires expected item identity
  and unambiguous Neopets success text.
