import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingClient } from "./BookingClient";

export const metadata: Metadata = {
  title: "Book an Appointment — DriveSync",
  description: "Book a service appointment with your local mobile mechanic.",
};

export default async function BookingPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("name, phone")
    .eq("id", tenantId)
    .single();

  const shopName = tenant?.name ?? "Your Mechanic";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 px-6 pt-10 pb-8 text-white">
        <div className="max-w-lg mx-auto flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl font-black text-white tracking-tight">
              DS
            </span>
            <span className="text-white/80 font-medium">DriveSync</span>
          </div>
          <h1 className="text-3xl font-black leading-tight">Book a Service</h1>
          <p className="text-blue-100 text-sm leading-relaxed">
            Schedule an appointment with{" "}
            <span className="font-semibold text-white">{shopName}</span>. We
            come to you.
          </p>
        </div>
      </header>

      {/* Booking wizard */}
      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full">
        <BookingClient tenantId={tenantId} shopName={shopName} />
      </main>

      {/* Footer */}
      <footer className="py-6 px-6 border-t border-gray-100 text-center">
        <p className="text-xs text-gray-400">
          Powered by{" "}
          <span className="font-semibold text-blue-600">DriveSync</span> ·
          Your information is kept private and secure.
        </p>
      </footer>
    </div>
  );
}
