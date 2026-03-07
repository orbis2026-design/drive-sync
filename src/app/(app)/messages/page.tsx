"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRealtimeMessages, type Message } from "@/hooks/useRealtimeMessages";
import { sendMessage, fetchClients } from "./actions";

// ─── Config ───────────────────────────────────────────────────────────────────

const DEMO_TENANT_ID = process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isOutbound = msg.direction === "OUTBOUND";
  const isOptimistic = msg.id.startsWith("optimistic-");

  return (
    <div
      className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-2`}
    >
      <div
        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow ${
          isOutbound
            ? "bg-amber-500 text-gray-950 rounded-br-md"
            : "bg-gray-800 text-white rounded-bl-md border border-gray-700"
        } ${isOptimistic ? "opacity-60" : "opacity-100"}`}
      >
        <p>{msg.body}</p>
        <p
          className={`text-[10px] mt-1 ${
            isOutbound ? "text-amber-900/70 text-right" : "text-gray-500"
          }`}
        >
          {isOptimistic
            ? "Sending…"
            : new Date(msg.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
        </p>
      </div>
    </div>
  );
}

// ─── Conversation selector ────────────────────────────────────────────────────

type Client = { id: string; first_name: string; last_name: string; phone: string | null };

// ─── Main page component ──────────────────────────────────────────────────────

export default function MessagesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendOptimistic, removeOptimistic } =
    useRealtimeMessages({
      tenantId: DEMO_TENANT_ID,
      clientId: selectedClientId,
    });

  // ── Load client list ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchClients().then((result) => {
      if ("data" in result) setClients(result.data);
    });
  }, []);

  // ── Auto-scroll to latest message ─────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send outbound message ─────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const body = inputText.trim();
    if (!body || isSending) return;

    setInputText("");
    setSendError(null);
    const optimistic = sendOptimistic(body);
    setIsSending(true);

    try {
      const result = await sendMessage({
        tenantId: DEMO_TENANT_ID,
        clientId: selectedClientId,
        body,
      });

      if ("error" in result) {
        removeOptimistic(optimistic.id);
        setSendError(result.error);
      }
    } catch (err) {
      removeOptimistic(optimistic.id);
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, sendOptimistic, removeOptimistic, selectedClientId]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] bg-gray-950 text-white">
      {/* Header */}
      <div className="flex-shrink-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-lg font-bold">💬 SMS Inbox</h1>
            <p className="text-xs text-gray-400">
              Secure unified messaging — powered by Twilio
            </p>
          </div>
          {/* Client conversation selector */}
          <select
            className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
            value={selectedClientId ?? ""}
            onChange={(e) =>
              setSelectedClientId(e.target.value || null)
            }
          >
            <option value="">All conversations</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>
        </div>
        {selectedClient && (
          <p className="text-xs text-amber-400 mt-1">
            📱 {selectedClient.phone ?? "No phone on file"}
          </p>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 text-sm animate-pulse">
              Loading messages…
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-600">
            <span className="text-5xl mb-3">📭</span>
            <p className="font-medium">No messages yet</p>
            <p className="text-xs mt-1">
              Start a conversation or wait for a client reply.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-3 py-3 safe-area-bottom">
        {sendError && (
          <p className="text-xs text-red-400 mb-2 px-1">⚠️ {sendError}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            placeholder="Type a message…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-2.5 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 max-h-28"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isSending}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-gray-950 font-bold text-lg flex items-center justify-center disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
