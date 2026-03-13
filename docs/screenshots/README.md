# Screenshots for README

Screenshots in this folder are used in the main [README](../README.md).

## Generating screenshots

1. Install Playwright browsers if needed: `npx playwright install`
2. Start the app: `npm run dev` (or let Playwright start it).
3. For **public pages only** (landing, login), run:
   ```bash
   npx playwright test tests/screenshots.spec.ts --project=Desktop\ Chrome
   ```
   Use a context without auth by running with a project that does not use `storageState`, or run the script and ignore auth-required failures.

4. For **app pages** (jobs, clients, work order hub, quote builder, checkout), Playwright’s default config uses `tests/.auth/field-tech.json`. Create it by running the E2E suite once (or global setup) with valid Supabase and `E2E_FIELD_TECH_EMAIL` / `E2E_FIELD_TECH_PASSWORD`:
   ```bash
   npx playwright test tests/global-setup
   npx playwright test tests/screenshots.spec.ts --project=Desktop\ Chrome
   ```
   The “work order hub, quote builder, checkout” test only runs if the jobs board has at least one work order; otherwise those three screenshots are skipped.

## Files

| File | Description |
|------|-------------|
| `landing.png` | Landing page (hero + features) |
| `login.png` | Sign-in page |
| `jobs.png` | Jobs board (Today) |
| `clients.png` | Clients list |
| `work-order-hub.png` | Work order job card hub |
| `quote-builder.png` | Quote builder |
| `checkout.png` | Checkout page |
