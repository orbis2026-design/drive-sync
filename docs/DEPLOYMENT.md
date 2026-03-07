# DriveSync — Production Deployment Playbook

> Step-by-step guide for deploying DriveSync to a Hetzner VPS using Coolify, connecting it to GitHub, routing the Spaceship domain, and pushing the production database schema.

---

## Table of Contents

1. [Server Provisioning (Hetzner)](#server-provisioning-hetzner)
2. [Install Coolify](#install-coolify)
3. [GitHub Integration](#github-integration)
4. [Configure the DriveSync Application](#configure-the-drivesync-application)
5. [Domain Routing (Spaceship DNS)](#domain-routing-spaceship-dns)
6. [Supabase Production Migrations](#supabase-production-migrations)
7. [Post-Deployment Checklist](#post-deployment-checklist)

---

## Server Provisioning (Hetzner)

### Recommended Server Specification

| Attribute | Minimum | Recommended |
|---|---|---|
| **OS** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| **CPU** | 2 vCPU | 4 vCPU |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 40 GB SSD | 80 GB SSD |
| **Network** | 1 Gbps | 1 Gbps |

> **Note:** Media files (photos, signatures) are stored in Cloudflare R2, so the VPS disk is used only for Docker images and application logs. 40 GB is sufficient.

### Steps

1. Log in to [hetzner.com/cloud](https://www.hetzner.com/cloud) and create a new project.
2. Click **Add Server** and select:
   - **Location:** choose the region closest to your customer base (e.g., Ashburn, US for North America).
   - **Image:** Ubuntu 22.04 or 24.04 LTS.
   - **Type:** CPX21 (3 vCPU / 4 GB RAM) or larger.
3. Add your **SSH public key** during server creation (required for Coolify).
4. Note the server's **public IPv4 address** — you will need it for DNS configuration.

### Initial Server Hardening (optional but recommended)

```bash
# Connect to the server
ssh root@<YOUR_HETZNER_IP>

# Update packages
apt update && apt upgrade -y

# Set the hostname
hostnamectl set-hostname drivesync-prod

# Allow SSH, HTTP, and HTTPS through the firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## Install Coolify

Coolify is an open-source Heroku/Netlify alternative that manages Docker containers, SSL certificates, and reverse-proxy routing on your own VPS.

### Installation Command

Run the following single command on the Hetzner server as `root`:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

The installer will:
- Install Docker and Docker Compose.
- Pull the Coolify stack (Traefik reverse proxy + Coolify dashboard).
- Configure automatic Let's Encrypt SSL certificates.
- Start the Coolify service.

### Access the Coolify Dashboard

After installation completes (≈ 2 minutes), navigate to:

```
http://<YOUR_HETZNER_IP>:8000
```

Complete the initial admin setup wizard (create an admin email/password). Coolify will then be available at this address until you point a domain to it.

---

## GitHub Integration

Coolify deploys applications directly from a GitHub repository using a **GitHub App** integration, enabling automatic deployments on every `git push`.

### Steps

1. In the Coolify dashboard, go to **Sources** → **Add a new Source**.
2. Select **GitHub App** and click **Register a GitHub App**.
3. Follow the OAuth flow to authorise Coolify on your GitHub account or organisation.
4. Grant the GitHub App access to the `orbis2026-design/drive-sync` repository (or **All repositories** if preferred).
5. Coolify will store the installation credentials — your repository is now available as a source.

### Create a New Application in Coolify

1. Go to **Projects** → **New Project** → name it `drivesync-prod`.
2. Click **New Resource** → **Application**.
3. Select **GitHub App** as the source and choose the `drive-sync` repository.
4. Set the **branch** to `main` (or your production branch).
5. Set the **Build Pack** to `Nixpacks` (auto-detects Next.js) or **Dockerfile** if using a custom image.
6. Set the **Port** to `3000` (the Next.js default).

### Automatic Deployments

Coolify installs a webhook in the GitHub repository. Every push to the configured branch triggers:

1. A fresh `git pull` on the server.
2. A Docker image build (`npm run build` inside the container).
3. A zero-downtime container swap.

No manual SSH access is needed for routine deployments.

---

## Configure the DriveSync Application

### Environment Variables

In the Coolify application settings, navigate to **Environment Variables** and add every variable from the `.env.example` template (see [`docs/ENV_SETUP.md`](ENV_SETUP.md)).

Key production values to update:

| Variable | Production Value |
|---|---|
| `NEXT_PUBLIC_PORTAL_BASE_URL` | `https://yourdomain.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Your production Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your production service role key |
| `STRIPE_WEBHOOK_SECRET` | Webhook secret from your **production** Stripe endpoint |

### Build Command Override (if needed)

If Coolify's auto-detection does not run `prisma generate`, add a custom build command:

```bash
npx prisma generate && npm run build
```

---

## Domain Routing (Spaceship DNS)

### Required DNS Records

Log in to your Spaceship domain registrar dashboard and add the following records for your domain (e.g., `drivesync.app`):

| Type | Host | Value | TTL |
|---|---|---|---|
| `A` | `@` | `<YOUR_HETZNER_IP>` | 300 |
| `A` | `www` | `<YOUR_HETZNER_IP>` | 300 |
| `CNAME` | `app` | `yourdomain.com` | 300 |

> Replace `<YOUR_HETZNER_IP>` with the IPv4 address of your Hetzner server.

**`@`** maps the root domain (`drivesync.app`) to the server.  
**`www`** maps the `www` subdomain.  
**`app`** (optional) maps a subdomain for the application if you want to separate the marketing site from the app.

### Propagation

DNS propagation typically takes **5–30 minutes** (up to 48 hours in rare cases). You can check propagation status at [dnschecker.org](https://dnschecker.org).

### SSL Certificate

Once DNS propagates and Coolify receives an HTTP request on port 80 for your domain, it automatically provisions a free **Let's Encrypt** TLS certificate via Traefik and begins serving HTTPS traffic. No manual certificate management is needed.

### Configure the Domain in Coolify

In the Coolify application settings:

1. Go to **Domains**.
2. Enter your domain: `https://yourdomain.com`.
3. Coolify updates the Traefik router rules automatically.

---

## Supabase Production Migrations

The local Supabase CLI is used to push database schema changes and RLS policies to the production Supabase project.

### Prerequisites

Install the Supabase CLI if you haven't already:

```bash
npm install -g supabase
```

### Step 1 — Log In to Supabase

```bash
npx supabase login
```

This opens a browser window to authenticate with your Supabase account.

### Step 2 — Link to the Production Project

Find your production **Project Reference ID** in the Supabase Dashboard under **Settings → General → Reference ID**.

```bash
supabase link --project-ref <YOUR_PROJECT_REF_ID>
```

You will be prompted for the database password you set when creating the Supabase project.

### Step 3 — Push Migrations to Production

This command runs all pending migration files in `supabase/migrations/` against the production database, applying new tables, columns, enum values, and RLS policies:

```bash
supabase db push
```

> **⚠️ Warning:** This is a one-way operation against the live database. Always back up the production database before running `db push` in a project with existing user data.

### Step 4 — Verify Migrations

After pushing, confirm the migrations applied successfully:

```bash
supabase migration list
```

All migration files should show a `APPLIED` status in the output.

### Ongoing Deployments

For subsequent schema changes, add new SQL files to `supabase/migrations/` with the naming convention `YYYYMMDDHHMMSS_description.sql` and repeat Step 3. The CLI tracks which migrations have already been applied and only runs new ones.

---

## Post-Deployment Checklist

Run through this checklist after every production deployment:

- [ ] Application loads at `https://yourdomain.com` with a valid SSL certificate.
- [ ] Supabase Dashboard → Authentication → Users shows the production auth provider is active.
- [ ] Stripe Dashboard → Developers → Webhooks → your endpoint shows `200` responses for recent events.
- [ ] Upload a test photo in the pre-inspection walkaround to confirm R2 storage is working.
- [ ] Send a test quote SMS to confirm Twilio is connected.
- [ ] Trigger a test Stripe checkout and confirm the `PAID` status transition fires correctly.
- [ ] Verify the `/api/lexicon/extract` endpoint requires the `LEXICON_SECRET` bearer token (returns `401` without it).
- [ ] Check Sentry (or your error monitoring) for any startup errors in the first deploy.
