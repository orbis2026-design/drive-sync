import { getPortalData } from "./actions";
import { PortalClient } from "./PortalClient";

// ---------------------------------------------------------------------------
// Error screen — light fintech style, not the dark mechanic theme
// ---------------------------------------------------------------------------

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-8 h-8"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Link Unavailable</h1>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — Server Component, no authentication required
// ---------------------------------------------------------------------------

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const result = await getPortalData(token);

  if ("error" in result) {
    return <ErrorScreen message={result.error} />;
  }

  return <PortalClient data={result.data} token={token} />;
}
