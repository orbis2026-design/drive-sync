"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Message = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  from_number: string | null;
  created_at: string;
};

type UseRealtimeMessagesOptions = {
  tenantId: string;
  /** Optionally filter to a specific client conversation */
  clientId?: string | null;
};

type UseRealtimeMessagesReturn = {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  /** Optimistically add an outbound message before the server confirms it */
  sendOptimistic: (body: string) => Message;
  /** Remove the optimistic placeholder after server responds */
  removeOptimistic: (id: string) => void;
};

/** Maximum number of messages loaded on initial fetch */
const INITIAL_MESSAGE_LIMIT = 200;

// ─── Supabase browser client (singleton) ─────────────────────────────────────

function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtimeMessages({
  tenantId,
  clientId = null,
}: UseRealtimeMessagesOptions): UseRealtimeMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(getSupabaseBrowserClient());

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseRef.current;

    async function fetchMessages() {
      setIsLoading(true);
      setError(null);

      let query = supabase
        .from("messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(INITIAL_MESSAGE_LIMIT);

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      const { data, error: fetchError } = await query;

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setMessages((data as Message[]) ?? []);
      }
      setIsLoading(false);
    }

    fetchMessages();
    return () => {
      cancelled = true;
    };
  }, [tenantId, clientId]);

  // ── Supabase Realtime subscription ────────────────────────────────────────
  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`messages:tenant:${tenantId}${clientId ? `:client:${clientId}` : ""}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;

          // If we're filtering by client, skip messages for other clients
          if (clientId && newMsg.client_id !== clientId) return;

          setMessages((prev) => {
            // Remove any optimistic placeholder with a matching body+direction
            const withoutOptimistic = prev.filter(
              (m) =>
                !(
                  m.id.startsWith("optimistic-") &&
                  m.body === newMsg.body &&
                  m.direction === newMsg.direction
                )
            );
            // Append the confirmed message (deduplicate by id)
            if (withoutOptimistic.some((m) => m.id === newMsg.id)) {
              return withoutOptimistic;
            }
            return [...withoutOptimistic, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, clientId]);

  // ── Optimistic send helper ────────────────────────────────────────────────

  const sendOptimistic = useCallback(
    (body: string): Message => {
      const placeholder: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        tenant_id: tenantId,
        client_id: clientId ?? null,
        body,
        direction: "OUTBOUND",
        from_number: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, placeholder]);
      return placeholder;
    },
    [tenantId, clientId]
  );

  const removeOptimistic = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { messages, isLoading, error, sendOptimistic, removeOptimistic };
}
