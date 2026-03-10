/**
 * src/lib/email.ts
 *
 * Email delivery via Resend.
 *
 * Required environment variable:
 *   RESEND_API_KEY — API key from https://resend.com
 *   EMAIL_FROM     — Verified sender address (defaults to onboarding@resend.dev)
 */

import { Resend } from "resend";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!_resend) {
    _resend = new Resend(apiKey);
  }
  return _resend;
}

// ---------------------------------------------------------------------------
// Send contract PDF
// ---------------------------------------------------------------------------

export interface SendContractEmailInput {
  /** Recipient email address */
  to: string;
  /** Customer name for personalization */
  clientName: string;
  /** Shop name shown in the email */
  shopName: string;
  /** Work order identifier */
  workOrderId: string;
  /** Binary PDF content */
  pdfBuffer: Buffer;
  /** Filename for the attachment */
  pdfFileName: string;
}

/**
 * Sends the signed contract PDF to the customer via email.
 * Returns `true` on success, `false` if the email provider is not configured
 * or the send fails (best-effort).
 */
export async function sendContractEmail(
  input: SendContractEmailInput,
): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn("RESEND_API_KEY not set — skipping contract email delivery", { service: "email" });
    return false;
  }

  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: `Your Signed Authorization — Work Order ${input.workOrderId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Signed Authorization</h2>
          <p>Hi ${input.clientName},</p>
          <p>
            Attached is your signed authorization for Work Order
            <strong>${input.workOrderId}</strong> at
            <strong>${input.shopName}</strong>.
          </p>
          <p>
            Please keep this document for your records. It contains the full
            details of the authorized work and your electronic signature.
          </p>
          <hr />
          <p style="font-size: 12px; color: #666;">
            This email was sent by DriveSync on behalf of ${input.shopName}.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: input.pdfFileName,
          content: input.pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (error) {
      logger.error("Failed to send contract email", { service: "email", workOrderId: input.workOrderId }, error);
      return false;
    }

    logger.info("Contract PDF emailed", { service: "email", recipient: input.to, workOrderId: input.workOrderId });
    return true;
  } catch (err) {
    logger.error("Unexpected error sending contract email", { service: "email" }, err);
    return false;
  }
}
