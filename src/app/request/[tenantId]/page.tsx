import type { Metadata } from "next";
import { IntakeClient } from "./IntakeClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata: Metadata = {
  title: "Request a Repair — DriveSync",
  description:
    "Submit a repair request directly to your local mechanic in minutes.",
};

// ---------------------------------------------------------------------------
// Public route — no authentication required.
// Uses the "Trustworthy" light-themed aesthetic.
// ---------------------------------------------------------------------------
export default async function IntakePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  return (
    // Light, trust-building aesthetic — white background, blue accents
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
          <h1 className="text-3xl font-black leading-tight">
            Request a Repair
          </h1>
          <p className="text-blue-100 text-sm leading-relaxed">
            Fill out this quick form and your local mechanic will reach out
            to schedule your appointment.
          </p>
        </div>
      </header>

      {/* Wizard body */}
      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full">
        <IntakeClient tenantId={tenantId} />
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
