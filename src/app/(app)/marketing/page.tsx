import { fetchQueuedMessages } from "./actions";
import { MarketingClient } from "./MarketingClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = {
  title: "Marketing — DriveSync",
  description: "Review AI-generated messages and send blast campaigns.",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default async function MarketingPage() {
  const result = await fetchQueuedMessages();

  const messages = "data" in result ? result.data : [];
  const error = "error" in result ? result.error : undefined;

  return (
    <div className="flex flex-col min-h-full">
      {/* Page header */}
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-4xl font-black text-white tracking-tight">
          Marketing
        </h1>
        <p className="text-base text-gray-400 mt-1">
          Review AI messages · send campaigns.
        </p>
      </header>

      <MarketingClient initialMessages={messages} initialError={error} />
    </div>
  );
}
