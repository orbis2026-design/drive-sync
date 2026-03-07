# DriveSync

> **Mobile-first, offline-capable CRM and quoting engine for solo automotive technicians.**

DriveSync is a SaaS PWA that lets an independent mechanic run their entire shop from a phone — writing quotes, capturing pre-inspection walkaround photos, collecting digital signatures, and processing payments — even when the job site has no signal.

---

## Table of Contents

1. [What & Why](#what--why)
2. [Core Design Choices](#core-design-choices)
3. [Tech Stack](#tech-stack)
4. [Local Development Setup](#local-development-setup)

---

## What & Why

Independent automotive technicians lose revenue in two ways: **paperwork overhead** and **connectivity gaps** at the job site. DriveSync eliminates both.

| Problem | DriveSync Solution |
|---|---|
| Quotes written on paper, frequently lost | Digital quoting with client e-signature portal |
| No internet at a parking lot repair | Full offline PWA — syncs when back online |
| Expensive OEM data APIs called on every lookup | Global Lexicon cache — fetch once, reuse forever |
| Media uploads billed by egress bandwidth | Cloudflare R2 — zero egress cost for downloads |
| Fleet accounts scattered across text threads | Fleet CRM with batch Net-30 invoice generation |

---

## Core Design Choices

### 1 · Global Lexicon (API Cost Avoidance)

Vehicle maintenance schedules, TSBs, and VIN-decoded engine data are fetched from the CarMD API **once** and persisted in the `GlobalVehicles` table. Subsequent lookups for the same make/model/year hit the local Postgres row instead of the paid API, reducing external API calls to near-zero at scale.

The extraction endpoint (`/api/lexicon/extract`) is protected by a `LEXICON_SECRET` bearer token so only an authenticated cron job can trigger a re-sync.

### 2 · Zero-Egress Media (Cloudflare R2)

Pre-inspection walkaround photos, digital signatures, and OCR receipts are stored in **Cloudflare R2**. Unlike AWS S3, R2 charges **$0 for egress** — meaning serving photos to the client portal costs nothing in bandwidth fees. Upload is done via server-generated pre-signed PUT URLs, so the R2 credentials never touch the browser.

### 3 · Offline-First PWA (Dexie.js)

The technician's view is a full Progressive Web App backed by **Dexie.js** (IndexedDB wrapper). Work orders are written to local IndexedDB first, then the `useOfflineSync` hook replays them to `/api/sync` when connectivity resumes. The server rotates a `versionHash` UUID on every mutation; if the server's hash differs from the local copy the app shows a `SyncConflictModal` before overwriting, preventing lost data.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) | SSR pages, API routes, Server Actions |
| **Styling** | Tailwind CSS | Utility-first responsive UI |
| **Database / Auth** | Supabase (Postgres + Auth) | Multi-tenant data, RLS, Realtime |
| **ORM** | Prisma | Type-safe DB queries & migrations |
| **Storage** | Cloudflare R2 | Zero-egress media storage |
| **Payments** | Stripe | Subscriptions, BNPL checkout, webhooks |
| **Offline** | Dexie.js (IndexedDB) | Offline-first work order sync |
| **AI / OCR** | OpenAI GPT-4o Vision | Receipt OCR, vehicle damage analysis |
| **Automotive APIs** | CarMD | VIN decode, maintenance schedules, TSBs |
| **SMS** | Twilio | Quote delivery, review requests, text-back |
| **Hosting** | Hetzner VPS + Coolify | Self-hosted Docker deployments |

---

## Local Development Setup

### Prerequisites

- Node.js ≥ 20
- Docker Desktop (for the local Supabase stack)
- Supabase CLI (`npm install -g supabase`)

### 1 · Clone & Install

```bash
git clone git@github.com:orbis2026-design/drive-sync.git
cd drive-sync
npm install
```

### 2 · Environment Variables

Copy the example file and fill in your keys (see [`docs/ENV_SETUP.md`](docs/ENV_SETUP.md) for the full provisioning guide):

```bash
cp .env.example .env.local
```

### 3 · Start the Local Supabase Stack

```bash
npx supabase start
```

This boots Postgres, the Auth server, and the Supabase Studio dashboard locally via Docker. The CLI will print the local `SUPABASE_URL` and `SUPABASE_ANON_KEY` — paste those into `.env.local`.

### 4 · Generate the Prisma Client & Start the Dev Server

```bash
npx prisma generate
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### 5 · Apply Database Migrations

```bash
npx supabase db push
```

---

## Further Reading

| Document | Description |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Database schema diagrams, RBAC rules, Wrench Loop lifecycle, API adapter pattern |
| [`docs/ENV_SETUP.md`](docs/ENV_SETUP.md) | Complete `.env.example` template and third-party account provisioning guide |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Step-by-step production deployment to Hetzner VPS via Coolify |
