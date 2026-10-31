# Contributing

Thanks for helping improve Mailcow Webmail!

## Development setup

```bash
npm ci
cp .env.example .env.local   # point VITE_SOGO_BASE_URL at a mailcow test instance
npm run dev
```

Use a **test** mailcow instance and test accounts — never develop against
production mailboxes.

## Before opening a pull request

```bash
npm test        # must pass
npm run build   # must succeed
```

- Keep changes focused; one topic per PR.
- Add or update a test in `scripts/test-*.mjs` for every bug fix or behaviour
  change (`npm test` picks them up automatically).
- Pure logic belongs in `src/lib/` so it can be unit-tested without a browser.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages (`feat:`, `fix:`, `docs:`, `chore:` …).

## Never commit

- `.env*` files (except the `*.example` templates), passwords, API keys, tokens
- Real email addresses, names, or mailbox content — use `example.com` /
  `example.net` and fictitious names in tests and fixtures
- Internal hostnames, IP addresses, or server paths

CI runs [gitleaks](https://github.com/gitleaks/gitleaks) on every push and PR.
Running it locally before pushing is recommended:

```bash
gitleaks git . --log-opts="--all"
```

## Translations

The UI is currently Indonesian. If you want to add i18n support, please open an
issue first to agree on the approach.

## Code of Conduct

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
