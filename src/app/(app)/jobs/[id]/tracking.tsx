"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase public client (browser-side, uses anon key)
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

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface TrackingProps {
  /** WorkOrder ID — used as the Supabase Real-Time channel name. */
  workOrderId: string;
  /** Client name for display. */
  clientName: string;
  /** Client phone number for the call button (optional). */
  clientPhone?: string;
}

// ---------------------------------------------------------------------------
// Tracking component (mechanic side)
// ---------------------------------------------------------------------------

export default function MechanicTracking({
  workOrderId,
  clientName,
  clientPhone,
}: TrackingProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broadcastCount, setBroadcastCount] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof getSupabase>["channel"]
  > | null>(null);

  // ---------------------------------------------------------------------------
  // Start tracking — watchPosition + Supabase Real-Time broadcast
  // ---------------------------------------------------------------------------

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this device.");
      return;
    }

    setError(null);

    // Subscribe to Supabase Real-Time channel for this work order
    const supabase = getSupabase();
    const channelName = `tracking:${workOrderId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;
    channel.subscribe();

    // Begin watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newCoords: Coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        setCoords(newCoords);

        // Broadcast to the client-side portal subscriber
        channel.send({
          type: "broadcast",
          event: "location_update",
          payload: {
            workOrderId,
            ...newCoords,
          },
        });
        setBroadcastCount((n) => n + 1);
      },
      (err) => {
        setError(`Location error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );

    setIsTracking(true);
  }, [workOrderId]);

  // ---------------------------------------------------------------------------
  // Stop tracking
  // ---------------------------------------------------------------------------

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white">En-Route Tracking</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Heading to: <span className="text-gray-300">{clientName}</span>
          </p>
        </div>
        {isTracking && (
          <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {coords && (
        <div className="bg-gray-800/60 rounded-xl p-3 space-y-1 font-mono text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Latitude</span>
            <span className="text-gray-200">{coords.lat.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span>Longitude</span>
            <span className="text-gray-200">{coords.lng.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span>Accuracy</span>
            <span className="text-gray-200">{coords.accuracy.toFixed(0)} m</span>
          </div>
          <div className="flex justify-between">
            <span>Broadcasts sent</span>
            <span className="text-green-400">{broadcastCount}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {!isTracking ? (
          <button
            onClick={startTracking}
            className="col-span-2 bg-brand-400 hover:bg-brand-300 text-black font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span>🚐</span>
            Heading to Client
          </button>
        ) : (
          <>
            <button
              onClick={stopTracking}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
            >
              Stop Sharing
            </button>
            {clientPhone && (
              <a
                href={`tel:${clientPhone}`}
                className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-1"
              >
                📞 Call Client
              </a>
            )}
          </>
        )}
      </div>

      {isTracking && (
        <p className="text-xs text-gray-600 text-center">
          Your location is being broadcast to the client portal in real-time.
          Share the portal link so your client can follow along.
        </p>
      )}
    </div>
  );
}
