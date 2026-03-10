"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  searchClients,
  createClient,
  type ClientSearchResult,
} from "./client-search-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectedClient = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  isCommercialFleet: boolean;
  vehicles: ClientSearchResult["vehicles"];
};

interface ClientSearchStepProps {
  onClientSelected: (client: SelectedClient) => void;
}

// ---------------------------------------------------------------------------
// NewClientForm — inline form to create a brand-new client
// ---------------------------------------------------------------------------

function NewClientForm({
  onCreated,
  onCancel,
}: {
  onCreated: (client: SelectedClient) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isCommercialFleet, setIsCommercialFleet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createClient({
        firstName,
        lastName,
        phone,
        email: email || undefined,
        isCommercialFleet,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        onCreated({
          id: result.id,
          firstName,
          lastName,
          phone,
          email: email || null,
          isCommercialFleet,
          vehicles: [],
        });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
        New Client
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Smith"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">
          Phone <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 (555) 000-0000"
          className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">
          Email (optional)
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400"
        />
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isCommercialFleet}
          onChange={(e) => setIsCommercialFleet(e.target.checked)}
          className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-brand-400"
        />
        <span className="text-sm text-gray-300">Commercial Fleet account</span>
      </label>

      {error && (
        <p role="alert" className="text-xs text-red-400 font-medium">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-2.5 rounded-xl bg-brand-400 text-gray-950 text-sm font-bold hover:bg-brand-300 active:scale-[0.98] disabled:opacity-50 transition-all"
        >
          {isPending ? "Creating…" : "Create Client"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// ClientSearchStep — main export
// ---------------------------------------------------------------------------

export function ClientSearchStep({ onClientSelected }: ClientSearchStepProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const data = await searchClients(query);
      setResults(data);
      setIsOpen(true);
      setIsSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(client: ClientSearchResult) {
    const selected: SelectedClient = {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      email: client.email,
      isCommercialFleet: client.isCommercialFleet,
      vehicles: client.vehicles,
    };
    setSelectedClient(selected);
    setIsOpen(false);
    setQuery("");
    onClientSelected(selected);
  }

  function handleNewClientCreated(client: SelectedClient) {
    setSelectedClient(client);
    setShowNewForm(false);
    onClientSelected(client);
  }

  function handleClear() {
    setSelectedClient(null);
    setQuery("");
    setResults([]);
  }

  // ── Confirmed client banner ───────────────────────────────────────────────
  if (selectedClient) {
    return (
      <div className="rounded-2xl border border-brand-400/40 bg-brand-400/5 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">
            {selectedClient.firstName} {selectedClient.lastName}
          </p>
          <p className="text-xs text-gray-400 truncate">{selectedClient.phone}</p>
          {selectedClient.vehicles.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedClient.vehicles.length} vehicle
              {selectedClient.vehicles.length !== 1 ? "s" : ""} on file
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  // ── New client form ───────────────────────────────────────────────────────
  if (showNewForm) {
    return (
      <NewClientForm
        onCreated={handleNewClientCreated}
        onCancel={() => setShowNewForm(false)}
      />
    );
  }

  // ── Search input + dropdown ───────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search by name, phone, or plate…"
          className="w-full rounded-lg bg-gray-800 border border-gray-700 pl-9 pr-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
          {isSearching ? (
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          )}
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {results.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              className="w-full px-4 py-3 text-left hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    {client.firstName} {client.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{client.phone}</p>
                  {client.vehicles[0] && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[client.vehicles[0].year, client.vehicles[0].make, client.vehicles[0].model].filter(Boolean).join(" ")}
                    </p>
                  )}
                </div>
                {client.vehicles.length > 0 && (
                  <span className="flex-shrink-0 text-[10px] font-bold bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">
                    {client.vehicles.length}v
                  </span>
                )}
              </div>
            </button>
          ))}

          {/* Add new client */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setShowNewForm(true);
            }}
            className="w-full px-4 py-3 text-left text-sm font-semibold text-brand-400 hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <span className="text-base">+</span>
            Add new client
          </button>
        </div>
      )}

      {/* "Add new client" shown when no query yet */}
      {!isOpen && query.length === 0 && (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-gray-700 text-sm font-semibold text-gray-400 hover:border-brand-400 hover:text-brand-400 transition-colors"
        >
          + Add new client
        </button>
      )}
    </div>
  );
}
