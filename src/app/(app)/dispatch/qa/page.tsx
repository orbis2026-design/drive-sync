/**
 * QA & Dispatch Command Center — Server Page  (Issue #62)
 *
 * Renders the Shop Owner's QA inbox. Pulls WorkOrders that have been flagged
 * by Field Techs for either:
 *   • Pre-existing damage    (hasDamageFlag = true)
 *   • Pending change order   (status = BLOCKED_WAITING_APPROVAL)
 *
 * File scope: src/app/(app)/dispatch/qa/page.tsx
 */

import { prisma } from "@/lib/prisma";
import { QaDispatchClient } from "./QaDispatchClient";
import { getTenantId } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types shared with the client component
// ---------------------------------------------------------------------------

export type QaWorkOrder = {
  id: string;
  title: string;
  notes: string | null;
  hasDamageFlag: boolean;
  isChangeOrder: boolean; // true when status = BLOCKED_WAITING_APPROVAL
  vehicleLabel: string;   // e.g. "2020 Ford Transit — ABC-1234"
  clientName: string;
  mediaUrls: string[];    // Cloudflare R2 public URLs for inspection photos/video
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

/**
 * Derives the expected Cloudflare R2 public URLs for a WorkOrder's
 * pre-inspection media. The pre-check upload route stores files under
 * the path: pre-check/<workOrderId>/<filename>.
 *
 * Since the R2 bucket does not expose a directory listing, we fetch the
 * index from the work order's notes field which the pre-check page writes
 * as a JSON blob (["filename1.jpg","filename2.mp4"]).
 */
function parseMediaUrls(workOrderId: string, notes: string | null): string[] {
  if (!R2_PUBLIC_URL || !notes) return [];
  try {
    const fileNames = JSON.parse(notes) as string[];
    if (!Array.isArray(fileNames)) return [];
    return fileNames.map(
      (name) => `${R2_PUBLIC_URL}/pre-check/${workOrderId}/${name}`,
    );
  } catch {
    return [];
  }
}

async function fetchQaQueue(): Promise<QaWorkOrder[]> {
  const tenantId = await getTenantId();
  if (!tenantId) return [];

  try {
    const rows = await prisma.workOrder.findMany({
      where: {
        tenantId,
        OR: [
          { hasDamageFlag: true },
          { status: "BLOCKED_WAITING_APPROVAL" },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        notes: true,
        status: true,
        hasDamageFlag: true,
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            plate: true,
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    type QaRow = {
      id: string;
      title: string;
      notes: string | null;
      status: string;
      hasDamageFlag: boolean;
      vehicle: {
        make: string | null;
        model: string | null;
        year: number | null;
        plate: string | null;
        client: { firstName: string; lastName: string };
      };
    };

    return (rows as QaRow[]).map((wo) => {
      const plate = wo.vehicle.plate ? ` — ${wo.vehicle.plate}` : "";
      const vehicleLabel = `${wo.vehicle.year ?? ""} ${wo.vehicle.make ?? ""} ${wo.vehicle.model ?? ""}${plate}`.trim();
      return {
        id: wo.id,
        title: wo.title,
        notes: wo.notes,
        hasDamageFlag: wo.hasDamageFlag,
        isChangeOrder: wo.status === "BLOCKED_WAITING_APPROVAL",
        vehicleLabel,
        clientName: `${wo.vehicle.client.firstName} ${wo.vehicle.client.lastName}`,
        mediaUrls: parseMediaUrls(wo.id, wo.notes),
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const metadata = {
  title: "QA & Dispatch Inbox — DriveSync",
  description:
    "Review tech-flagged damage reports and change orders before the client is billed.",
};

export default async function QaDispatchPage() {
  const workOrders = await fetchQaQueue();
  return <QaDispatchClient workOrders={workOrders} />;
}
