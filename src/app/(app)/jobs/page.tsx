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
  const result = await fetchActiveJobs();

  // Graceful degradation: if the DB is unavailable, render an empty board.
  const jobs = "data" in result && result.data != null ? result.data : [];

  return (
    <div className="flex flex-col min-h-full">
      {/* Page header */}
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-4xl font-black text-white tracking-tight">
          Active Jobs
        </h1>
        <p className="text-base text-gray-400 mt-1">
          Tap a stage to expand · tap a card to continue.
        </p>
      </header>

      {/* Error banner — shown if DB query failed but we still render the board */}
      {"error" in result && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-xl bg-danger-950 border border-danger-700 px-4 py-3 text-sm text-danger-400"
        >
          Could not load jobs: {result.error}
        </div>
      )}

      {/* Interactive board */}
      <JobsBoard jobs={jobs} />
    </div>
  );
}
