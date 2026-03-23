/**
 * Claude adapter — converts a medical transcript into a structured SOAP note.
 *
 * Implements the same MedGemmaAdapter interface so it's a drop-in replacement.
 *
 * Configured via env vars:
 *   ANTHROPIC_API_KEY   Required — your Anthropic API key
 *
 * Two generation modes:
 *   1. analyze(transcript)                  — generate SOAP note from scratch
 *   2. analyze(transcript, _, previousNote) — update an existing note with new info
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MedGemmaAdapter, StructuredNote } from "./medgemma";

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a clinical documentation assistant helping hospitalist physicians generate inpatient progress notes from team rounding discussions.

Your output must be a JSON object:
{
  format: "SOAP",
  rawText: string
}

Rules for rawText — use this exact structure:
Date: [today's date]
Patient: [patient name if mentioned, otherwise omit]

SUBJECTIVE
[What the patient reports or what the team discussed about symptoms/complaints]

ASSESSMENT & PLAN

#[Problem 1 name]
[Assessment and plan for this problem]

#[Problem 2 name]
[Assessment and plan for this problem]

[Add one #Problem section per active problem discussed]

SOCIAL
[Discharge planning, family, social situation if mentioned]

Rules:
- Use concise clinical language
- Each active problem gets its own #Problem header — this is the most important part
- If a section has no information from the discussion, write "Not discussed"
- rawText must use the exact format above
- Output ONLY valid JSON — no preamble, no markdown fences`;

function buildUpdatePrompt(previousNote: string): string {
  return `You are a clinical documentation assistant updating an inpatient progress note based on today's team rounding discussion.

The prior note uses a problem-based format with #ProblemName headers under ASSESSMENT & PLAN. Your job is to update only the problems that were explicitly discussed in today's rounding transcript, leaving all other problems unchanged.

Prior note:
---
${previousNote}
---

Your output must be a JSON object:
{
  format: "SOAP",
  rawText: string
}

Rules for rawText:
- Return the COMPLETE updated note as plain text
- Preserve the EXACT structure and formatting of the prior note (Date, Patient, SUBJECTIVE, ASSESSMENT & PLAN with #Problem headers, SOCIAL)
- For each #Problem section: if the rounding discussion mentions a change, update that problem's text. If not discussed, copy the prior text exactly.
- Update today's date at the top
- SUBJECTIVE: update only if the patient's subjective complaints were discussed
- SOCIAL: update only if social/discharge was discussed
- Do NOT add new sections or change the format
- Output ONLY valid JSON — no preamble, no markdown fences`;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

class ClaudeAdapter implements MedGemmaAdapter {
  private readonly client: Anthropic;

  constructor(private readonly apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyze(
    transcript: string,
    _patientContext?: string,
    previousNote?: string,
  ): Promise<StructuredNote> {
    const systemPrompt = previousNote
      ? buildUpdatePrompt(previousNote)
      : SYSTEM_PROMPT;

    const userMessage = previousNote
      ? `Today's rounding discussion transcript:\n\n${transcript}`
      : `Rounding discussion transcript:\n\n${transcript}`;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    try {
      const parsed = JSON.parse(cleaned) as StructuredNote;
      return { ...parsed, rawText: parsed.rawText ?? cleaned };
    } catch {
      // Fallback: return as bullets if JSON parse fails
      const bullets = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
      return { format: "bullets", bullets, rawText: cleaned };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory + convenience function
// ---------------------------------------------------------------------------

export function createClaudeAdapter(): MedGemmaAdapter {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  return new ClaudeAdapter(apiKey);
}

/**
 * Generate or update a SOAP note from a transcript.
 * Convenience wrapper that exposes the full signature including previousNote.
 */
export async function generateNote(
  transcript: string,
  patientContext?: string,
  previousNote?: string,
): Promise<StructuredNote> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const adapter = new ClaudeAdapter(apiKey);
  return adapter.analyze(transcript, patientContext, previousNote);
}
