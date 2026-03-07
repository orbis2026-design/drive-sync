"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
interface NavTab {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

// Inline SVG icons — no dependency on an icon library.
function ClientsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ScanVinIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Scanner frame corners */}
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      {/* Barcode lines */}
      <line x1="7"  y1="8"  x2="7"  y2="16" />
      <line x1="10" y1="8"  x2="10" y2="16" />
      <line x1="12" y1="8"  x2="12" y2="16" strokeWidth={3} />
      <line x1="15" y1="8"  x2="15" y2="16" />
      <line x1="17" y1="8"  x2="17" y2="16" />
    </svg>
  );
}

function ActiveJobsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function MarketingIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function AnalyticsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function InventoryIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function AccountingIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

const ALL_TABS: (NavTab & { featureKey?: string })[] = [
  { href: "/clients",    label: "Clients",      icon: ClientsIcon    },
  { href: "/scan",       label: "Scan VIN",     icon: ScanVinIcon    },
  { href: "/jobs",       label: "Active Jobs",  icon: ActiveJobsIcon },
  { href: "/calendar",   label: "Calendar",     icon: CalendarIcon   },
  { href: "/inventory",  label: "Inventory",    icon: InventoryIcon,  featureKey: "inventory" },
  { href: "/marketing",  label: "Marketing",    icon: MarketingIcon,  featureKey: "marketing" },
  { href: "/analytics",  label: "Financials",   icon: AnalyticsIcon  },
  { href: "/accounting", label: "Accounting",   icon: AccountingIcon },
  { href: "/settings",   label: "Settings",     icon: SettingsIcon   },
];

const LS_FEATURES_KEY = "ds_features";

function loadNavFeatures(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_FEATURES_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    // ignore
  }
  return {};
}

// ---------------------------------------------------------------------------
// MobileNav — Bottom Tab Bar (mobile) / Left Sidebar (desktop)
// ---------------------------------------------------------------------------
export function MobileNav() {
  const pathname = usePathname();
  const [features, setFeatures] = useState<Record<string, boolean>>(() =>
    typeof window !== "undefined" ? loadNavFeatures() : {}
  );

  useEffect(() => {
    // Re-read features when they are updated (e.g. from the preferences page)
    function handleStorage(e: StorageEvent) {
      if (e.key === LS_FEATURES_KEY) {
        setFeatures(loadNavFeatures());
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const TABS = ALL_TABS.filter((tab) => {
    if (!tab.featureKey) return true;
    // Default to showing the tab if the feature hasn't been explicitly disabled
    return features[tab.featureKey] !== false;
  });

  return (
    <nav
      aria-label="Main navigation"
      className={[
        // Mobile: fixed bottom bar, full width
        "fixed bottom-0 left-0 right-0 z-50",
        "flex flex-row",
        "bg-gray-900 border-t border-gray-700",
        // Safe area padding for iPhone home indicator
        "pb-[env(safe-area-inset-bottom)]",
        // Desktop: static left sidebar
        "sm:static sm:flex-col sm:h-full sm:w-20 sm:border-t-0 sm:border-r sm:border-gray-700 sm:pb-0",
        "lg:w-56",
      ].join(" ")}
    >
      {/* Brand mark — only visible on desktop sidebar */}
      <div className="hidden sm:flex sm:items-center sm:justify-center sm:h-16 sm:border-b sm:border-gray-700 lg:justify-start lg:px-4">
        <span className="text-yellow-400 font-bold text-lg tracking-tight lg:text-xl">
          DS
        </span>
        <span className="hidden lg:inline ml-2 text-white font-semibold text-lg tracking-tight">
          DriveSync
        </span>
      </div>

      {/* Tab items */}
      <ul className="flex flex-1 flex-row sm:flex-col" role="list">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");

          return (
            <li key={tab.href} className="flex-1 sm:flex-none">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  // Base — large touch target
                  "flex flex-col items-center justify-center gap-1",
                  "min-h-[48px] w-full py-2 px-1",
                  // Desktop rail layout
                  "sm:flex-row sm:justify-center sm:gap-3 sm:px-3 sm:py-4",
                  "lg:justify-start lg:px-4",
                  // Typography
                  "text-[10px] font-semibold uppercase tracking-wide sm:text-xs lg:text-sm",
                  // Color states
                  isActive
                    ? "text-yellow-400 bg-gray-800"
                    : "text-gray-400 hover:text-white hover:bg-gray-800",
                  // Focus ring
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-inset",
                ].join(" ")}
              >
                <tab.icon
                  className={[
                    "h-6 w-6 flex-shrink-0",
                    isActive ? "text-yellow-400" : "text-gray-400",
                  ].join(" ")}
                />
                <span className="leading-none sm:hidden lg:inline">
                  {tab.label}
                </span>
                {/* Tooltip-style label on the sm sidebar only (no text shown) */}
                <span className="sr-only sm:not-sr-only sm:hidden lg:hidden">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
