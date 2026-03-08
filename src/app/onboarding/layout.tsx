import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/auth/register");
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("subscription_status")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!tenant) {
    redirect("/checkout");
  }

  if (tenant.subscription_status !== "ACTIVE") {
    redirect("/checkout");
  }

  return <>{children}</>;
}
