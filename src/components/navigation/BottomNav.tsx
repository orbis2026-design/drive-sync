"use client";

/**
 * BottomNav.tsx — Mobile bottom navigation (Issue #114)
 *
 * Fixed to the bottom of the viewport, hidden from md: (768px) up so desktop shows sidebar.
 * Includes safe-area-inset padding for notched phones.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// Tab shape
// ---------------------------------------------------------------------------

export interface BottomNavTab {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

// ---------------------------------------------------------------------------
// BottomNav component
// ---------------------------------------------------------------------------

interface BottomNavProps {
  tabs: BottomNavTab[];
}

export function BottomNav({ tabs }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-gray-900 border-t border-gray-700 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex flex-row" role="list">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-1 min-h-[56px] w-full py-2 px-1",
                  "text-[10px] font-semibold uppercase tracking-wide",
                  isActive
                    ? "text-yellow-400"
                    : "text-gray-400 hover:text-white",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-inset",
                ].join(" ")}
              >
                <tab.icon
                  className={[
                    "h-6 w-6 flex-shrink-0",
                    isActive ? "text-yellow-400" : "text-gray-400",
                  ].join(" ")}
                />
                <span className="leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
