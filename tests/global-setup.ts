/**
 * tests/global-setup.ts
 *
 * Issue #71 — Playwright Global Setup
 *
 * Runs once before the entire test suite. Programmatically authenticates a
 * test FIELD_TECH user via Supabase Auth and saves the browser storage state
 * (cookies + localStorage) to `tests/.auth/field-tech.json`. Every subsequent
 * spec that uses the default `storageState` from `playwright.config.ts` will
 * skip the login screen entirely.
 *
 * Required environment variables (may be stubs in CI):
 *   NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon key
 *   E2E_FIELD_TECH_EMAIL          — test account email  (default: field.tech@test.local)
 *   E2E_FIELD_TECH_PASSWORD       — test account password (default: Test1234!)
 *   PLAYWRIGHT_BASE_URL           — app base URL        (default: http://localhost:3000)
 */

import { chromium, type FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const STORAGE_STATE_PATH = path.join(__dirname, ".auth", "field-tech.json");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const EMAIL =
  process.env.E2E_FIELD_TECH_EMAIL ?? "field.tech@test.local";
const PASSWORD =
  process.env.E2E_FIELD_TECH_PASSWORD ?? "Test1234!";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Ensure the output directory exists.
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });

  // If Supabase credentials are stubs (CI without a real DB), write an empty
  // storage state so specs can still run in degraded / auth-gated mode.
  if (
    !SUPABASE_URL ||
    SUPABASE_URL.includes("stub") ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes("stub")
  ) {
    console.log(
      "[global-setup] Supabase stubs detected — writing empty storage state.",
    );
    fs.writeFileSync(
      STORAGE_STATE_PATH,
      JSON.stringify({ cookies: [], origins: [] }),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Sign in via Supabase Auth REST API (no browser needed for the token itself).
  // We then inject the session into a browser context so Playwright captures
  // the resulting cookies/localStorage that the Next.js app expects.
  // ---------------------------------------------------------------------------

  let accessToken: string;
  let refreshToken: string;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.warn(
        `[global-setup] Supabase sign-in failed (${res.status}): ${body}`,
      );
      // Non-fatal: write empty state and let tests run behind the auth gate.
      fs.writeFileSync(
        STORAGE_STATE_PATH,
        JSON.stringify({ cookies: [], origins: [] }),
      );
      return;
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
  } catch (err) {
    console.warn(`[global-setup] Network error during Supabase sign-in:`, err);
    fs.writeFileSync(
      STORAGE_STATE_PATH,
      JSON.stringify({ cookies: [], origins: [] }),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Open a headless browser, navigate to the app and inject the Supabase
  // session so the Next.js client picks it up via localStorage.
  // ---------------------------------------------------------------------------

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await page.waitForLoadState("domcontentloaded");

  // Supabase stores the session in localStorage under a project-specific key.
  // The key format is: sb-<project-ref>-auth-token
  // We derive the project ref from the Supabase URL.
  const projectRef = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  await page.evaluate(
    ({ key, token, refresh }) => {
      const session = {
        access_token: token,
        refresh_token: refresh,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, token: accessToken, refresh: refreshToken },
  );

  // Reload so the app hydrates with the injected session.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  // Persist the authenticated browser state.
  await context.storageState({ path: STORAGE_STATE_PATH });

  await browser.close();

  console.log(
    `[global-setup] Storage state saved to ${STORAGE_STATE_PATH}`,
  );
}
