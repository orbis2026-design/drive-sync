# Prisma + Supabase

## One-time: drop FKs to auth.users

Run `drop-auth-fk.sql` once in the Supabase SQL Editor (or `psql $DATABASE_URL -f prisma/drop-auth-fk.sql`) so Prisma can run without the `auth` schema. The app still stores auth UIDs in the listed columns; only the DB-level foreign keys are removed.

## Schema vs database

The Prisma schema includes **user_roles**, **promo_codes**, and columns like **tenants.owner_user_id**, **tenants.onboarding_complete**, **global_vehicles.engine/trim/known_faults_json** so that `prisma db push` does not try to drop them.

The live database was created and evolved with **Supabase migrations** (UUID primary keys, Postgres enums, etc.). If `db push` still proposes **changing primary keys** (e.g. UUID → cuid), **dropping/recreating enums**, or **altering column types** (e.g. Decimal → Float), **do not apply those steps**—they can cause data loss or break the app. Prefer **Supabase migrations** for schema changes; use Prisma for querying and for generating the client.
