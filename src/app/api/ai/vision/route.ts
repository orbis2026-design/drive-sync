import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT =
  "You are an ASE Certified Master Mechanic. Identify the damaged automotive component in this photo and output a JSON array of recommended repair steps. Each element must be an object with keys: step (number), action (string, max 80 chars), notes (string, max 200 chars), and suggestedParts (string array). Output ONLY valid JSON — no markdown fences, no prose.";

/** Base64 encoding inflates binary data by ~33%, so 14 MB base64 ≈ 10 MB raw */
const MAX_BASE64_BYTES = 14_000_000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { base64Image, mimeType = "image/jpeg", workOrderId } = body as {
      base64Image: string;
      mimeType?: string;
      workOrderId?: string;
    };

    if (!base64Image || typeof base64Image !== "string") {
      return NextResponse.json(
        { error: "base64Image is required" },
        { status: 400 }
      );
    }

    // Validate base64 string is not excessively large (max ~10 MB decoded)
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
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
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
            {
              type: "text",
              text: "Analyze this photo and return the JSON repair steps array.",
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "[]";

    // Safely parse JSON — the model is instructed to return pure JSON
    let repairSteps: unknown;
    try {
      repairSteps = JSON.parse(raw);
    } catch {
      // Attempt to extract a JSON array if the model wrapped it anyway
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        repairSteps = JSON.parse(match[0]);
      } else {
        return NextResponse.json(
          { error: "AI returned an unexpected format. Please try again." },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ repairSteps, workOrderId: workOrderId ?? null });
  } catch (err) {
    console.error("[api/ai/vision] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
