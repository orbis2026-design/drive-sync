import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

interface ScanResult {
  type: "VIN" | "PLATE" | "NONE";
  value: string;
  confidence: number;
  state?: string;
}

const SCAN_PROMPT = `Analyze this image. Determine if it contains:
1. A 1D or 2D VIN barcode — extract the 17-character VIN
2. A text VIN stamped/printed on a vehicle — extract the 17-character VIN
3. A US license plate (including specialty/handicap) — extract the plate text and state if visible
4. None of the above

Respond in strict JSON: { "type": "VIN" | "PLATE" | "NONE", "value": string, "confidence": number, "state"?: string }`;

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

  return NextResponse.json(result);
}
