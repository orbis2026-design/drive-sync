"use client";

/**
 * Sidebar.tsx — ARI-style desktop sidebar navigation (Issue #114)
 *
 * Visible only on lg: breakpoint and above (hidden on mobile).
 * Accepts `role` and `tabs` props for role-based rendering.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/auth";

// ---------------------------------------------------------------------------
// SVG icon primitives (shared with nav-controller)
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

// ---------------------------------------------------------------------------
// Tab shape
// ---------------------------------------------------------------------------

export interface SidebarTab {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

interface SidebarProps {
  role: UserRole | null;
  tabs: SidebarTab[];
}

export function Sidebar({ role, tabs }: SidebarProps) {
  const pathname = usePathname();
  const isFieldTech = role === "FIELD_TECH";

  return (
    <aside
      aria-label="Desktop sidebar navigation"
      className="hidden lg:flex lg:flex-col w-64 bg-gray-900 border-r border-gray-800 h-screen sticky top-0 overflow-y-auto"
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-gray-800 flex-shrink-0">
        <Link
          href="/jobs"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded"
          aria-label="DriveSync — go to jobs"
        >
          <span className="text-yellow-400 font-bold text-xl tracking-tight">
            DS
          </span>
          <span className="text-white font-semibold text-lg tracking-tight">
            DriveSync
          </span>
        </Link>
        {role && (
          <span
            className={[
              "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
              isFieldTech
                ? "bg-blue-900 text-blue-300"
                : "bg-yellow-900 text-yellow-300",
            ].join(" ")}
          >
            {isFieldTech ? "Tech" : "Owner"}
          </span>
        )}
      </div>

      {/* Role label */}
      {role && (
        <div className="px-5 py-2 border-b border-gray-800">
          <span className="text-xs text-gray-500 uppercase tracking-widest">
            {isFieldTech ? "Wrench Loop" : "Command Center"}
          </span>
        </div>
      )}

      {/* Nav links */}
      <ul className="flex flex-col flex-1 py-2 overflow-y-auto" role="list">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center gap-3 px-5 py-3 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-blue-600/10 text-blue-500 border-r-2 border-blue-500"
                    : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-inset",
                ].join(" ")}
              >
                <tab.icon
                  className={[
                    "h-5 w-5 flex-shrink-0",
                    isActive ? "text-blue-500" : "text-gray-400",
                  ].join(" ")}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* User profile placeholder */}
      <div className="border-t border-gray-800 px-5 py-4 flex-shrink-0">
        <button
          type="button"
          className="w-full flex items-center gap-3 rounded-xl p-2 text-left hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
          aria-label="User profile"
        >
          <div className="h-8 w-8 rounded-full bg-yellow-900 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-yellow-300">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </Icon>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">My Account</p>
            <p className="text-xs text-gray-500 truncate">
              {isFieldTech ? "Field Technician" : "Shop Owner"}
            </p>
          </div>
        </button>
      </div>
    </aside>
  );
}
