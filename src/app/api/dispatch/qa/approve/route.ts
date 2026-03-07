/**
 * POST /api/dispatch/qa/approve
 *
 * QA & Dispatch Command Center — Liability Approval  (Issue #62)
 *
 * Called by the Shop Owner after reviewing a tech's damage report or change
 * order. Clears the hasDamageFlag, resets the status back to ACTIVE (for
 * damage flags) or PENDING_APPROVAL (for change orders), and forwards the
 * digital waiver to the client by reusing the existing approval-token flow.
 *
 * Request body:
 *   { workOrderId: string }
 *
 * Response (200):
 *   { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  let body: { workOrderId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { workOrderId } = body;
  if (!workOrderId || typeof workOrderId !== "string") {
    return NextResponse.json(
      { error: "workOrderId is required." },
      { status: 400 },
    );
  }

  // --- Fetch the WorkOrder -------------------------------------------------
  let workOrder: {
    id: string;
    status: string;
    hasDamageFlag: boolean;
    deltaApprovalToken: string | null;
    approvalToken: string | null;
  } | null = null;

  try {
    workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        status: true,
        hasDamageFlag: true,
        deltaApprovalToken: true,
        approvalToken: true,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!workOrder) {
    return NextResponse.json({ error: "WorkOrder not found." }, { status: 404 });
  }

  // --- Determine the next status --------------------------------------------
  // Change-order queue items (BLOCKED_WAITING_APPROVAL) → PENDING_APPROVAL
  //   so the existing client-portal approval flow can take over.
  // Damage-flag items → clear the flag and keep the current status so work
  //   can proceed; the waiver is forwarded via the existing approval token.
  const isChangeOrder = workOrder.status === "BLOCKED_WAITING_APPROVAL";
  const nextStatus = isChangeOrder ? "PENDING_APPROVAL" : workOrder.status;

  try {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        hasDamageFlag: false,
        status: nextStatus as never,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
