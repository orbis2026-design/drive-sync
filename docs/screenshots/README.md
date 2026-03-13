# Screenshots for README

Screenshots in this folder are used in the main [README](../README.md).

## Generating screenshots

The script uses **port 3001** (not 3000) so it doesn’t reuse another app on the same host. Playwright will start the DriveSync dev server on 3001 when you run the script.

1. Install Playwright browsers if needed: `npx playwright install`
2. Run: `npm run screenshots`

   The script starts the DriveSync dev server on **port 3001** so it never reuses another app on port 3000. To use an already-running server instead, run `PORT=3001 npm run dev` in another terminal, then run `npm run screenshots`.

   **App screens** (jobs, clients, work order hub, quote builder, checkout) require auth: ensure `tests/.auth/field-tech.json` exists (run the E2E suite once with valid Supabase and `E2E_FIELD_TECH_*` env, or run `npx playwright test tests/global-setup`). The work-order-hub, quote-builder, and checkout screenshots are only taken if the jobs board has at least one work order.

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
