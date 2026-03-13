import { getCheckoutDataCached } from "./data";
import { CheckoutClient } from "./CheckoutClient";

// ---------------------------------------------------------------------------
// Error screen — pure server-rendered fallback
// ---------------------------------------------------------------------------

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border-2 border-danger-500/40 bg-danger-500/10 px-6 py-8 text-center space-y-3">
        <p className="text-4xl" aria-hidden="true">
          ⚠️
        </p>
        <h1 className="text-xl font-black text-white">Checkout Unavailable</h1>
        <p className="text-sm text-danger-400">{message}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — Server Component
// Fetches authoritative data on the server then hydrates the interactive
// client component; no client-side data-fetching waterfall.
// ---------------------------------------------------------------------------

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = await params;

  const result = await getCheckoutDataCached(workOrderId);

  if ("error" in result) {
    return <ErrorScreen message={result.error} />;
  }

  return <CheckoutClient data={result.data} />;
}
