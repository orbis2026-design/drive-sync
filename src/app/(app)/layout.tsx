import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommandPaletteProvider } from "@/components/command-palette";

// ---------------------------------------------------------------------------
// Subscription guard — blocks PAST_DUE tenants from all pages except /settings/billing
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "";

/** Path that is always accessible, even when the subscription is past due. */
const BILLING_PATH = "/settings/billing";

async function getSubscriptionStatus(): Promise<string | null> {
  if (!DEMO_TENANT_ID) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tenants")
      .select("subscription_status")
      .eq("id", DEMO_TENANT_ID)
      .single();
    return data?.subscription_status ?? null;
  } catch {
    return null;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Next.js middleware injects the x-pathname header on every request.
  // We use it here to detect if the user is already on the billing page.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  // Allow the billing page to always render (prevents redirect loop).
  if (!pathname.startsWith(BILLING_PATH)) {
    const status = await getSubscriptionStatus();

    if (status === "PAST_DUE") {
      redirect(BILLING_PATH);
    }
  }

  return <CommandPaletteProvider>{children}</CommandPaletteProvider>;
}
