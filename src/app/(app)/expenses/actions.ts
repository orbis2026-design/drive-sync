"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OcrResult = {
  vendor: string | null;
  amount: number | null; // in dollars e.g. 45.12
  rawText: string;
};

export type ExpenseRecord = {
  id: string;
  tenant_id: string;
  amount: number;
  vendor: string;
  category: string;
  receipt_image_url: string | null;
  created_at: string;
};

// ─── Upload receipt image and run OCR ─────────────────────────────────────────

/**
 * Accepts a FormData with a `receipt` file field.
 * Uploads to Supabase Storage, then asks the AI to extract Vendor + Total.
 */
export async function uploadAndParseReceipt(
  formData: FormData
): Promise<{ data: OcrResult; imageUrl: string } | { error: string }> {
  const file = formData.get("receipt") as File | null;
  if (!file) return { error: "No receipt image provided." };

  const supabase = createAdminClient();
  const { tenantId } = await verifySession();

  // ── Upload image to Supabase Storage ──────────────────────────────────────
  const fileName = `${tenantId}/${Date.now()}-${file.name}`;
  const arrayBuffer = await file.arrayBuffer();
  const { data: storageData, error: storageError } = await supabase.storage
    .from("receipts")
    .upload(fileName, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (storageError) {
    return { error: `Storage upload failed: ${storageError.message}` };
  }

  const { data: publicUrlData } = supabase.storage
    .from("receipts")
    .getPublicUrl(storageData.path);
  const imageUrl = publicUrlData.publicUrl;

  // ── OCR via OpenAI Vision ─────────────────────────────────────────────────
  let vendor: string | null = null;
  let amount: number | null = null;
  let rawText = "";

  if (OPENAI_API_KEY) {
    try {
      // Convert file to base64 for the vision model
      const b64 = Buffer.from(arrayBuffer).toString("base64");

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 256,
          messages: [
            {
              role: "system",
              content:
                'You are a receipt parser. Extract the store name and total amount from the receipt image. Output ONLY valid JSON with two fields: "vendor" (string) and "amount" (number, dollars, e.g. 45.12). No markdown, no prose.',
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${file.type || "image/jpeg"};base64,${b64}`,
                    detail: "low",
                  },
                },
                { type: "text", text: "Parse this receipt." },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const json = await response.json();
        rawText = json.choices?.[0]?.message?.content ?? "";
        try {
          const parsed = JSON.parse(rawText);
          vendor = parsed.vendor ?? null;
          amount =
            typeof parsed.amount === "number" ? parsed.amount : null;
        } catch {
          // Best-effort extraction if JSON parse fails
          const amtMatch = rawText.match(/\d+(?:\.\d{1,2})?/);
          if (amtMatch) amount = parseFloat(amtMatch[0]);
        }
      }
    } catch {
      // Non-fatal — let the user correct manually
    }
  }

  return {
    data: { vendor, amount, rawText },
    imageUrl,
  };
}

// ─── Confirm and save expense ─────────────────────────────────────────────────

export async function confirmExpense(payload: {
  amount: number;
  vendor: string;
  category: string;
  receiptImageUrl: string | null;
  workOrderId?: string | null;
}): Promise<{ data: ExpenseRecord } | { error: string }> {
  const { amount, vendor, category, receiptImageUrl, workOrderId } = payload;

  if (!amount || amount <= 0) return { error: "Amount must be greater than 0." };
  if (!vendor.trim()) return { error: "Vendor name is required." };

  const supabase = createAdminClient();
  const { tenantId } = await verifySession();

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      tenant_id: tenantId,
      amount,
      vendor: vendor.trim(),
      category: category.trim() || "General",
      receipt_image_url: receiptImageUrl ?? null,
      work_order_id: workOrderId ?? null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { data: data as ExpenseRecord };
}

// ─── List expenses ────────────────────────────────────────────────────────────

export async function fetchExpenses(): Promise<
  { data: ExpenseRecord[] } | { error: string }
> {
  const supabase = createAdminClient();
  const { tenantId } = await verifySession();

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { error: error.message };
  return { data: (data as ExpenseRecord[]) ?? [] };
}
