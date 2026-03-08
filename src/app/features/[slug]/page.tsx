import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURE_PAGES } from "@/lib/marketing-content";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return FEATURE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = FEATURE_PAGES.find((p) => p.slug === slug);
  if (!page) return {};
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      type: "website",
    },
  };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = FEATURE_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DriveSync",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description: page.metaDescription,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "14-day free trial",
    },
    url: `https://drivesync.app/features/${page.slug}`,
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <>
      {/* JSON-LD Schemas */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="min-h-screen bg-gray-950 text-white">
        {/* Sticky CTA bar */}
        <div className="sticky top-0 z-40 flex items-center justify-center bg-red-600 px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
          <Link
            href="/auth/register"
            className="hover:underline"
          >
            Start 14-Day Free Trial →
          </Link>
        </div>

        {/* Hero */}
        <section className="relative overflow-hidden px-4 py-20 text-center sm:py-28">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="h-[420px] w-[420px] rounded-full bg-red-700/10 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-3xl">
            <span className="text-6xl" aria-hidden="true">
              {page.icon}
            </span>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
              {page.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-gray-400">
              {page.subheadline}
            </p>
            <div className="mt-8">
              <Link
                href="/auth/register"
                className="inline-flex min-h-[52px] min-w-[220px] items-center justify-center rounded-2xl bg-red-600 px-8 py-3 text-base font-black tracking-wide text-white shadow-xl shadow-red-900/40 transition-all hover:bg-red-500 active:scale-95"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </section>

        {/* Key Benefits */}
        <section className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="mb-6 text-2xl font-black text-white">
            Why mechanics choose DriveSync
          </h2>
          <ol className="space-y-3">
            {page.keyBenefits.map((benefit, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-black text-white">
                  {i + 1}
                </span>
                <span className="pt-1 text-base text-gray-300">{benefit}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ARI Comparison callout */}
        <section className="mx-auto max-w-3xl px-4 py-6">
          <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-start gap-4">
              <span className="text-3xl" aria-hidden="true">
                ⚔️
              </span>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">
                  DriveSync vs ARI
                </p>
                <p className="text-base font-semibold text-white">
                  {page.comparisonPoint}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="mb-6 text-2xl font-black text-white">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {page.faqItems.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl border border-gray-800 bg-gray-900 open:border-red-800/50"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-white">
                  {item.q}
                  <span
                    className="text-gray-500 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-gray-400">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-red-600 px-4 py-16 text-center">
          <h2 className="mb-2 text-3xl font-black text-white sm:text-4xl">
            Ready to replace ARI?
          </h2>
          <p className="mb-8 text-base text-red-100">
            Join thousands of mobile mechanics who switched to DriveSync.
          </p>
          <Link
            href="/auth/register"
            className="inline-flex min-h-[52px] min-w-[240px] items-center justify-center rounded-2xl bg-white px-8 py-3 text-base font-black text-red-600 shadow-xl transition-all hover:bg-red-50 active:scale-95"
          >
            Start 14-Day Free Trial
          </Link>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-800 bg-gray-950 px-4 py-8 text-center text-xs text-gray-600">
          <p className="mb-1 font-bold text-gray-500">
            Drive<span className="text-red-500">Sync</span>
          </p>
          <p>© {new Date().getFullYear()} DriveSync · All rights reserved</p>
        </footer>
      </div>
    </>
  );
}
