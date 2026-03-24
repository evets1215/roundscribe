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

The prior note uses a problem-based format with #ProblemName headers. Your job is to identify what changed and return a structured diff so the physician can review and accept each change.

Prior note:
---
${previousNote}
---

Your output must be a JSON object with this exact shape:
{
  "format": "problem-diff",
  "subjective_section": {
    "changed": boolean,
    "before": "prior subjective text",
    "after": "updated subjective text (same as before if not discussed)"
  },
  "problems": [
    {
      "label": "Problem name (without the # prefix)",
      "changed": boolean,
      "before": "prior text for this problem",
      "after": "updated text — one management item per line, each starting with -"
    }
  ],
  "social_section": {
    "changed": boolean,
    "before": "prior social text",
    "after": "updated social text (same as before if not discussed)"
  },
  "rawText": "full updated note as plain text with #Problem headers"
}

Rules:
- Include ALL problems from the prior note in the problems array
- Set changed: true only for problems explicitly discussed in the transcript
- For changed problems: "after" must have each distinct management item (medication change, imaging order, lab, consult, etc.) on its own line starting with "- "
- For unchanged problems: "after" is identical to "before"
- rawText is the complete updated note (used as fallback)
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
      // Build rawText fallback for problem-diff format if missing
      if (parsed.format === "problem-diff" && !parsed.rawText && parsed.problems) {
        const lines: string[] = [];
        if (parsed.subjective_section) lines.push("SUBJECTIVE", parsed.subjective_section.after, "");
        lines.push("ASSESSMENT & PLAN", "");
        for (const p of parsed.problems) {
          lines.push(`#${p.label}`, p.after, "");
        }
        if (parsed.social_section) lines.push("SOCIAL", parsed.social_section.after);
        parsed.rawText = lines.join("\n");
      }
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
