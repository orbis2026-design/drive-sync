/**
 * POST /api/lexicon/universal-scan
 *
 * Dual-mode OCR scanner:
 *   1. Submits the image to GPT-4o Vision to detect a VIN or license plate.
 *   2. If a VIN is found directly, returns it immediately.
 *   3. If a license plate is found, calls the configured L2V (License-to-VIN)
 *      data broker to resolve the plate → 17-digit VIN.
 *   4. Once a VIN is obtained (directly or via L2V), triggers the
 *      /api/lexicon/extract worker to hit the GlobalVehicles cache and pull
 *      oil/fluid capacities, maintenance schedules, and TSBs.
 *
 * Environment variables:
 *   OPENAI_API_KEY       — required for Vision OCR
 *   L2V_API_URL          — L2V provider base URL (e.g. https://api.epicvin.com)
 *   L2V_API_KEY          — API key for the L2V provider
 *   LEXICON_SECRET       — shared secret for /api/lexicon/extract
 *   NEXT_PUBLIC_SITE_URL — base URL for internal fetch calls
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

interface ScanResult {
  type: "VIN" | "PLATE" | "NONE";
  value: string;
  confidence: number;
  state?: string;
  /** Present when a PLATE was resolved to a VIN via the L2V provider. */
  vin?: string;
  /** Populated once the resolved VIN has been run through /api/lexicon/extract. */
  vehicle?: Record<string, unknown>;
}

const SCAN_PROMPT = `Analyze this image. Determine if it contains:
1. A 1D or 2D VIN barcode — extract the 17-character VIN
2. A text VIN stamped/printed on a vehicle — extract the 17-character VIN
3. A US license plate (including specialty/handicap) — extract the plate text and state if visible
4. None of the above

Respond in strict JSON: { "type": "VIN" | "PLATE" | "NONE", "value": string, "confidence": number, "state"?: string }`;

// ---------------------------------------------------------------------------
// L2V helper — resolves "7ABC123 CA" → 17-digit VIN
// ---------------------------------------------------------------------------

/**
 * Calls the configured L2V (License-to-VIN) data broker.
 * Returns the 17-character VIN, or null if the plate could not be resolved.
 *
 * Supported providers (configure via env):
 *   - Commercial: set L2V_API_URL + L2V_API_KEY (EpicVIN, DataOne, etc.)
 *   - Dev fallback: returns null (no VIN resolution in local dev)
 */
async function resolvePlateToVin(
  plate: string,
  state: string | undefined,
): Promise<string | null> {
  const l2vUrl = process.env.L2V_API_URL;
  const l2vApiKey = process.env.L2V_API_KEY;

  if (!l2vUrl || !l2vApiKey) {
    // No L2V provider configured — skip resolution in development.
    return null;
  }

  try {
    const searchParams = new URLSearchParams({ plate });
    if (state) searchParams.set("state", state);

    const res = await fetch(
      `${l2vUrl.replace(/\/$/, "")}/vin?${searchParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${l2vApiKey}`,
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      console.warn(`[universal-scan] L2V provider returned HTTP ${res.status} for plate "${plate}"`);
      return null;
    }

    const data = await res.json() as
      | { vin?: string; VIN?: string; data?: { vin?: string } }
      | null;

    const vin =
      data?.vin ??
      data?.VIN ??
      data?.data?.vin ??
      null;

    if (typeof vin === "string" && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return vin.toUpperCase();
    }

    return null;
  } catch (err) {
    console.error("[universal-scan] L2V lookup error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lexicon extract helper — triggers the GlobalVehicles cache worker
// ---------------------------------------------------------------------------

/**
 * Calls /api/lexicon/extract with the supplied VIN so vehicle data
 * (maintenance schedule, fluid capacities, TSBs) is fetched and cached.
 * Returns the vehicle data record on success, or null on failure.
 */
async function triggerLexiconExtract(
  vin: string,
): Promise<Record<string, unknown> | null> {
  const lexiconSecret = process.env.LEXICON_SECRET;
  if (!lexiconSecret) return null;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/lexicon/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lexiconSecret}`,
      },
      body: JSON.stringify({ vin }),
    });

    if (!res.ok) {
      // A 409 means the VIN is already cached — that's fine.
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        return body;
      }
      console.warn(`[universal-scan] Lexicon extract returned HTTP ${res.status} for VIN "${vin}"`);
      return null;
    }

    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[universal-scan] Lexicon extract error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 500 },
    );
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const { image } = body;
  if (!image || typeof image !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'image' field (expected base64 string)." },
      { status: 400 },
    );
  }

  const openai = new OpenAI({ apiKey });

  // --- Step 1: GPT-4o Vision OCR -------------------------------------------
  let rawContent: string | null = null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: image.startsWith("data:")
                  ? image
                  : `data:image/jpeg;base64,${image}`,
                detail: "high",
              },
            },
            { type: "text", text: SCAN_PROMPT },
          ],
        },
      ],
      max_tokens: 256,
      response_format: { type: "json_object" },
    });

    rawContent = response.choices[0]?.message?.content ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `OpenAI request failed: ${message}` },
      { status: 502 },
    );
  }

  if (!rawContent) {
    return NextResponse.json(
      { error: "Empty response from OpenAI." },
      { status: 502 },
    );
  }

  let result: ScanResult;
  try {
    result = JSON.parse(rawContent) as ScanResult;
  } catch {
    return NextResponse.json(
      { error: "Failed to parse OpenAI response as JSON.", raw: rawContent },
      { status: 502 },
    );
  }

  // --- Step 2: If a VIN was found, trigger lexicon extract immediately ------
  if (result.type === "VIN" && /^[A-HJ-NPR-Z0-9]{17}$/i.test(result.value)) {
    const vin = result.value.toUpperCase();
    const vehicle = await triggerLexiconExtract(vin);
    return NextResponse.json({ ...result, value: vin, vehicle: vehicle ?? undefined });
  }

  // --- Step 3: If a plate was found, resolve to VIN via L2V provider -------
  if (result.type === "PLATE" && result.value) {
    const vin = await resolvePlateToVin(result.value, result.state);

    if (vin) {
      // Got a VIN from the L2V provider — run it through the extract worker.
      const vehicle = await triggerLexiconExtract(vin);
      return NextResponse.json({
        ...result,
        vin,
        vehicle: vehicle ?? undefined,
      });
    }

    // L2V provider not configured or could not resolve — return plate result as-is.
    return NextResponse.json(result);
  }

  return NextResponse.json(result);
}
