"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkOrderForVehicle } from "./actions";

/**
 * Runs createWorkOrderForVehicle in the client so revalidateTag runs outside
 * of the initial server render (Next.js disallows revalidateTag during render).
 */
export function NewWorkOrderClient({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    createWorkOrderForVehicle(vehicleId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setStatus("error");
        router.replace(`/clients?error=${encodeURIComponent(result.error)}`);
      } else {
        router.replace(`/diagnostics/${result.workOrderId}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
      <p className="text-gray-400">
        {status === "error" ? "Redirecting…" : "Creating work order…"}
      </p>
    </div>
  );
}
