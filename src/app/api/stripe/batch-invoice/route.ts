/**
 * POST /api/stripe/batch-invoice
 *
 * Fleet Manager Batch Invoicing Engine  (Issue #61)
 *
 * Accepts a list of WorkOrder IDs for a single commercial fleet client,
 * maps them as individual line items on a consolidated Stripe Invoice, and
 * marks each WorkOrder as BATCHED_PENDING_PAYMENT in the database.
 *
 * Request body:
 *   {
 *     clientId:     string,     // Prisma Client ID
 *     workOrderIds: string[],   // Array of WorkOrder IDs to include
 *   }
 *
 * Response (200):
 *   {
 *     invoiceId:  string,   // Stripe Invoice ID (in_…)
 *     invoiceUrl: string,   // Hosted Stripe Invoice URL for the client
 *   }
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY   — Stripe secret API key
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Stripe client (lazy)
// ---------------------------------------------------------------------------

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set.");
  }
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // --- Parse body -----------------------------------------------------------
  let body: { clientId?: string; workOrderIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { clientId, workOrderIds } = body;

  if (!clientId || typeof clientId !== "string") {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }
  if (
    !Array.isArray(workOrderIds) ||
    workOrderIds.length === 0 ||
    workOrderIds.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      { error: "workOrderIds must be a non-empty array of strings." },
      { status: 400 },
    );
  }

  // --- Fetch client + work orders from DB ----------------------------------
  let client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    tenant: { id: string; name: string; stripeCustomerId: string | null };
  } | null = null;

  try {
    client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        tenant: {
          select: { id: true, name: true, stripeCustomerId: true },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  // Fetch only the requested WorkOrders that belong to this client and are
  // in a billable status (COMPLETE or INVOICED).
  let workOrders: {
    id: string;
    title: string;
    laborCents: number;
    partsCents: number;
    vehicle: { make: string; model: string; year: number; plate: string | null };
  }[] = [];

  try {
    workOrders = await prisma.workOrder.findMany({
      where: {
        id: { in: workOrderIds },
        clientId,
        status: { in: ["COMPLETE", "INVOICED", "PENDING_APPROVAL"] },
      },
      select: {
        id: true,
        title: true,
        laborCents: true,
        partsCents: true,
        vehicle: {
          select: { make: true, model: true, year: true, plate: true },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (workOrders.length === 0) {
    return NextResponse.json(
      { error: "No billable WorkOrders found for the provided IDs." },
      { status: 404 },
    );
  }

  // --- Build Stripe Invoice -------------------------------------------------
  let invoice: Stripe.Invoice;
  try {
    const stripe = getStripe();
    const stripeCustomerId = client.tenant.stripeCustomerId;

    // Resolve or create a Stripe Customer for this fleet client.
    let stripeCustomer: string | undefined;
    if (stripeCustomerId) {
      stripeCustomer = stripeCustomerId;
    } else if (client.email) {
      // Look for an existing customer by email, or create one.
      const existing = await stripe.customers.list({
        email: client.email,
        limit: 1,
      });
      if (existing.data.length > 0) {
        stripeCustomer = existing.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          name: `${client.firstName} ${client.lastName}`,
          email: client.email,
          metadata: { clientId, tenantId: client.tenant.id },
        });
        stripeCustomer = newCustomer.id;
      }
    }

    // Create a draft invoice.
    invoice = await stripe.invoices.create({
      customer: stripeCustomer,
      collection_method: "send_invoice",
      // Net-30 payment terms for fleet commercial accounts.
      days_until_due: 30,
      description: `Batch fleet invoice — ${client.firstName} ${client.lastName} — ${client.tenant.name}`,
      metadata: {
        clientId,
        tenantId: client.tenant.id,
        workOrderCount: String(workOrders.length),
      },
    });

    // Add each WorkOrder as an individual line item.
    for (const wo of workOrders) {
      const plate = wo.vehicle.plate ? `Van ${wo.vehicle.plate}` : "Vehicle";
      const vehicleDesc = `${plate} — ${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}`;
      const totalCents = wo.laborCents + wo.partsCents;

      await stripe.invoiceItems.create({
        customer: stripeCustomer,
        invoice: invoice.id,
        amount: totalCents,
        currency: "usd",
        description: `${vehicleDesc} — ${wo.title}`,
        metadata: { workOrderId: wo.id },
      });
    }

    // Finalize the invoice so it's ready to send (moves from draft → open).
    invoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // Email the consolidated Net-30 bill directly to the Fleet Manager.
    invoice = await stripe.invoices.sendInvoice(invoice.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // --- Mark WorkOrders as BATCHED_PENDING_PAYMENT in the DB ----------------
  try {
    await prisma.workOrder.updateMany({
      where: { id: { in: workOrders.map((wo) => wo.id) } },
      data: { status: "BATCHED_PENDING_PAYMENT" },
    });
  } catch (err) {
    // Non-fatal: the Stripe invoice was created — log and return partial success.
    console.error(
      "[batch-invoice] Failed to update WorkOrder statuses:",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    invoiceId: invoice.id,
    invoiceUrl: invoice.hosted_invoice_url,
  });
}
