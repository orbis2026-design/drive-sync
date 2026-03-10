import Link from "next/link";
import { fetchActiveJobs, fetchRequestedJobs } from "./actions";
import { JobsBoard } from "./JobsBoard";
import type { RequestedJobCard } from "./actions";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = {
  title: "Active Jobs — DriveSync",
  description: "Live pipeline board showing all open work orders by stage.",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default async function JobsPage() {
  let activeResult: Awaited<ReturnType<typeof fetchActiveJobs>>;
  let requestedResult: Awaited<ReturnType<typeof fetchRequestedJobs>>;

  try {
    activeResult = await fetchActiveJobs();
  } catch (err) {
    console.error("[JobsPage] fetchActiveJobs failed:", err);
    activeResult = { data: null, error: "Database syncing..." };
  }

  try {
    requestedResult = await fetchRequestedJobs();
  } catch (err) {
    console.error("[JobsPage] fetchRequestedJobs failed:", err);
    requestedResult = { data: null, error: "" };
  }

  const jobs =
    "data" in activeResult && activeResult.data != null ? activeResult.data : [];
  const requestedJobs: RequestedJobCard[] =
    "data" in requestedResult && requestedResult.data != null
      ? requestedResult.data
      : [];

  return (
    <div className="flex flex-col gap-4 min-h-full">
      {/* Error banner — shown if DB query failed but we still render the board */}
      {"error" in activeResult && activeResult.error && (
        <div
          role="alert"
          className="rounded-xl bg-danger-950 border border-danger-700 px-4 py-3 text-sm text-danger-400"
        >
          Could not load jobs: {activeResult.error}
        </div>
      )}

      {/* Requests inbox — REQUESTED work orders */}
      {requestedJobs.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-amber-800/50 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-500/90 mb-3">
            New requests ({requestedJobs.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {requestedJobs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/work-orders/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 hover:border-amber-500/40 hover:bg-gray-800 transition-colors"
                >
                  <span className="font-medium text-white">
                    {r.client.firstName} {r.client.lastName}
                  </span>
                  <span className="text-sm text-gray-400">
                    {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                  </span>
                  <span className="text-xs text-gray-500 w-full sm:w-auto">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-amber-400 font-medium">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Interactive board — elevated card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 shadow-sm">
        <JobsBoard jobs={jobs} />
      </div>
    </div>
  );
}
