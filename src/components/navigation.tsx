"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

function IntakeIcon({ className }: { className?: string }) {
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
      <path d="M12 5v14" />
      <path d="M5 12l7 7 7-7" />
      <rect x="3" y="3" width="18" height="4" rx="1" />
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

const TABS: NavTab[] = [
  { href: "/clients", label: "Clients", icon: ClientsIcon },
  { href: "/intake", label: "Intake", icon: IntakeIcon },
  { href: "/jobs", label: "Active Jobs", icon: ActiveJobsIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

// ---------------------------------------------------------------------------
// Navigation shell
// ---------------------------------------------------------------------------
export function Navigation() {
  const pathname = usePathname();

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
