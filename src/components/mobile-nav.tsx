"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
}

/** SVG icon – two person silhouettes (Clients) */
function IconClients({ active }: { active: boolean }) {
  const stroke = active ? "#f97316" : "#6b7280";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="17" cy="9" r="3" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
}

/** SVG icon – barcode / VIN scan */
function IconScanVin({ active }: { active: boolean }) {
  const stroke = active ? "#f97316" : "#6b7280";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {/* Corner brackets */}
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      {/* Barcode lines */}
      <line x1="7"  y1="8"  x2="7"  y2="16" />
      <line x1="10" y1="8"  x2="10" y2="16" />
      <line x1="13" y1="8"  x2="13" y2="16" />
      <line x1="16" y1="8"  x2="16" y2="16" />
    </svg>
  );
}

/** SVG icon – wrench (Active Jobs) */
function IconActiveJobs({ active }: { active: boolean }) {
  const stroke = active ? "#f97316" : "#6b7280";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

/** SVG icon – gear (Settings) */
function IconSettings({ active }: { active: boolean }) {
  const stroke = active ? "#f97316" : "#6b7280";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Clients",
    href: "/clients",
  },
  {
    label: "Scan VIN",
    href: "/scan",
  },
  {
    label: "Active Jobs",
    href: "/jobs",
  },
  {
    label: "Settings",
    href: "/settings",
  },
];

function NavIcon({
  href,
  active,
}: {
  href: string;
  active: boolean;
}) {
  if (href === "/clients") return <IconClients active={active} />;
  if (href === "/scan") return <IconScanVin active={active} />;
  if (href === "/jobs") return <IconActiveJobs active={active} />;
  return <IconSettings active={active} />;
}

/**
 * MobileNav
 *
 * A fixed bottom-tab-bar styled for a dark, high-contrast garage environment.
 * The active route is highlighted in orange (#f97316) for maximum legibility
 * on grease-smudged screens and in bright sunlight.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="
        fixed bottom-0 left-0 right-0 z-50
        flex items-stretch
        border-t border-zinc-800
        bg-zinc-950/95 backdrop-blur-sm
      "
      style={{
        height: "calc(var(--mobile-nav-height) + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_ITEMS.map(({ label, href }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="
              flex flex-1 flex-col items-center justify-center gap-1
              text-[10px] font-medium tracking-wide
              transition-colors duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400
              active:scale-95
            "
            style={{ color: active ? "#f97316" : "#6b7280" }}
          >
            <NavIcon href={href} active={active} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
