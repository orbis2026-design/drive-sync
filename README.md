# DriveSync

> **A cost-optimized, mobile-first CRM and operational engine for solo automotive technicians and independent shops.**

While in the Automotive Technician program at UEI College, we were introduced to the industry-standard shop management software. The problem was glaring: these monolithic systems are incredibly expensive ($250 to $500+ a month) and overly complex. 

Many of my classmates—highly skilled future mechanics—felt immediate apprehension toward adopting these systems to run their aspiring businesses. And while budget alternatives do exist in the $49/mo range, the core issue isn't just price; it is **UX bloat and workflow friction**. These alternatives often feel like complex, intimidating databases rather than intuitive tools. If the software is too clunky to use with grease on your hands, a technician simply won't adopt it.

DriveSync was architected to solve this adoption gap. It delivers the operational horsepower of a $500/mo enterprise system, built on a cost-optimized, serverless stack with a UI that removes the friction and apprehension of digital management.

---

## Table of Contents

1. [What & Why](#what--why)
2. [Core Design Choices](#core-design-choices)
3. [Tech Stack](#tech-stack)
4. [Local Development Setup](#local-development-setup)

---

## What & Why

DriveSync translates physical bay intuition into digital orchestration. It is designed to handle the legal and operational realities of the automotive repair industry—whether that means a first-year mobile mechanic operating out of a sedan or an established 4-bay brick-and-mortar shop.

| The Physical Reality | DriveSync Solution |
|---|---|
| Complex software causes adoption apprehension | Mobile-first UX focused strictly on the technician's actual workflow |
| Sourcing parts requires calling 3 different stores | Integrated Nexpart B2B sourcing for live local pricing & delivery times |
| Safety declines create massive legal liability | Forced digital contracts & waivers attached permanently to the Work Order |
| Service bays feel isolated from the front office | Real-time HQ Chat for shop cohesion, bonding, and daily AI macro-insights |
| Expensive OEM data APIs called on every lookup | Global Lexicon cache — fetch once, reutilize globally across tenants |

---

## Core Design Choices

### 1 · Dynamic Inventory Scaling & Nexpart Sourcing
Inventory in an auto shop isn't a simple "widget." A mobile mechanic tracks 5-quart jugs in a trunk, while a shop pumps from 55-gallon drums. 

DriveSync's math engine utilizes a Global Lexicon to handle **fractional bulk deductions**. It queries exact OEM capacities (e.g., 5.2 quarts of 0W-20) and dynamically subtracts that exact volume from the user's bulk `Consumable` ledger upon work order completion. 

**Integrated Parts Sourcing:** For non-bulk items, the platform implements a B2B bridge (via Nexpart standard integrations). Instead of calling AutoZone, O'Reilly, and WorldPac, technicians query the parts catalog directly within the work order. The system pulls live local pricing, automatically applies the shop's profit-matrix markup, and displays fulfillment speeds (e.g., "Same-Day Local Delivery" vs. "3-Day Online Order"), allowing for instant, accurate customer quoting.

### 2 · Liability Gating & Digital Contracts
Shop management isn't just about billing; it is about legal protection. If a technician flags a safety-critical system (e.g., metal-to-metal brakes) and the customer declines the repair, the workflow halts.

* **Implementation:** The system requires a digital liability waiver via `react-signature-canvas`. Custom digital contracts and warranties are dynamically generated, signed by the customer, and permanently bound to the specific `WorkOrder` and `Client` records in the Postgres database for absolute legal auditability. 
* **Customer Supplied Parts:** The database natively tracks `customerSuppliedParts` flags to automatically strip warranty coverages from the final digital contract.

### 3 · Shop Cohesion, Asynchronous Approvals & Macro-AI Insights
DriveSync unifies communication—both externally with the customer and internally across the shop floor.

* **Asynchronous Media Approvals:** A vehicle taking up a physical lift waiting for a phone approval drains revenue. Integrated Twilio SMS dispatches secure Change-Order links (`deltaApprovalToken`). Customers view inspection photos and videos from their phone and digitally approve the additional parts/labor, instantly unblocking the technician.
* **Shop Cohesion (HQ Chat):** A Slack-style internal messaging system keeps the isolated bays connected to the back office, fostering team bonding and real-time operational chatter. 
* **Macro-AI Insights (Zero Liability):** Scraping deep customer PII to feed an AI creates massive legal and privacy liabilities. Instead, DriveSync uses a simpler, highly effective macro-approach. Powered by **OpenAI `gpt-4o-mini`**, the system analyzes generalized external data (like local 7-day weather forecasts and seasonality) combined with high-level shop inventory. Every morning, the AI drops a systemic insight into the HQ Chat: *"Heavy rain expected starting Thursday. Expect a spike in wiper blade and tire replacements—ensure bulk stock is ready."* * **The AI Cost Model:** Because this relies on the lightweight `gpt-4o-mini` model querying macro-data once a day, the cost is literally fractions of a cent (<$0.01) per shop. This is absorbed entirely by the platform as a microscopic overhead expense, delivering massive perceived value to the user without padding their subscription cost.

### 4 · The Low-Cost Philosophy (Federated Caching)
To achieve a sub-$5/month per-tenant infrastructure cost and bypass the $250/mo enterprise ransom, DriveSync utilizes Edge compute and a strict **Federated Caching Model**. 

Instead of passing the cost of expensive, per-call enterprise APIs down to the shop owner, we cache the data:
* **The Math:** A VIN decode and maintenance schedule pull via CarMD costs approximately **$0.10 per call**. 
* **The Federation:** When a shop pulls a 2018 Toyota Camry 2.5L, the platform pays the $0.10. However, that data (fluid capacities, TSBs, trims) is permanently saved into our `GlobalVehicles` schema. When the next tenant pulls that exact vehicle, the system hits our PostgreSQL database. The cost is **$0.00**. Over time, the cost to operate the entire platform approaches zero.
* **Zero-Egress Media:** Inspection photos and videos are stored via Cloudflare R2, eliminating the massive AWS S3 egress bandwidth fees typically associated with serving media back to client portals.
* **Twilio Pass-Through:** SMS costs (~$0.0079 per text) are handled as microscopic, usage-based overhead rather than padding a flat $300 subscription fee.

***Disclaimer:** DriveSync is an operational orchestration engine. It does not replace the need for proprietary, deep-diagnostic schematics and wiring diagrams provided by enterprise services like Mitchell1 ProDemand or ALLDATA. It simply replaces the bloated business-management layer.*

---

## Tech Stack

| Layer | Technology | Purpose & Capability |
|---|---|---|
| **Frontend/Backend** | Next.js 16 (App Router) | Edge-ready SSR, enabling Server Actions for zero-API-layer mutations and highly performant offline-to-online syncing. |
| **Database** | Supabase (Postgres) | Strict Row-Level Security (RLS) for multi-tenant isolation, utilizing native JSONB columns for dynamic vehicle trims and real-time WebSockets for Slack-style HQ Chat. |
| **Storage** | Cloudflare R2 | S3-compatible object storage chosen specifically for its **zero-egress bandwidth fees**, allowing unlimited photo/video inspection hosting. |
| **Payments/Accounting**| Stripe & QuickBooks | Stripe handles batch invoicing and secure BNPL checkout; QBO OAuth pipeline fully automates ledger reconciliation to eliminate double-entry bookkeeping. |
| **AI / Machine Vision** | OpenAI (`gpt-4o` & `mini`) | `gpt-4o` powers automated mobile-camera intake (VIN/Plate OCR); `gpt-4o-mini` powers ultra-low-cost daily macro-insights (weather/seasonality) in the HQ Chat. |
| **Automotive APIs** | CarMD / NHTSA / Nexpart | Provides foundational VIN decoding, maintenance intervals, and real-time B2B local part sourcing/pricing. |
| **Communications** | Twilio | Programmatic SMS and Voice for automated ETA delivery, asynchronous QA approvals, and hands-free voice logging. |
| **Testing** | Playwright | End-to-End (E2E) testing automating the critical technician workflows: offline sync resilience, intake, and checkout paths. |

---

## Local Development Setup

### Prerequisites

- Node.js ≥ 20
- Docker Desktop (for the local Supabase stack)
- Supabase CLI (`npm install -g supabase`)

### 1 · Clone & Install

```bash
git clone [https://github.com/yourusername/drive-sync.git](https://github.com/yourusername/drive-sync.git)
cd drive-sync
npm install
```

### 2 · Environment Variables

Copy the example file and fill in your integration keys (Stripe, Twilio, QBO, OpenAI, CarMD):
```Bash

cp .env.example .env.local
```
### 3 · Start the Local Supabase Stack
```Bash

npm run db:setup
# or manually via Supabase CLI:
npx supabase start
```
This boots Postgres, the Auth server, and the Supabase Studio dashboard locally via Docker. The CLI will print the local SUPABASE_URL and SUPABASE_ANON_KEY — paste those into .env.local.
### 4 · Generate the Prisma Client & Start the Dev Server
```Bash

npx prisma generate
npm run dev
```
The app will be available at http://localhost:3000.
### 5 · Apply Database Migrations & Run E2E Tests
```Bash

npx supabase db push
npm run test:e2e
```

---

## Production Deployment

### Required Environment Variables

The following variables **must** be set in production (`NODE_ENV=production`).
The application will refuse to start or will return errors if any required
integration is missing.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase admin key for RLS-bypassing operations |
| `SUPPLIER_API_BASE_URL` | ✅ | Nexpart / Epicor parts supplier REST API base URL |
| `SUPPLIER_CLIENT_ID` | ✅ | Supplier OAuth client ID |
| `SUPPLIER_CLIENT_SECRET` | ✅ | Supplier OAuth client secret |
| `SUPPLIER_API_KEY` | ✅ | Supplier API key |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key for invoicing and payments |
| `TWILIO_ACCOUNT_SID` | ✅ | Twilio SID for SMS and voice |
| `TWILIO_AUTH_TOKEN` | ✅ | Twilio auth token |
| `OPENAI_API_KEY` | ✅ | OpenAI API key for AI vision and diagnostics |
| `NEXT_PUBLIC_PORTAL_BASE_URL` | ✅ | Public URL for client-facing portal links |
| `QBO_CLIENT_ID` | Optional | QuickBooks OAuth client ID (required for QBO sync) |
| `QBO_REDIRECT_URI` | Optional | QuickBooks OAuth redirect URI |
| `CARMD_API_KEY` | Optional | CarMD API key for real labor estimates (falls back to lexicon data) |
| `PARTS_CATALOG_API_URL` | Optional | Catalog provider URL for quick-specs lookups |
| `PARTS_CATALOG_API_KEY` | Optional | Catalog provider API key |
| `NEXT_PUBLIC_3D_MODEL_URL` | Optional | URL or path to bundled 3D vehicle model (defaults to `/models/car.glb`) |

### Production Gating

All mock data, demo credentials, and simulated integrations are **gated behind
`NODE_ENV !== 'production'`**. In production:

- **Parts supplier API** (`supplier-api.ts`): Throws at import time if
  credentials are missing. Makes real OAuth + REST calls to the supplier.
- **Parts bridge** (`parts-bridge.ts`): Throws `PartsBridgeError` instead of
  returning dev fallback tokens or mock catalogue results.
- **Parts catalog** (`parts-catalog.ts`): Throws if `PARTS_CATALOG_API_URL` is
  not set. Calls the real catalog API otherwise.
- **Labor engine** (`labor-engine.ts`): Uses real CarMD API when
  `CARMD_API_KEY` is configured. Returns `source: 'none'` in production
  without the key (no silent fallback to static estimates).
- **QuickBooks** (`qbo/actions.ts`): Returns descriptive error messages instead
  of mock accounts. Demo invoice IDs are never generated.
- **Voice logger** (`voice-logger-fab.tsx`): Uses the real Web Speech API for
  browser-based speech-to-text. Falls back gracefully when the API is
  unavailable (user can type manually).
- **Glovebox receipts** (`GloveboxClient.tsx`): Calls the PDF generation API.
  Falls back to text receipt only if the API endpoint is unreachable.
- **3D vehicle viewer** (`3d-vehicle-viewer.tsx`): Uses
  `NEXT_PUBLIC_3D_MODEL_URL` or the bundled `/models/car.glb` path in
  production. External CDN demo models are only used in development.
- **SMS preview** (`QuoteSendClient.tsx`): Shows a masked token placeholder
  (`••••••••-••••-…`) instead of a fake UUID.
- **Marketing hero** (`HeroSection.tsx`): Uses illustrative dashboard data
  (intentional marketing content — not operational mock data).
- **Tax presets** (`settings/tax/page.tsx`): Curated US state tax reference
  data sourced from published revenue codes (not mock data).

### Self-Hosting Checklist

1. Set all required environment variables (see table above).
2. Run `npx prisma generate && npm run build`.
3. Verify the build succeeds without errors.
4. Configure QuickBooks OAuth if accounting sync is needed.
5. Place a bundled 3D model at `public/models/car.glb` or set
   `NEXT_PUBLIC_3D_MODEL_URL`.
6. Run `npm start` to launch the production server.
