"use client";

/**
 * NavController — Role-Aware Navigation  (Issue #60)
 *
 * Renders the appropriate navigation shell based on the authenticated user's
 * RBAC role, which is resolved server-side and passed in as a prop:
 *
 *   FIELD_TECH   → "Wrench Loop" — mobile-first bar (Calendar, Scanner,
 *                  Active Job, Offline Sync queue). Financial analytics and
 *                  Net-Profit charts are hidden.
 *
 *   SHOP_OWNER   → "Command Center" — desktop sidebar (Kanban Dispatch,
 *                  Nexpart PO Approvals, Stripe Payouts, QA Inbox, full
 *                  financial analytics).
 *
 *   null / other → Falls back to the full SHOP_OWNER view (demo / un-authed).
 *
 * FLEET_CLIENT users are redirected by layout.tsx before this component is
 * rendered, so no case is needed for that role here.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/auth";

// ---------------------------------------------------------------------------
// SVG icon primitives
// ---------------------------------------------------------------------------

function Icon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
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
      {children}
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </Icon>
  );
}

function ScanIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="8" x2="7" y2="16" />
      <line x1="10" y1="8" x2="10" y2="16" />
      <line x1="12" y1="8" x2="12" y2="16" strokeWidth={3} />
      <line x1="15" y1="8" x2="15" y2="16" />
      <line x1="17" y1="8" x2="17" y2="16" />
    </Icon>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Icon>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Icon>
  );
}

function KanbanIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="12" rx="1" />
      <rect x="17" y="3" width="5" height="7" rx="1" />
    </Icon>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </Icon>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Icon>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  );
}

function ClientsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

function AnalyticsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </Icon>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  );
}

function FleetIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </Icon>
  );
}

// ---------------------------------------------------------------------------
// Tab shape
// ---------------------------------------------------------------------------

interface NavTab {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  featureKey?: string;
}

// ---------------------------------------------------------------------------
// Tab sets per role
// ---------------------------------------------------------------------------

/** FIELD_TECH "Wrench Loop" — mobile-first, no financial data. */
const FIELD_TECH_TABS: NavTab[] = [
  { href: "/calendar", label: "Calendar",   icon: CalendarIcon },
  { href: "/scan",     label: "Scan VIN",   icon: ScanIcon     },
  { href: "/jobs",     label: "Active Job",  icon: WrenchIcon   },
  { href: "/sync",     label: "Offline Sync",icon: SyncIcon     },
  { href: "/settings", label: "Settings",   icon: SettingsIcon },
];

/** SHOP_OWNER "Command Center" — full desktop sidebar. */
const SHOP_OWNER_TABS: NavTab[] = [
  { href: "/jobs",           label: "Dispatch",        icon: KanbanIcon   },
  { href: "/dispatch/qa",    label: "QA Inbox",        icon: CheckIcon    },
  { href: "/clients",        label: "Clients",         icon: ClientsIcon  },
  { href: "/fleet/billing",  label: "Fleet Billing",   icon: FleetIcon,   featureKey: "fleet" },
  { href: "/parts/catalog",  label: "Nexpart PO",      icon: ReceiptIcon  },
  { href: "/analytics",      label: "Financials",      icon: AnalyticsIcon},
  { href: "/accounting",     label: "Stripe Payouts",  icon: DollarIcon   },
  { href: "/settings",       label: "Settings",        icon: SettingsIcon },
];

// ---------------------------------------------------------------------------
// Feature flag loader (localStorage)
// ---------------------------------------------------------------------------

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
// NavController
// ---------------------------------------------------------------------------

interface NavControllerProps {
  role: UserRole | null;
}

export function NavController({ role }: NavControllerProps) {
  const pathname = usePathname();
  const [features, setFeatures] = useState<Record<string, boolean>>(() =>
    typeof window !== "undefined" ? loadNavFeatures() : {},
  );

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === LS_FEATURES_KEY) setFeatures(loadNavFeatures());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Choose the tab set based on role.  Null role (demo / unauthenticated)
  // defaults to the full SHOP_OWNER command center.
  const baseTabs = role === "FIELD_TECH" ? FIELD_TECH_TABS : SHOP_OWNER_TABS;

  const tabs = baseTabs.filter((tab) => {
    if (!tab.featureKey) return true;
    return features[tab.featureKey] !== false;
  });

  const isFieldTech = role === "FIELD_TECH";

  return (
    <nav
      aria-label="Main navigation"
      className={[
        // Mobile: fixed bottom bar
        "fixed bottom-0 left-0 right-0 z-50",
        "flex flex-row",
        "bg-gray-900 border-t border-gray-700",
        "pb-[env(safe-area-inset-bottom)]",
        // Desktop: static left sidebar
        "sm:static sm:flex-col sm:h-screen sm:w-20 sm:border-t-0 sm:border-r sm:border-gray-700 sm:pb-0",
        isFieldTech ? "lg:w-48" : "lg:w-56",
      ].join(" ")}
    >
      {/* Brand mark */}
      <div className="hidden sm:flex sm:items-center sm:justify-center sm:h-16 sm:border-b sm:border-gray-700 lg:justify-start lg:px-4">
        <Link
          href="/jobs"
          className="flex items-center gap-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded"
          aria-label="DriveSync — go to jobs"
        >
          <span className="text-yellow-400 font-bold text-lg tracking-tight lg:text-xl">
            DS
          </span>
          <span className="hidden lg:inline ml-2 text-white font-semibold text-lg tracking-tight">
            DriveSync
          </span>
        </Link>
        {role && (
          <span
            className={[
              "hidden lg:inline ml-auto text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
              isFieldTech
                ? "bg-blue-900 text-blue-300"
                : "bg-yellow-900 text-yellow-300",
            ].join(" ")}
          >
            {isFieldTech ? "Tech" : "Owner"}
          </span>
        )}
      </div>

      {/* Role label — visible below brand on desktop */}
      {role && (
        <div className="hidden lg:flex items-center px-4 py-2 border-b border-gray-800">
          <span className="text-xs text-gray-500 uppercase tracking-widest">
            {isFieldTech ? "Wrench Loop" : "Command Center"}
          </span>
        </div>
      )}

      {/* Tab items */}
      <ul className="flex flex-1 flex-row sm:flex-col overflow-y-auto" role="list">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");

          return (
            <li key={tab.href} className="flex-1 sm:flex-none">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-1",
                  "min-h-[48px] w-full py-2 px-1",
                  "sm:flex-row sm:justify-center sm:gap-3 sm:px-3 sm:py-4",
                  "lg:justify-start lg:px-4",
                  "text-[10px] font-semibold uppercase tracking-wide sm:text-xs lg:text-sm",
                  isActive
                    ? "text-yellow-400 bg-gray-800"
                    : "text-gray-400 hover:text-white hover:bg-gray-800",
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
