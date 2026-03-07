"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client (browser)
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocationUpdate {
  workOrderId: string;
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface TrackingClientProps {
  workOrderId: string;
  mechanicName: string;
  mechanicPhone?: string;
  destinationLat?: number;
  destinationLng?: number;
}

// ---------------------------------------------------------------------------
// Haversine distance (km)
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// ETA calculation — assumes ~40 km/h average urban speed
// ---------------------------------------------------------------------------

function calcEta(
  mechLat: number,
  mechLng: number,
  destLat: number,
  destLng: number,
): string {
  const distKm = haversineKm(mechLat, mechLng, destLat, destLng);
  const avgSpeedKmh = 40;
  const etaMinutes = Math.round((distKm / avgSpeedKmh) * 60);
  if (etaMinutes < 1) return "Arriving now";
  if (etaMinutes === 1) return "~1 minute away";
  return `~${etaMinutes} minutes away`;
}

// ---------------------------------------------------------------------------
// Simple map placeholder (shows coordinates on a styled tile)
// ---------------------------------------------------------------------------

function MapPlaceholder({
  lat,
  lng,
  arrived,
}: {
  lat: number;
  lng: number;
  arrived: boolean;
}) {
  // Link to Google Maps satellite view centred on mechanic
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block relative bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden h-52 sm:h-64 group"
      aria-label="View mechanic location on Google Maps"
    >
      {/* Fake map grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(#4b5563 1px, transparent 1px), linear-gradient(90deg, #4b5563 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Vehicle icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div
            className={`text-5xl transition-transform ${
              arrived ? "" : "animate-bounce"
            }`}
            style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.8))" }}
          >
            🚐
          </div>
          {!arrived && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping" />
          )}
        </div>
      </div>

      {/* Overlay label */}
      <div className="absolute bottom-3 left-3 right-3 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-300 font-mono">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </span>
        <span className="text-xs text-sky-400 font-semibold group-hover:underline">
          Open in Maps →
        </span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main tracking client component
// ---------------------------------------------------------------------------

export default function TrackingClient({
  workOrderId,
  mechanicName,
  mechanicPhone,
  destinationLat,
  destinationLng,
}: TrackingClientProps) {
  const [location, setLocation] = useState<LocationUpdate | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);

  const channelRef = useRef<ReturnType<
    ReturnType<typeof getSupabase>["channel"]
  > | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    const channelName = `tracking:${workOrderId}`;

    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "location_update" }, (payload) => {
        const update = payload.payload as LocationUpdate;
        setLocation(update);
        setLastSeen(new Date());
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [workOrderId]);

  const hasDestination =
    destinationLat !== undefined && destinationLng !== undefined;

  const eta =
    location && hasDestination
      ? calcEta(location.lat, location.lng, destinationLat!, destinationLng!)
      : null;

  const arrived = eta === "Arriving now";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gray-950 text-white px-4 pt-safe-top pb-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 pt-4 mb-1">
            <span className="text-2xl">🚐</span>
            <h1 className="text-xl font-black tracking-tight">
              {mechanicName}
            </h1>
          </div>
          <p className="text-gray-400 text-sm">is on the way to you</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-500 animate-pulse" : "bg-gray-400"
            }`}
          />
          <span className="text-xs text-gray-500">
            {connected
              ? "Live tracking active"
              : "Connecting to live channel…"}
          </span>
          {lastSeen && (
            <span className="text-xs text-gray-400 ml-auto">
              Updated {lastSeen.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
        </div>

        {/* Map */}
        {location ? (
          <>
            <MapPlaceholder
              lat={location.lat}
              lng={location.lng}
              arrived={arrived}
            />

            {/* ETA */}
            <div
              className={`rounded-2xl p-5 text-center ${
                arrived
                  ? "bg-green-50 border border-green-200"
                  : "bg-blue-50 border border-blue-200"
              }`}
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Estimated Arrival
              </p>
              <p
                className={`text-3xl font-black ${
                  arrived ? "text-green-600" : "text-blue-700"
                }`}
              >
                {eta ?? "Calculating…"}
              </p>
            </div>
          </>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl h-52 flex flex-col items-center justify-center gap-3 text-gray-400">
            <span className="text-4xl animate-pulse">📡</span>
            <p className="text-sm font-medium">Waiting for mechanic location…</p>
            <p className="text-xs text-gray-400">
              The mechanic will appear here once they start driving.
            </p>
          </div>
        )}

        {/* Call button */}
        {mechanicPhone && (
          <a
            href={`tel:${mechanicPhone}`}
            className="flex items-center justify-center gap-2 w-full bg-gray-950 hover:bg-gray-800 text-white font-bold py-4 rounded-2xl transition-colors text-lg"
          >
            <span>📞</span>
            Call {mechanicName}
          </a>
        )}

        <p className="text-xs text-gray-400 text-center">
          Your mechanic&apos;s location is shared securely via DriveSync
          real-time channels and is not stored permanently.
        </p>
      </div>
    </div>
  );
}
