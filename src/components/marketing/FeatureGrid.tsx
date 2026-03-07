/**
 * FeatureGrid.tsx
 *
 * Four-column feature grid highlighting DriveSync's core superpowers.
 * Rugged tool-brand aesthetic: Milwaukee Red / DeWalt Yellow accents on dark zinc.
 */

type Feature = {
  icon: string;
  accent: string;
  border: string;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: "🔬",
    accent: "text-red-400",
    border: "border-red-800/40",
    title: "AI Vision Diagnostics",
    description:
      "Point your camera at any engine bay, OBD port, or part number. Instant OCR-powered identification with linked TSBs and repair steps — no more squinting at VIN stickers.",
  },
  {
    icon: "📖",
    accent: "text-yellow-400",
    border: "border-yellow-700/40",
    title: "The Global Lexicon",
    description:
      "Auto-fluid capacities, OEM oil weights, and maintenance intervals for thousands of make/model/year combos — pre-loaded so you never have to look them up again.",
  },
  {
    icon: "💬",
    accent: "text-blue-400",
    border: "border-blue-800/40",
    title: "Native SMS Handoffs",
    description:
      "One tap sends the customer a signed quote link via their native Messages app. No third-party app required — just sms: deep-links that work on every device.",
  },
  {
    icon: "💳",
    accent: "text-green-400",
    border: "border-green-800/40",
    title: "Driveway POS",
    description:
      "Collect card, BNPL (Affirm/Klarna), or cash right from a customer's driveway. Stripe-powered with auto-invoicing, Net-30 fleet billing, and QuickBooks sync.",
  },
];

export function FeatureGrid() {
  return (
    <section className="bg-gray-950 px-4 py-20">
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <div className="mb-12 text-center">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gray-500">
            Built for the field
          </span>
          <h2 className="text-3xl font-black text-white sm:text-4xl">
            Your four unfair advantages
          </h2>
        </div>

        {/* Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border ${f.border} bg-gray-900/70 p-6 backdrop-blur-sm`}
            >
              <span className="text-4xl">{f.icon}</span>
              <h3 className={`mt-3 text-lg font-bold ${f.accent}`}>
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
