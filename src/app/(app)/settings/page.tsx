import Link from "next/link";

export const metadata = {
  title: "Settings — DriveSync",
};

const SETTINGS_ITEMS = [
  {
    href: "/settings/billing",
    icon: "💳",
    title: "Billing & Subscription",
    description: "Manage your DriveSync Pro plan and invoices.",
  },
  {
    href: "/accounting/qbo",
    icon: "📚",
    title: "QuickBooks Online",
    description: "Sync work orders directly into your QuickBooks account.",
  },
  {
    href: "/settings/integrations",
    icon: "🔗",
    title: "Integrations",
    description: "Connect Google Business, Twilio voice, and more.",
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-20">
      <h1 className="text-2xl font-black text-white tracking-tight mb-1">
        Settings
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        Configure your DriveSync workspace.
      </p>

      <div className="space-y-3">
        {SETTINGS_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors group"
          >
            <span className="text-3xl">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white group-hover:text-brand-400 transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
            </div>
            <span className="text-gray-600 group-hover:text-gray-400 transition-colors">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
