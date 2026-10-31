# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-10-31

First public release.

### Added
- Configurable branding via `VITE_APP_NAME`, `VITE_ORG_NAME`,
  `VITE_LOGIN_TAGLINE`, `VITE_SUPPORT_EMAIL`, `VITE_DEFAULT_MAIL_DOMAIN`,
  `VITE_DEV_LOGIN_HINT`
- Documented `.env.example` / `.env.server.example`
- CI (tests, build, dependency audit), gitleaks secret scanning, Dependabot

### Security
- Updated `dompurify` (3.4.17), `nodemailer` (10.3.1), `proxy-addr`, `zod`,
  `body-parser`, `qs` to versions without known advisories
