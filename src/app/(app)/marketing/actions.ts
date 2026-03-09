"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { BLAST_AUDIENCES } from "./constants";
import { getTenantId } from "@/lib/auth";
import { sendSMS } from "@/lib/twilio";

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

export type RetentionQueueItem = {
  clientId: string;
  clientName: string;
  phone: string;
  vehicleId: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  currentMileage: number;
  approachingMilestone: number;
  smsDraft: string;
};

export type SentLogItem = {
  id: string;
  phoneNumber: string | null;
  message: string;
  sentAt: string | null;
  clientName: string | null;
};

export type { BlastAudience } from "./constants";

// ---------------------------------------------------------------------------
// Constants for retention queue
// ---------------------------------------------------------------------------

const AVG_DAILY_MILES = 37;
const CRITICAL_MILESTONES = [30_000, 60_000, 90_000];
const LOOK_AHEAD_MILES = 3_000;

// ---------------------------------------------------------------------------
// fetchQueuedMessages
// ---------------------------------------------------------------------------

export async function fetchQueuedMessages(): Promise<
  { data: QueuedMessage[] } | { error: string }
> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    const rows = await prisma.outboundCampaign.findMany({
      where: {
        tenantId,
        status: "QUEUED",
        client: { opted_out_sms: false },
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

    const data: QueuedMessage[] = rows.map((r: (typeof rows)[number]) => ({
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
// fetchRetentionQueue
// ---------------------------------------------------------------------------

export async function fetchRetentionQueue(): Promise<
  { data: RetentionQueueItem[] } | { error: string }
> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: {
        tenantId,
        mileageIn: { not: null },
        client: { opted_out_sms: false },
      },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        mileageIn: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            opted_out_sms: true,
          },
        },
        workOrders: {
          orderBy: { closedAt: "desc" },
          take: 1,
          select: { closedAt: true },
        },
      },
    });

    const bookingBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.drivesync.app";

    const queue: RetentionQueueItem[] = [];

    for (const vehicle of vehicles) {
      if (!vehicle.mileageIn || !vehicle.client) continue;
      if (vehicle.client.opted_out_sms) continue;

      const lastServiceDate =
        vehicle.workOrders[0]?.closedAt ?? null;

      const daysSince = lastServiceDate
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(lastServiceDate).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : 0;

      const projectedMileage = vehicle.mileageIn + daysSince * AVG_DAILY_MILES;

      for (const base of CRITICAL_MILESTONES) {
        const nextOccurrence = Math.ceil(projectedMileage / base) * base;
        const milesAway = nextOccurrence - projectedMileage;

        if (milesAway > LOOK_AHEAD_MILES) continue;

        const milestoneK = nextOccurrence / 1_000;
        const smsDraft =
          `Hi ${vehicle.client.firstName}, your ${vehicle.make} ${vehicle.model} is approaching its ` +
          `${milestoneK}k service interval. Book your appointment: ${bookingBaseUrl}/request/${tenantId}`;

        queue.push({
          clientId: vehicle.client.id,
          clientName: `${vehicle.client.firstName} ${vehicle.client.lastName}`,
          phone: vehicle.client.phone,
          vehicleId: vehicle.id,
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          vehicleYear: vehicle.year,
          currentMileage: projectedMileage,
          approachingMilestone: nextOccurrence,
          smsDraft,
        });
        break; // Only queue the nearest milestone per vehicle
      }
    }

    return { data: queue };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load retention queue.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// fetchSentLog
// ---------------------------------------------------------------------------

export async function fetchSentLog(): Promise<
  { data: SentLogItem[] } | { error: string }
> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    const rows = await prisma.outboundCampaign.findMany({
      where: { tenantId, status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: 50,
      select: {
        id: true,
        phoneNumber: true,
        message: true,
        sentAt: true,
        client: { select: { firstName: true, lastName: true } },
      },
    });

    const data: SentLogItem[] = rows.map((r: (typeof rows)[number]) => ({
      id: r.id,
      phoneNumber: r.phoneNumber,
      message: r.message,
      sentAt: r.sentAt?.toISOString() ?? null,
      clientName: r.client
        ? `${r.client.firstName} ${r.client.lastName}`
        : null,
    }));

    return { data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load sent log.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// fetchAutoRetentionStatus
// ---------------------------------------------------------------------------

export async function fetchAutoRetentionStatus(): Promise<
  { enabled: boolean } | { error: string }
> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { autoRetentionEnabled: true },
    });
    return { enabled: tenant?.autoRetentionEnabled ?? true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load retention status.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// toggleAutoRetention
// ---------------------------------------------------------------------------

export async function toggleAutoRetention(
  enabled: boolean,
): Promise<{ success: true } | { error: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { autoRetentionEnabled: enabled },
    });
    revalidatePath("/marketing");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update retention toggle.";
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// approveAndSendMessage
// ---------------------------------------------------------------------------

export async function approveAndSendMessage(
  id: string,
): Promise<{ success: true } | { error: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    const campaign = await prisma.outboundCampaign.findFirst({
      where: { id, tenantId },
      include: { client: { select: { opted_out_sms: true } } },
    });
    if (!campaign) return { error: "Message not found." };
    if (campaign.status !== "QUEUED")
      return { error: "Message is no longer queued." };

    // Check opt-out status before sending.
    if (campaign.client?.opted_out_sms) {
      return { error: "Client has opted out of SMS messages." };
    }

    if (campaign.phoneNumber) {
      const smsResult = await sendSMS(campaign.phoneNumber, campaign.message);
      if (!smsResult.success) {
        return { error: `SMS delivery failed: ${smsResult.error}` };
      }
    }

    await prisma.outboundCampaign.updateMany({
      where: { id, tenantId },
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
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    const campaign = await prisma.outboundCampaign.findFirst({
      where: { id, tenantId },
    });
    if (!campaign) return { error: "Message not found." };
    if (campaign.status !== "QUEUED")
      return { error: "Message is no longer queued." };

    await prisma.outboundCampaign.updateMany({
      where: { id, tenantId },
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
// sendRetentionSms — sends a single retention SMS for a specific client
// ---------------------------------------------------------------------------

export async function sendRetentionSms(
  clientId: string,
  phone: string,
  message: string,
): Promise<{ success: true } | { error: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    // Verify client hasn't opted out.
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { opted_out_sms: true },
    });
    if (client?.opted_out_sms) {
      return { error: "Client has opted out of SMS messages." };
    }

    const smsResult = await sendSMS(phone, message);
    if (!smsResult.success) {
      return { error: `SMS delivery failed: ${smsResult.error}` };
    }

    await prisma.outboundCampaign.create({
      data: {
        tenantId,
        clientId,
        phoneNumber: phone,
        message,
        campaignType: "AI_GENERATED",
        status: "SENT",
        sentAt: new Date(),
      },
    });

    revalidatePath("/marketing");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send retention SMS.";
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

  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Authentication required." };

  try {
    // Determine eligible clients — always exclude opted-out clients.
    const cutoff = new Date();
    let clientIds: string[] = [];

    if (audience === "INACTIVE_6M" || audience === "INACTIVE_3M") {
      const months = audience === "INACTIVE_6M" ? 6 : 3;
      cutoff.setMonth(cutoff.getMonth() - months);

      const recentClients = await prisma.workOrder.findMany({
        where: {
          tenantId,
          closedAt: { gte: cutoff },
        },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      const recentIds = new Set(recentClients.map((r: (typeof recentClients)[number]) => r.clientId));

      const all = await prisma.client.findMany({
        where: { tenantId, opted_out_sms: false },
        select: { id: true },
      });
      clientIds = all.map((c: (typeof all)[number]) => c.id).filter((id: string) => !recentIds.has(id));
    } else if (audience === "OIL_DUE") {
      // Clients whose last work order was > 5 000 miles / 6 months ago (approx)
      cutoff.setMonth(cutoff.getMonth() - 6);
      const old = await prisma.workOrder.findMany({
        where: {
          tenantId,
          closedAt: { lte: cutoff },
          client: { opted_out_sms: false },
        },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      clientIds = old.map((r: (typeof old)[number]) => r.clientId);
    } else {
      // ALL — excluding opted-out clients
      const all = await prisma.client.findMany({
        where: { tenantId, opted_out_sms: false },
        select: { id: true },
      });
      clientIds = all.map((c: (typeof all)[number]) => c.id);
    }

    if (clientIds.length === 0) {
      return { success: true, sent: 0 };
    }

    // Fetch phone numbers for eligible clients
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds }, opted_out_sms: false },
      select: { id: true, phone: true },
    });

    // Send SMS + create campaign rows
    await Promise.all(
      clients.map(async (c: (typeof clients)[number]) => {
        if (c.phone) {
          const smsResult = await sendSMS(c.phone, message);
          if (!smsResult.success) {
            console.error(
              `[marketing] SMS to client ${c.id} failed:`,
              smsResult.error,
            );
          }
        }
        await prisma.outboundCampaign.create({
          data: {
            tenantId,
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
