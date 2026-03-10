import { fetchQueuedMessages, fetchRetentionQueue } from "./actions";
import { MarketingClient } from "./MarketingClient";
import { EmptyState } from "@/components/EmptyState";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = {
  title: "Retention Engine — DriveSync",
  description: "AI-powered predictive maintenance outreach.",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default async function MarketingPage() {
  const [queueResult, retentionResult] = await Promise.all([
    fetchQueuedMessages(),
    fetchRetentionQueue(),
  ]);

  const messages = "data" in queueResult ? queueResult.data : [];
  const error = "error" in queueResult ? queueResult.error : undefined;
  const retentionQueue = "data" in retentionResult ? retentionResult.data : [];

  return (
    <div className="flex flex-col min-h-full">
      {/* Page header */}
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-4xl font-black text-white tracking-tight">
          Retention Engine
        </h1>
        <p className="text-base text-gray-400 mt-1">
          Predictive maintenance alerts · AI-driven SMS outreach.
        </p>
      </header>

      {messages.length === 0 && retentionQueue.length === 0 && !error ? (
        <EmptyState
          icon="📣"
          title="No clients due for service"
          description="As you complete work orders, DriveSync will automatically track service intervals and surface clients due for their next visit here."
          action={{ label: "+ New Intake", href: "/intake" }}
        />
      ) : (
        <MarketingClient
          initialMessages={messages}
          initialError={error}
          initialRetentionQueue={retentionQueue}
        />
      )}
    </div>
  );
}
