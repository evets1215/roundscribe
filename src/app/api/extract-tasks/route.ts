/**
 * POST /api/extract-tasks
 *
 * LLM-powered task extraction for free text that the deterministic parser misses.
 * Called as a fallback when regex patterns don't match.
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import OpenAI from "openai";

export const runtime = "nodejs";

const MODEL = "gpt-5.4-mini";

const SYSTEM_PROMPT = `You are a clinical task extraction assistant. Given free-text clinical updates from a hospitalist's rounding notes, extract actionable tasks.

Return ONLY a JSON array of tasks. Each task:
{
  "text": "concise task description",
  "status": "pending" | "awaiting_result" | "done",
  "confidence": 0.0 to 1.0
}

Rules:
- "pending": action the physician needs to take (start med, consult, order test, call someone)
- "awaiting_result": something already sent/ordered, waiting for result (labs sent, imaging ordered, consult called)
- "done": action already completed today (med discontinued, patient ambulated)
- Only extract genuine clinical tasks — not assessments, observations, or vitals
- confidence 0.9+ for clear action items, 0.5–0.8 for implicit or ambiguous ones
- Keep task text concise (under 60 chars)
- Return empty array [] if no tasks are found
- Output ONLY valid JSON — no preamble, no markdown fences`;

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let text: string;
  try {
    const body = await req.json();
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!text || text.length < 5) {
    return NextResponse.json({ tasks: [] });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });

    const raw = (response.choices[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    const tasks = JSON.parse(cleaned);
    if (!Array.isArray(tasks)) {
      return NextResponse.json({ tasks: [] });
    }

    return NextResponse.json({
      tasks: tasks.map((t: { text?: string; status?: string; confidence?: number }) => ({
        text: String(t.text ?? "").slice(0, 100),
        status: ["pending", "awaiting_result", "done"].includes(t.status ?? "") ? t.status : "pending",
        confidence: typeof t.confidence === "number" ? Math.min(1, Math.max(0, t.confidence)) : 0.5,
        source: "parsed",
      })),
    });
  } catch {
    return NextResponse.json({ tasks: [] });
  }
}
