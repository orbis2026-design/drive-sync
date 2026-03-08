"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { sendShopMessage, fetchShopMessages } from "./actions";
import type { ShopMessage } from "./actions";

// ---------------------------------------------------------------------------
// Supabase browser client (public anon key — safe for client-side real-time)
// ---------------------------------------------------------------------------
function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: {
      persistSession: true,
      storageKey: "drive-sync-auth",
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Resolve the current user ID from the active Supabase session.
// Falls back to "demo-user" when running without a real auth session.
// ---------------------------------------------------------------------------
async function resolveCurrentUserId(): Promise<string> {
  const supabase = getBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? "demo-user";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Channel = "#dispatch" | "#general" | "#insights";

const CHANNELS: { id: Channel; label: string; emoji: string }[] = [
  { id: "#dispatch", label: "Dispatch", emoji: "📡" },
  { id: "#general", label: "General", emoji: "💬" },
  { id: "#insights", label: "Insights", emoji: "📊" },
];

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------

function initials(userId: string) {
  return userId.slice(0, 2).toUpperCase();
}

function MessageBubble({
  msg,
  currentUserId,
}: {
  msg: ShopMessage;
  currentUserId: string;
}) {
  const isOwn = msg.user_id === currentUserId && !msg.is_ai;
  const ts = new Date(msg.created_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (msg.is_ai) {
    return (
      <div className="flex items-start gap-3 max-w-lg">
        {/* Robot avatar */}
        <div className="w-8 h-8 rounded-full bg-purple-800 border border-purple-600 flex items-center justify-center text-sm flex-shrink-0">
          🤖
        </div>
        <div className="flex flex-col gap-1">
          <div className="bg-purple-950 border border-purple-700 rounded-2xl rounded-tl-none px-4 py-2 text-purple-100 text-sm">
            {msg.body}
          </div>
          <p className="text-xs text-gray-600 pl-1">{ts}</p>
        </div>
      </div>
    );
  }

  if (isOwn) {
    return (
      <div className="flex items-end gap-3 max-w-lg ml-auto flex-row-reverse">
        <div className="w-8 h-8 rounded-full bg-red-700 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
          {initials(msg.user_id)}
        </div>
        <div className="flex flex-col gap-1 items-end">
          <div className="bg-red-700 rounded-2xl rounded-br-none px-4 py-2 text-white text-sm">
            {msg.body}
          </div>
          <p className="text-xs text-gray-600 pr-1">{ts}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 max-w-lg">
      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
        {initials(msg.user_id)}
      </div>
      <div className="flex flex-col gap-1">
        <div className="bg-gray-800 rounded-2xl rounded-tl-none px-4 py-2 text-gray-100 text-sm">
          {msg.body}
        </div>
        <p className="text-xs text-gray-600 pl-1">{ts}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component (client)
// ---------------------------------------------------------------------------

export default function ShopChatPage() {
  const [activeChannel, setActiveChannel] = useState<Channel>("#general");
  const [messages, setMessages] = useState<ShopMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Resolve user ID from the live session; fall back to "demo-user"
  const [currentUserId, setCurrentUserId] = useState("demo-user");
  useEffect(() => {
    resolveCurrentUserId().then(setCurrentUserId);
  }, []);

  // ------------------------------------------------------------------
  // Load messages when channel changes
  // ------------------------------------------------------------------
  useEffect(() => {
    setMessages([]);
    (async () => {
      const { data, error: err } = await fetchShopMessages(activeChannel);
      if (err) {
        setError(err);
      } else {
        setMessages(data ?? []);
      }
    })();
  }, [activeChannel]);

  // ------------------------------------------------------------------
  // Supabase Real-Time subscription
  // ------------------------------------------------------------------
  useEffect(() => {
    const tenantId = process.env.NEXT_PUBLIC_DEMO_TENANT_ID;
    const supabase = getBrowserSupabase();

    const channel = supabase
      .channel(`shop_messages:${activeChannel}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "shop_messages",
          filter: tenantId
            ? `tenant_id=eq.${tenantId}&channel=eq.${activeChannel}`
            : `channel=eq.${activeChannel}`,
        },
        (payload) => {
          setMessages((prev) => [
            ...prev,
            payload.new as ShopMessage,
          ]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeChannel]);

  // ------------------------------------------------------------------
  // Auto-scroll to bottom
  // ------------------------------------------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ------------------------------------------------------------------
  // Send message
  // ------------------------------------------------------------------
  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;

    // #insights is read-only for non-AI messages
    if (activeChannel === "#insights") return;

    setSending(true);
    setError(null);
    setDraft("");

    const { error: err } = await sendShopMessage(activeChannel, body);
    setSending(false);
    if (err) setError(err);
  }, [draft, sending, activeChannel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-5 py-4">
        <h1 className="text-white font-black text-lg">Shop Comms</h1>
        <p className="text-gray-500 text-xs mt-0.5">Internal team messaging</p>
      </div>

      {/* Channel tabs */}
      <div className="flex border-b border-gray-800 bg-gray-900">
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            type="button"
            onClick={() => setActiveChannel(ch.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold transition-colors ${
              activeChannel === ch.id
                ? "text-white border-b-2 border-red-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span>{ch.emoji}</span>
            <span>{ch.label}</span>
          </button>
        ))}
      </div>

      {/* #insights read-only notice */}
      {activeChannel === "#insights" && (
        <div className="bg-purple-950 border-b border-purple-800 px-5 py-2">
          <p className="text-purple-300 text-xs">
            📊 AI-generated projections only — read-only channel
          </p>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-8">
            No messages yet. Start the conversation!
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            currentUserId={currentUserId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-2 bg-red-950 border border-red-700 rounded-xl px-4 py-2 text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Compose bar */}
      {activeChannel !== "#insights" && (
        <div className="bg-gray-900 border-t border-gray-800 px-4 py-3 flex items-end gap-3">
          <textarea
            rows={1}
            placeholder={`Message ${activeChannel}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 px-4 py-2.5 text-sm resize-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="bg-red-600 text-white font-black uppercase tracking-wide rounded-xl px-4 py-2.5 text-sm hover:bg-red-500 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
