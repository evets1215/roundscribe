/**
 * POST /api/scan-patients
 *
 * Accepts a photo of a patient list and uses Claude vision to extract
 * patient names and MRN numbers. Returns a JSON array of { name, mrn } objects.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import { getCurrentUserId } from "@/lib/current-user";

export const runtime = "nodejs";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let imageData: string;
  let mediaType: AllowedType;

  try {
    const formData = await req.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "image field required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }

    mediaType = "image/jpeg"; // always output JPEG after resize
    const raw = Buffer.from(await file.arrayBuffer());
    // Resize to max 1600px on longest side — enough for Claude to read text,
    // well under the 5MB base64 limit, and ~10x smaller than a phone photo.
    const resized = await sharp(raw)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    imageData = resized.toString("base64");
  } catch {
    return NextResponse.json({ error: "Failed to read image" }, { status: 400 });
  }

  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });
  }

  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mediaType};base64,${imageData}` },
            },
            {
              type: "text",
              text: `Extract every patient name, MRN number, and room/location visible in this image.
Return ONLY a JSON array with no other text, markdown, or explanation:
[{"name": "Doe, John", "mrn": "1234567", "location": "4B-12"}, ...]

Rules:
- name: use "Last, First" format if visible, otherwise use whatever name format is shown
- mrn: digits only, no spaces or dashes
- location: room number, bed, or location label as shown (e.g. "4B-12", "ICU 3", "Room 402"). Use empty string "" if not visible.
- If a patient has no visible MRN, use an empty string ""
- If no patients are found, return []`,
            },
          ],
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const raw = response.choices[0]?.message?.content?.trim() ?? "";

  let patients: Array<{ name: string; mrn: string; location: string }> = [];
  try {
    // Strip markdown code fences if the model wrapped the JSON
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      patients = parsed
        .filter((p) => typeof p?.name === "string" && p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          mrn: String(p.mrn ?? "").replace(/\D/g, ""),
          location: String(p.location ?? "").trim(),
        }));
    }
  } catch {
    return NextResponse.json({ error: "Could not parse patient list from image" }, { status: 422 });
  }

  return NextResponse.json({ patients });
}
