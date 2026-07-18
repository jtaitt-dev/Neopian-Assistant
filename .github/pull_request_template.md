## Summary

Describe the user-visible outcome and affected extension surfaces.

## Safety and privacy

- [ ] No credentials, cookies, sessions, browser profiles, account data, HAR files, or private local
      paths are included.
- [ ] New storage, permissions, network destinations, or data flows are documented and validated.
- [ ] Consequential actions remain explicit, bounded, locked against duplicates, non-retrying, and
      verified.
- [ ] Auto Pricing and Auto Buy preserve fresh-state checks, strict price limits, one-shot mutation,
      uncertain-result handling, and dry-run defaults.
- [ ] No CAPTCHA bypass, stealth, detection evasion, credential access, or security-control
      circumvention is introduced.

## Validation

- [ ] The branch uses an approved prefix and a lowercase kebab-case description.
- [ ] `npm ci`
- [ ] `npm audit --audit-level=high`
- [ ] `npm run verify`
- [ ] `npm run package`
- [ ] Clean-profile unpacked-extension smoke test using fixtures and dry-run mode
- [ ] Any authorized live-account validation used low-risk state, redacted evidence, and restored
      temporary settings; otherwise the omission is explicit.

Paste the actual results and describe any check that was not run.

## UI and accessibility

Describe keyboard, focus, loading/running/success/failure, responsive, and reduced-motion
validation. Attach only sanitized screenshots.

## Policy and documentation

- [ ] Branding, exact disclaimer, privacy, changelog, audit/store metadata, and version are
      synchronized where affected.
- [ ] Policy-sensitive behavior and project-specific approval boundaries remain visible.
- [ ] No software license was added or implied.
