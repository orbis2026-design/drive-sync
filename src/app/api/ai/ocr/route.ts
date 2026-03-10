/**
 * POST /api/ai/ocr
 *
 * Accepts a base64-encoded image (receipt or dashboard photo) and runs it
 * through the OpenAI Vision API with a strict system prompt.
 *
 * The model returns JSON matching one of two schemas:
 *   Receipt:   { type: "receipt", vendor: string, total: number, line_items: LineItem[] }
 *   Dashboard: { type: "dashboard", warning_lights: string[] }
 *
 * Request body:
 *   { base64Image: string; mimeType?: string }
 *
 * Response:
 *   { result: ReceiptResult | DashboardResult }
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LineItem {
  description: string;
  amount: number;
}

export interface ReceiptResult {
  type: "receipt";
  vendor: string | null;
  total: number | null;
  line_items: LineItem[];
}

export interface DashboardResult {
  type: "dashboard";
  warning_lights: string[];
}

export type OcrResult = ReceiptResult | DashboardResult;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You are a precision OCR engine for an auto-repair shop app. ' +
  'When given an image, determine whether it shows a RECEIPT or a CAR DASHBOARD, then respond with ONLY valid JSON — no markdown, no prose, no code fences.\n\n' +
  'If it is a RECEIPT, output exactly:\n' +
  '{"type":"receipt","vendor":"<store name or null>","total":<dollar amount as number or null>,"line_items":[{"description":"<item>","amount":<dollars>}]}\n\n' +
  'If it is a CAR DASHBOARD, output exactly:\n' +
  '{"type":"dashboard","warning_lights":["<light name>","<light name>"]}\n\n' +
  'Extract all illuminated warning lights by their standard names (e.g. "Check Engine", "ABS", "Low Tire Pressure"). ' +
  'For receipts, extract every line item, the vendor name, and the grand total. ' +
  'Output ONLY the JSON object — no other text.';

/** Max base64 size ~10 MB decoded */
const MAX_BASE64_BYTES = 14_000_000;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      base64Image?: unknown;
      mimeType?: unknown;
    };

    const { base64Image, mimeType = "image/jpeg" } = body;

    if (!base64Image || typeof base64Image !== "string") {
      return NextResponse.json(
        { error: "base64Image is required." },
        { status: 400 }
      );
    }

    if (base64Image.length > MAX_BASE64_BYTES) {
      return NextResponse.json(
        { error: "Image too large. Please use an image under 10 MB." },
        { status: 413 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 503 }
      );
    }

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "high",
              },
            },
            { type: "text", text: "Analyze this image and return the JSON." },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";

    let result: OcrResult;
    try {
      result = JSON.parse(raw) as OcrResult;
    } catch {
      // Try to extract JSON if the model wrapped it despite instructions
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]) as OcrResult;
      } else {
        return NextResponse.json(
          { error: "AI returned an unexpected format. Please try again." },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ result });
  } catch (err) {
    logger.error("OCR API request failed", { service: "openai" }, err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
