# DriveSync — Environment & API Key Ledger

> This document is the authoritative ledger of every third-party account and environment variable required to run DriveSync. Treat it as a checklist when provisioning a new environment.

---

## Table of Contents

1. [`.env.example` Template](#envexample-template)
2. [Account Provisioning Guide](#account-provisioning-guide)
3. [⚠️ Critical Security Warning](#️-critical-security-warning)

---

## `.env.example` Template

Copy this block into a file named `.env.local` (local development) or load it as environment variables in your Coolify project (production). **Leave all values empty in version control — never commit real secrets.**

```bash
# =============================================================================
# DriveSync — Environment Variables
# Copy to .env.local and fill in your values.
# See docs/ENV_SETUP.md for provisioning instructions.
# =============================================================================

# -----------------------------------------------------------------------------
# Supabase
# -----------------------------------------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# -----------------------------------------------------------------------------
# Stripe
# -----------------------------------------------------------------------------
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# -----------------------------------------------------------------------------
# Cloudflare R2
# -----------------------------------------------------------------------------
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=drive-sync-media
NEXT_PUBLIC_R2_DEV_URL=

# -----------------------------------------------------------------------------
# OpenAI (Vision / OCR)
# -----------------------------------------------------------------------------
OPENAI_API_KEY=

# -----------------------------------------------------------------------------
# Automotive APIs — CarMD
# -----------------------------------------------------------------------------
CARMD_API_KEY=
CARMD_PARTNER_TOKEN=

# -----------------------------------------------------------------------------
# Twilio (SMS)
# -----------------------------------------------------------------------------
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# -----------------------------------------------------------------------------
# Application
# -----------------------------------------------------------------------------
# Base URL of the deployed app (used to build portal and SMS links)
NEXT_PUBLIC_PORTAL_BASE_URL=http://localhost:3000

# Secret token that authorises the /api/lexicon/extract cron endpoint
LEXICON_SECRET=

# Demo tenant ID used by the jobs board (optional in production)
DEMO_TENANT_ID=
```

---

## Account Provisioning Guide

### Supabase

**What it does:** Provides the Postgres database, authentication (email/password + passkeys), Row Level Security enforcement, and Realtime subscriptions.

| Variable | Where to Find It |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project → Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project → Settings → API → **anon / public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project → Settings → API → **service_role** key |

**Steps:**
1. Create a free account at [supabase.com](https://supabase.com).
2. Create a new project (choose a region close to your Hetzner VPS).
3. Copy the three values above from **Settings → API**.

---

### Stripe

**What it does:** Handles shop subscription billing, client BNPL (Buy Now Pay Later) checkout, fleet Net-30 batch invoicing, and payment webhooks.

| Variable | Where to Find It |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → **Secret key** |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → (your endpoint) → **Signing secret** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys → **Publishable key** |

**Steps:**
1. Create an account at [stripe.com](https://stripe.com).
2. In the Stripe Dashboard, go to **Developers → API Keys** and copy the Secret and Publishable keys.
3. Register a webhook endpoint pointing to `https://yourdomain.com/api/stripe/webhook`. Enable the following events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** shown after saving the webhook endpoint.

---

### Cloudflare R2

**What it does:** Zero-egress object storage for pre-inspection walkaround photos, digital signatures, and OCR receipt images. Serves media to the client portal with no bandwidth fees.

| Variable | Where to Find It |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare Dashboard → right-hand sidebar → **Account ID** |
| `R2_ACCESS_KEY_ID` | Cloudflare Dashboard → R2 → **Manage R2 API Tokens** → Create Token → Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Same token creation flow → Secret Access Key (shown once) |
| `R2_BUCKET_NAME` | Name of the R2 bucket you create (default: `drive-sync-media`) |
| `NEXT_PUBLIC_R2_DEV_URL` | Cloudflare Dashboard → R2 → your bucket → **Settings** → Public R2.dev subdomain URL |

**Steps:**
1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com) and navigate to **R2 Object Storage**.
2. Create a bucket (e.g., `drive-sync-media`). Enable **Public Access** if you want to serve media without pre-signed URLs.
3. Go to **Manage R2 API Tokens** and create a token with **Object Read & Write** permission scoped to your bucket.
4. Copy the Access Key ID and Secret Access Key (the secret is only shown once).
5. Copy the public R2.dev subdomain URL from the bucket's **Settings** tab.

---

### OpenAI

**What it does:** Powers two AI features — receipt OCR (extracting line items from a photo of a parts receipt) and the Vision Diagnostics scanner (analysing photos of damaged or worn vehicle components).

| Variable | Where to Find It |
|---|---|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys → **Create new secret key** |

**Steps:**
1. Create an account at [platform.openai.com](https://platform.openai.com).
2. Navigate to **API Keys** and create a new secret key.
3. Set a usage limit under **Billing → Usage limits** to prevent unexpected charges.

---

### Automotive APIs — CarMD

**What it does:** Provides VIN decode, OEM maintenance schedules, and Technical Service Bulletins (TSBs). Data is cached in the `GlobalVehicles` table via the Lexicon strategy, so API calls are minimised to one per unique make/model/year.

| Variable | Where to Find It |
|---|---|
| `CARMD_API_KEY` | [api.carmd.com](https://api.carmd.com) → Developer Portal → My Apps → API Key |
| `CARMD_PARTNER_TOKEN` | CarMD Developer Portal → My Apps → Partner Token |

**Steps:**
1. Register for a developer account at [api.carmd.com](https://api.carmd.com).
2. Create an application to obtain your **API Key** and **Partner Token**.
3. Both headers are required on every CarMD request (`content-api-key` and `partner-token`).

---

### Twilio (SMS)

**What it does:** Sends quote approval links to clients, automated Google review requests after `PAID` status, and handles missed-call text-back via the Twilio voice webhook.

| Variable | Where to Find It |
|---|---|
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) → Dashboard → **Account SID** |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Dashboard → **Auth Token** |
| `TWILIO_PHONE_NUMBER` | Twilio Console → Phone Numbers → Manage → your purchased number |

---

## ⚠️ Critical Security Warning

### Variables That Must NEVER Use `NEXT_PUBLIC_` Prefix

Any environment variable prefixed with `NEXT_PUBLIC_` is **bundled into the client-side JavaScript** and sent to every visitor's browser. This is appropriate only for non-secret configuration values.

The following variables must **never** be prefixed with `NEXT_PUBLIC_`:

| Variable | Why It Must Stay Server-Only |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses all Row Level Security policies. Leaking this gives anyone admin access to your entire database. |
| `STRIPE_SECRET_KEY` | Can create charges, issue refunds, and access all financial data on your Stripe account. |
| `STRIPE_WEBHOOK_SECRET` | Can be used to forge Stripe webhook events, enabling fraudulent payment confirmations. |
| `R2_ACCESS_KEY_ID` | Grants write access to your R2 bucket; attacker could delete all media or exfiltrate data. |
| `R2_SECRET_ACCESS_KEY` | Same as above — full R2 bucket control. |
| `OPENAI_API_KEY` | Would allow anyone to run unlimited AI inference billed to your account. |
| `CARMD_API_KEY` | Billable API key; exposure leads to quota theft. |
| `CARMD_PARTNER_TOKEN` | Same as above. |
| `TWILIO_AUTH_TOKEN` | Can send SMS messages or make calls billed to your account. |
| `LEXICON_SECRET` | Protects the lexicon extraction cron endpoint from unauthorised triggers. |

**Safe for `NEXT_PUBLIC_` prefix (non-secret configuration):**
- `NEXT_PUBLIC_SUPABASE_URL` — the public project URL, not a secret
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — scoped by RLS; safe to expose
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — designed to be public
- `NEXT_PUBLIC_R2_DEV_URL` — a public CDN base URL
- `NEXT_PUBLIC_PORTAL_BASE_URL` — public domain configuration
