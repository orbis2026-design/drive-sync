import { redirect } from "next/navigation";
import { getWorkOrderForHub, getFieldTechsForTenant, getWorkOrderTimeline } from "./actions";
import { JobCardHubClient } from "./JobCardHubClient";

export const metadata = {
  title: "Job — DriveSync",
  description: "Work order hub: status, actions, and links.",
};

export default async function WorkOrderHubPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = await params;

  const [workOrderResult, techsResult, timelineResult] = await Promise.all([
    getWorkOrderForHub(workOrderId),
    getFieldTechsForTenant(),
    getWorkOrderTimeline(workOrderId),
  ]);

  if ("error" in workOrderResult) {
    redirect("/jobs");
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
