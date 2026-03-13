# DriveSync

**Mobile-first CRM and operations platform for solo automotive technicians and independent shops.** Enterprise-grade workflow at a fraction of the cost—built for the bay, not the back office.

---

## Screenshots

| [Landing](docs/screenshots/landing.png) | [Jobs board](docs/screenshots/jobs.png) | [Work order hub](docs/screenshots/work-order-hub.png) |
|:---:|:---:|:---:|
| *Landing — Wrench More. Type Less.* | *Today’s jobs and active work orders* | *Job card hub: quote, parts, inspection* |

| [Quote builder](docs/screenshots/quote-builder.png) | [Checkout](docs/screenshots/checkout.png) | [Clients](docs/screenshots/clients.png) |
|:---:|:---:|:---:|
| *Build and send quotes with parts & labor* | *Checkout and payment* | *Client and vehicle history* |

Generate them with `npm run screenshots` (run `npm run dev` in another terminal first; `npx playwright install` if Playwright browsers are not installed). See [docs/screenshots/README.md](docs/screenshots/README.md).

---

## Features

- **Mobile-first UX** — Designed for use in the bay; minimal taps, clear actions.
- **Work orders & jobs** — Intake → quote → approval → checkout, with digital waivers and customer SMS approvals.
- **Parts & inventory** — Nexpart B2B sourcing, live local pricing, fractional bulk tracking (e.g. oil from drums).
- **Liability & contracts** — Digital waivers and signed authorizations bound to work orders and clients.
- **HQ Chat & AI** — Internal Slack-style chat and daily macro insights (e.g. weather + inventory) via `gpt-4o-mini`.
- **Payments & accounting** — Stripe checkout; QuickBooks Online sync for ledger reconciliation.
- **Federated caching** — VIN/lexicon data cached globally so repeated lookups don’t re-hit paid APIs.

---

## Tech stack

| Layer | Tech |
|-------|------|
| **App** | Next.js 16 (App Router), React 19, Tailwind v4 |
| **Data** | Supabase (Postgres), Prisma 7 |
| **Storage** | Cloudflare R2 (zero-egress media) |
| **Payments / accounting** | Stripe, QuickBooks Online |
| **AI / vision** | OpenAI (gpt-4o VIN/OCR, gpt-4o-mini macro insights) |
| **Auto / parts** | CarMD, NHTSA, Nexpart |
| **Comms** | Twilio (SMS, voice) |
| **Tests** | Playwright E2E |

---

## Local development

**Prerequisites:** Node.js ≥ 20, Docker, Supabase CLI (`npm install -g supabase`).

```bash
git clone https://github.com/yourusername/drive-sync.git
cd drive-sync
npm install
cp .env.example .env.local   # fill in keys; see docs/ENV_SETUP.md
npm run db:setup
npx prisma generate
npm run dev
```

App: **http://localhost:3000**. Run E2E: `npm run test:e2e`.

---

## Production

- **Required env:** See table in [docs/ENV_SETUP.md](docs/ENV_SETUP.md). Core: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, supplier (Nexpart), Stripe, Twilio, OpenAI, `NEXT_PUBLIC_PORTAL_BASE_URL`.
- **Build:** `npx prisma generate && npm run build && npm start`.
- **Gating:** In production, mocks and fallbacks are disabled; missing credentials cause explicit errors. See “Production Gating” in the repo for per-integration behavior.

---

## License & disclaimer

DriveSync is an operational and business-management layer. It does not replace proprietary diagnostic/repair data (e.g. Mitchell1, ALLDATA).
