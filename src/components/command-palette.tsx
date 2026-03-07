"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string;
  type: "client" | "vehicle" | "workorder";
  label: string;
  sublabel: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Supabase search — runs a unified query across clients, vehicles, and orders
// ---------------------------------------------------------------------------

async function runSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const supabase = createClient();
  const results: SearchResult[] = [];
  const q = query.trim();

  // --- Clients (by name or phone) -----------------------------------------
  const { data: clients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone")
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(5);

  for (const c of clients ?? []) {
    results.push({
      id: `client-${c.id}`,
      type: "client",
      label: `${c.first_name} ${c.last_name}`,
      sublabel: c.phone ?? "No phone",
      href: `/clients`,
    });
  }

  // --- Vehicles (by VIN or plate) -----------------------------------------
  const { data: vehicles } = await supabase
    .from("tenant_vehicles")
    .select("id, vin, plate, make, model, year")
    .or(`vin.ilike.%${q}%,plate.ilike.%${q}%`)
    .limit(5);

  for (const v of vehicles ?? []) {
    results.push({
      id: `vehicle-${v.id}`,
      type: "vehicle",
      label: `${v.year} ${v.make} ${v.model}`,
      sublabel: [v.plate && `Plate: ${v.plate}`, v.vin && `VIN: ${v.vin}`]
        .filter(Boolean)
        .join(" · "),
      href: `/clients`,
    });
  }

  // --- Work Orders (by ID prefix) -----------------------------------------
  const { data: workOrders } = await supabase
    .from("work_orders")
    .select("id, title, status")
    .ilike("id", `%${q}%`)
    .limit(5);

  for (const wo of workOrders ?? []) {
    results.push({
      id: `wo-${wo.id}`,
      type: "workorder",
      label: wo.title ?? `Work Order ${wo.id.slice(0, 8)}`,
      sublabel: `Status: ${wo.status}`,
      href: `/jobs`,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Type icons
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<SearchResult["type"], string> = {
  client: "👤",
  vehicle: "🚗",
  workorder: "🔧",
};

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  client: "Clients",
  vehicle: "Vehicles",
  workorder: "Work Orders",
};

// ---------------------------------------------------------------------------
// CommandPalette component
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  // Reset state when palette opens/closes
  useEffect(() => {
    if (!open) {
      // Schedule the state reset asynchronously to avoid cascading renders.
      const id = setTimeout(() => {
        setQuery("");
        setResults([]);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      const id = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(id);
    }
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const found = await runSearch(query);
        setResults(found);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleSelect(href: string) {
    onClose();
    router.push(href);
  }

  if (!open) return null;

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    acc[r.type] = [...(acc[r.type] ?? []), r];
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped) as SearchResult["type"][];

  return (
    /* Blurred overlay */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette card */}
      <div className="relative w-full max-w-xl bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <Command shouldFilter={false} loop>
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 text-gray-500 flex-shrink-0"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <Command.Input
              autoFocus
              placeholder="Search clients, vehicles, work orders…"
              value={query}
              onValueChange={setQuery}
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none"
              aria-label="Search"
            />
            {isPending && (
              <div className="w-4 h-4 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin flex-shrink-0" />
            )}
            <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-gray-600 font-mono flex-shrink-0">
              <span className="text-gray-700 text-xs">Esc</span>
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto py-2">
            {/* Empty state */}
            {query && !isPending && results.length === 0 && (
              <Command.Empty>
                <p className="text-center text-sm text-gray-600 py-8">
                  No results for &ldquo;{query}&rdquo;
                </p>
              </Command.Empty>
            )}

            {/* Default shortcuts when no query */}
            {!query && (
              <Command.Group
                heading={
                  <span className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                    Quick Nav
                  </span>
                }
              >
                {[
                  { label: "Dashboard", href: "/", icon: "🏠" },
                  { label: "Jobs Board", href: "/jobs", icon: "🔧" },
                  { label: "Clients", href: "/clients", icon: "👥" },
                  { label: "Calendar", href: "/calendar", icon: "📅" },
                  { label: "Messages", href: "/messages", icon: "💬" },
                ].map((item) => (
                  <Command.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => handleSelect(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer aria-selected:bg-gray-800 rounded-lg mx-2 transition-colors"
                  >
                    <span className="text-base" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="text-sm text-gray-300">{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Search results grouped by type */}
            {groupKeys.map((type) => (
              <Command.Group
                key={type}
                heading={
                  <span className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                    {TYPE_LABELS[type]}
                  </span>
                }
              >
                {grouped[type].map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => handleSelect(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer aria-selected:bg-gray-800 rounded-lg mx-2 transition-colors"
                  >
                    <span
                      className="text-base flex-shrink-0"
                      aria-hidden="true"
                    >
                      {TYPE_ICONS[item.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 font-medium truncate">
                        {item.label}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {item.sublabel}
                      </p>
                    </div>
                    <span className="text-gray-700 text-xs flex-shrink-0">↵</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer hint */}
          <div className="border-t border-gray-800 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-700">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommandPaletteProvider — wraps the app layout, handles keyboard shortcut
// ---------------------------------------------------------------------------

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      {children}
    </>
  );
}
