import type { Metadata } from "next";
import { HeroSection } from "@/components/marketing/HeroSection";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { PricingTable } from "@/components/marketing/PricingTable";

export const metadata: Metadata = {
  title: "DriveSync — Wrench More. Type Less.",
  description:
    "The complete operating system for solo mobile mechanics. Quotes, diagnostics, and payments in one app.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <HeroSection />
      <FeatureGrid />
      <PricingTable />

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-10 text-center text-xs text-gray-600">
        <p className="mb-1 font-bold text-gray-500">
          Drive<span className="text-red-500">Sync</span>
        </p>
        <p>© {new Date().getFullYear()} DriveSync · All rights reserved</p>
        <p className="mt-2">
          <a href="/auth/login" className="underline hover:text-gray-400">
            Sign in
          </a>
          {" · "}
          <a href="#pricing" className="underline hover:text-gray-400">
            Pricing
          </a>
        </p>
      </footer>
    </div>
  );
}
