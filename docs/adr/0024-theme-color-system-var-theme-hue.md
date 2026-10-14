---
status: accepted
date: 2026-08-05
---

# Theme Color System: var(--theme-hue)

- **Decision:** Split `--primary` and `--ring` CSS custom properties to use `var(--theme-hue, 221)` so the hue can be changed without duplicating CSS rules.
- **Reason:** Avoids 8× CSS block duplication per theme. Single `--theme-hue` variable set via JavaScript on `<html>` controls all primary accent colors.

