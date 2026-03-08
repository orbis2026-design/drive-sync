import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplatePageClient } from "./TemplatePageClient";

// ---------------------------------------------------------------------------
// Template IDs and metadata
// ---------------------------------------------------------------------------

const META: Record<string, { title: string; description: string }> = {
  "california-bar-compliant-invoice": {
    title:
      "Free California BAR Compliant Auto Repair Invoice Template | DriveSync",
    description:
      "Download a free California Bureau of Automotive Repair (BAR) compliant invoice template. Meets all CA BAR requirements for auto repair shops.",
  },
  "diagnostic-authorization-waiver": {
    title: "Free Diagnostic Authorization Waiver Template | DriveSync",
    description:
      "Free diagnostic authorization waiver template for auto repair shops. Protect your shop legally before performing any diagnostic work.",
  },
  "pre-existing-damage-waiver": {
    title: "Free Pre-Existing Damage Waiver for Auto Repair | DriveSync",
    description:
      "Free pre-existing damage waiver template. Document vehicle condition before service begins to protect your shop from damage claims.",
  },
};

export function generateStaticParams() {
  return Object.keys(META).map((templateId) => ({ templateId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ templateId: string }>;
}): Promise<Metadata> {
  const { templateId } = await params;
  const meta = META[templateId];
  if (!meta) return {};
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "website",
    },
  };
}

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  if (!META[templateId]) notFound();
  return <TemplatePageClient templateId={templateId} />;
}
