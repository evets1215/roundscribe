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

Your output must be a JSON object matching this TypeScript interface:
{
  format: "SOAP",
  subjective: string,
  objective: string,
  assessment: string,
  plan: string,
  rawText: string
}

Rules:
- Write in concise clinical language appropriate for inpatient progress notes
- Assessment & Plan are the most important sections — be thorough and specific
- Subjective: what the patient reports / team discussion about patient's complaints
- Objective: vitals, exam findings, labs, imaging if mentioned in the discussion
- Assessment: clinical impression, active diagnoses
- Plan: specific interventions, medication changes, consults, disposition plans
- If information for a section is not mentioned, write a brief placeholder (e.g., "Not discussed during rounds")
- rawText should be the full note as formatted plain text
- Output ONLY valid JSON — no preamble, no markdown fences`;

function buildUpdatePrompt(previousNote: string): string {
  return `You are updating an existing inpatient progress note with information from today's team rounding discussion.

The previous note is provided for context. Extract new clinical information from the transcript and update the note accordingly. Keep sections that have not changed. Clearly incorporate new assessment and plan changes.

Previous note:
---
${previousNote}
---

Your output must be a JSON object matching this TypeScript interface:
{
  format: "SOAP",
  subjective: string,
  objective: string,
  assessment: string,
  plan: string,
  rawText: string
}

Rules:
- Preserve clinical information from the prior note that is still relevant
- Update sections based on what was discussed during today's rounds
- Assessment & Plan should reflect today's clinical thinking
- rawText should be the complete updated note as formatted plain text
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
