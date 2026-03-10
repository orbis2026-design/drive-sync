# Tenant / Owner Storage & Data Philosophy

This document describes how tenant (shop) and owner (user) identity drive where data is stored and how the Clients list and intake flows stay consistent.

---

## 1. Tenant as the root of all app data

- **Tenant** = one mechanic shop subscription. Stored in `tenants` (Prisma: `Tenant`).
- Every row that belongs to “the app” is scoped by **tenant**:
  - `clients.tenant_id` → which shop owns this customer
  - `vehicles`, `work_orders`, etc. all carry `tenant_id`
- There is **no cross-tenant data**: the Clients list and all other app views filter by the current user’s tenant.

---

## 2. How the “current tenant” is determined

- **Logged-in app users** (shop staff): tenant comes from **Supabase `user_roles`**.
  - `user_roles.user_id` = Supabase Auth UID
  - `user_roles.tenant_id` = the tenant (shop) that user belongs to
  - `user_roles.role` = `SHOP_OWNER` | `FIELD_TECH` | `FLEET_CLIENT`
- **Server-side helpers** (used by pages and server actions):
  - `getTenantId()` — returns `user_roles.tenant_id` for the current session, or `null` if not logged in / no role
  - `verifySession()` — same source; throws if not authenticated or no tenant (used in server actions)
- **Public intake** (no login): tenant comes from the **URL**: `/request/[tenantId]`. The form submits with that `tenantId` so requests and new clients are created for that shop.

So:

- **In-app** (intake, Clients list, jobs, etc.): tenant = **session → `user_roles.tenant_id`**.
- **Public request form**: tenant = **route param `[tenantId]`**.

---

## 3. Where clients are created (and which tenant they get)

| Flow | Where | Tenant source | Notes |
|------|--------|----------------|--------|
| **App intake — Add new client** (decode VIN / intake) | `(app)/intake` → `createClient` in `client-search-actions.ts` | `verifySession().tenantId` (= `user_roles.tenant_id`) | Same tenant as the logged-in user. |
| **Public request form** | `request/[tenantId]` → `submitIntakeRequest` in `request/actions.ts` | `payload.tenantId` (from URL) | Tenant is validated against `tenants` before creating client/work order. |
| **Diagnostic intake** (in-app) | `(app)/intake/diagnostic/actions.ts` | `verifySession().tenantId` | Same as app intake. |

All of these set `clients.tenant_id` (Prisma: `tenantId`) to that tenant. There is no “owner” separate from tenant for client storage: **owner = tenant** (the shop that owns the client record).

---

## 4. How the Clients list is loaded

- **Page**: `(app)/clients/page.tsx`
- **Tenant**: `getTenantId()` (same as `user_roles.tenant_id` for the current user).
- **Query**: `prisma.client.findMany({ where: { tenantId }, ... })` with vehicles and maintenance data.
- **Caching**: Result is cached with `unstable_cache` (60s revalidate, tag `"clients"`). Cache is **per-tenant** (Next.js includes the `tenantId` argument in the cache key). If there is no tenant (e.g. no session), the list returns **empty** and no cross-tenant data is shown.

So the Clients list shows exactly the clients for the **same tenant** that `createClient` and the diagnostic/request flows use when they create clients for the logged-in shop or the public request URL.

---

## 5. Cache invalidation after creating clients

After any flow that creates (or upserts) a client, the clients list cache is invalidated so the next load shows the new client:

- `createClient` (app intake) → `revalidateTag("clients")` and `revalidatePath("/clients")`
- `submitIntakeRequest` (public request) → same
- Diagnostic actions that create clients → same

So newly added clients (from “add new client” / decode VIN / intake or from the public form) appear on the Clients page after the next load (or refresh). If you still don’t see them, check that you’re logged in as a user whose `user_roles.tenant_id` matches the tenant used when the client was created (same shop).

---

## 6. Quick reference

- **Tenant ID** in app: from **session → `user_roles.tenant_id`** (`getTenantId()` / `verifySession()`).
- **Tenant ID** on public request: from **URL** `request/[tenantId]`.
- **Clients** are always stored with `tenant_id` = that tenant; the **Clients** list filters by the same tenant.
- **Owner** in this codebase means the **tenant** (shop); there is no separate “owner” table for client storage.
