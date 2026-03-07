"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { BLAST_AUDIENCES } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueuedMessage = {
  id: string;
  phoneNumber: string | null;
  message: string;
  campaignType: string;
  createdAt: string;
  client: { firstName: string; lastName: string } | null;
};

export type { BlastAudience } from "./constants";

// ---------------------------------------------------------------------------
// Simulated Twilio SMS helper
// ---------------------------------------------------------------------------

async function simulateSendSMS(
  to: string | null,
  body: string,
): Promise<void> {
  // In production replace with:
  //   const twilio = require('twilio');
  //   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  //   await client.messages.create({ from: process.env.TWILIO_PHONE_NUMBER, to, body });
  console.log(
    `[Twilio Sim] → ${to ?? "unknown"}: ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 80)); // simulate network
}

// ---------------------------------------------------------------------------
// fetchQueuedMessages
// ---------------------------------------------------------------------------

export async function fetchQueuedMessages(): Promise<
  { data: QueuedMessage[] } | { error: string }
> {
  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    const rows = await prisma.outboundCampaign.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "QUEUED",
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        phoneNumber: true,
        message: true,
        campaignType: true,
        createdAt: true,
        client: { select: { firstName: true, lastName: true } },
      },
    });

    const data: QueuedMessage[] = rows.map((r) => ({
      id: r.id,
      phoneNumber: r.phoneNumber,
      message: r.message,
      campaignType: r.campaignType,
      createdAt: r.createdAt.toISOString(),
      client: r.client,
    }));

    return { data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load messages.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// approveAndSendMessage
// ---------------------------------------------------------------------------

export async function approveAndSendMessage(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const campaign = await prisma.outboundCampaign.findUnique({
      where: { id },
    });
    if (!campaign) return { error: "Message not found." };
    if (campaign.status !== "QUEUED")
      return { error: "Message is no longer queued." };

    await simulateSendSMS(campaign.phoneNumber, campaign.message);

    await prisma.outboundCampaign.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
    });

    revalidatePath("/marketing");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send message.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// discardMessage
// ---------------------------------------------------------------------------

export async function discardMessage(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const campaign = await prisma.outboundCampaign.findUnique({
      where: { id },
    });
    if (!campaign) return { error: "Message not found." };
    if (campaign.status !== "QUEUED")
      return { error: "Message is no longer queued." };

    await prisma.outboundCampaign.update({
      where: { id },
      data: { status: "DISCARDED" },
    });

    revalidatePath("/marketing");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to discard message.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// sendBlastCampaign
// ---------------------------------------------------------------------------

export async function sendBlastCampaign(
  audience: string,
  message: string,
): Promise<{ success: true; sent: number } | { error: string }> {
  if (!message.trim()) return { error: "Message text is required." };
  if (!BLAST_AUDIENCES.find((a) => a.value === audience))
    return { error: "Invalid audience selection." };

  const tenantId = process.env.DEMO_TENANT_ID;

  try {
    // Determine eligible clients
    const cutoff = new Date();
    let clientIds: string[] = [];

    if (audience === "INACTIVE_6M" || audience === "INACTIVE_3M") {
      const months = audience === "INACTIVE_6M" ? 6 : 3;
      cutoff.setMonth(cutoff.getMonth() - months);

      const recentClients = await prisma.workOrder.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          closedAt: { gte: cutoff },
        },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      const recentIds = new Set(recentClients.map((r) => r.clientId));

      const all = await prisma.client.findMany({
        where: tenantId ? { tenantId } : {},
        select: { id: true },
      });
      clientIds = all.map((c) => c.id).filter((id) => !recentIds.has(id));
    } else if (audience === "OIL_DUE") {
      // Clients whose last work order was > 5 000 miles / 6 months ago (approx)
      cutoff.setMonth(cutoff.getMonth() - 6);
      const old = await prisma.workOrder.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          closedAt: { lte: cutoff },
        },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      clientIds = old.map((r) => r.clientId);
    } else {
      // ALL
      const all = await prisma.client.findMany({
        where: tenantId ? { tenantId } : {},
        select: { id: true },
      });
      clientIds = all.map((c) => c.id);
    }

    if (clientIds.length === 0) {
      return { success: true, sent: 0 };
    }

    // Fetch phone numbers for eligible clients
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, phone: true },
    });

    // Send (simulate) + create campaign rows
    const firstTenantId = tenantId ?? (await prisma.tenant.findFirst())?.id;
    if (!firstTenantId) return { error: "Tenant not configured." };

    await Promise.all(
      clients.map(async (c) => {
        await simulateSendSMS(c.phone, message);
        await prisma.outboundCampaign.create({
          data: {
            tenantId: firstTenantId,
            clientId: c.id,
            phoneNumber: c.phone,
            message,
            campaignType: "BLAST",
            audience,
            status: "SENT",
            sentAt: new Date(),
          },
        });
      }),
    );

    revalidatePath("/marketing");
    return { success: true, sent: clients.length };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send campaign.";
    return { error: message };
  }
}
