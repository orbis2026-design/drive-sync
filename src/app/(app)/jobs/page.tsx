import { fetchActiveJobs } from "./actions";
import { JobsBoard } from "./JobsBoard";

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
  let result: Awaited<ReturnType<typeof fetchActiveJobs>>;
  try {
    result = await fetchActiveJobs();
  } catch (err) {
    console.error("[JobsPage] Database query failed:", err);
    result = { data: null, error: "Database syncing..." };
  }

  // Graceful degradation: if the DB is unavailable, render an empty board.
  const jobs = "data" in result && result.data != null ? result.data : [];

  return (
    <div className="flex flex-col gap-4 min-h-full">
      {/* Error banner — shown if DB query failed but we still render the board */}
      {"error" in result && (
        <div
          role="alert"
          className="rounded-xl bg-danger-950 border border-danger-700 px-4 py-3 text-sm text-danger-400"
        >
          Could not load jobs: {result.error}
        </div>
      )}

      {/* Interactive board — elevated card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 shadow-sm">
        <JobsBoard jobs={jobs} />
      </div>
    </div>
  );
}
