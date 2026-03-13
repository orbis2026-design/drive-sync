import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getWorkOrderForHubCached,
  getFieldTechsForTenantCached,
  getWorkOrderTimelineCached,
} from "./data";
import { JobCardHubClient } from "./JobCardHubClient";

export const metadata = {
  title: "Job — Boltbook",
  description: "Work order dashboard: pre-inspection, package, waivers, payment.",
};

export default async function WorkOrderHubPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = await params;

  const [workOrderResult, techsResult, timelineResult] = await Promise.all([
    getWorkOrderForHubCached(workOrderId),
    getFieldTechsForTenantCached(),
    getWorkOrderTimelineCached(workOrderId),
  ]);

  if ("error" in workOrderResult) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-white">Unable to open job</h1>
          <p className="text-sm text-gray-300">
            {workOrderResult.error || "This work order could not be loaded for your account."}
          </p>
          <p className="text-xs text-gray-500">
            If this problem persists, check that your user&apos;s tenant matches the job or contact
            an administrator.
          </p>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center rounded-lg bg-brand-400 px-4 py-2 text-sm font-medium text-black hover:bg-brand-300 transition-colors"
          >
            Back to jobs
          </Link>
        </div>
      </div>
    );
  }

  const fieldTechs = "data" in techsResult ? techsResult.data : [];
  const events = "data" in timelineResult ? timelineResult.data : [];

  return (
    <JobCardHubClient
      workOrder={workOrderResult.data}
      fieldTechs={fieldTechs}
      events={events}
    />
  );
}
