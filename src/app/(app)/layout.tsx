import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Subscription guard — blocks PAST_DUE tenants from all pages except /settings/billing
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "";

/** Paths that are always accessible, even when the subscription is past due. */
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
  // Read the current pathname from headers (set by Next.js middleware / server)
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  // Only enforce the guard when the tenant's account is past due.
  if (!pathname.startsWith(BILLING_PATH)) {
    const status = await getSubscriptionStatus();

    if (status === "PAST_DUE") {
      redirect(BILLING_PATH);
    }
  }

  return <>{children}</>;
}
