/**
 * OpenAI adapter — converts a medical transcript into a structured SOAP note.
 *
 * Implements the same MedGemmaAdapter interface so it's a drop-in replacement.
 *
 * Configured via env vars:
 *   OPENAI_API_KEY   Required — your OpenAI API key
 *
 * Two generation modes:
 *   1. analyze(transcript)                  — generate SOAP note from scratch
 *   2. analyze(transcript, _, previousNote) — update an existing note with new info
 */

import OpenAI from "openai";
import type { MedGemmaAdapter, StructuredNote } from "./medgemma";

const MODEL = "gpt-5.4-mini";

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

class OpenAIAdapter implements MedGemmaAdapter {
  private readonly client: OpenAI;

  constructor(private readonly apiKey: string) {
    this.client = new OpenAI({ apiKey });
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

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 2048,
    });

    const rawText = response.choices[0]?.message?.content ?? "";

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
// Handoff-based note generation — surgical ops approach
// ---------------------------------------------------------------------------

export type TaskStatus = "pending" | "awaiting_result" | "done" | "carry_forward" | "resolved";

export type NoteOp =
  | { op: "replace"; old: string; new: string }
  | { op: "append_to"; match: string; add: string }
  | { op: "insert_after"; match: string; new: string }
  | { op: "insert_section"; after_section: string; content: string }
  | { op: "delete"; old: string };

/** Regex scan of prior note — no LLM call — returns style rules to inject into system prompt */
function extractNoteStyle(note: string): string {
  const bulletMatch = note.match(/^([ \t]*)([-•*·–])\s/m);
  const bullet = bulletMatch ? `${bulletMatch[2]} ` : "- ";
  const altBullet = bullet === "- " ? "•" : "-";
  const hasHashHeaders = /^#[A-Z\w]/m.test(note);

  return [
    "STYLE ENFORCEMENT (extracted from OLD NOTE — follow exactly, no exceptions):",
    `- All new bullet points must use exactly '${bullet}' — never '${altBullet}', '–', numbered lists, or any other character`,
    hasHashHeaders
      ? "- Problem section headers use '#' prefix (e.g. '#Sepsis') — preserve this exactly"
      : "- Match the section header format already present in the OLD NOTE",
    "- Do not reformat, re-indent, or rephrase any line that is not explicitly changed",
    "- New lines must match the indentation and spacing of adjacent lines in the OLD NOTE",
  ].join("\n");
}

export function applyOps(note: string, ops: NoteOp[]): string {
  let lines = note.split("\n");
  for (const op of ops) {
    if (op.op === "replace") {
      lines = lines.map((l) => (l === op.old ? op.new : l));
    } else if (op.op === "append_to") {
      lines = lines.map((l) => (l === op.match ? l + op.add : l));
    } else if (op.op === "insert_after") {
      const idx = lines.indexOf(op.match);
      if (idx !== -1) lines.splice(idx + 1, 0, op.new);
    } else if (op.op === "insert_section") {
      const idx = lines.findIndex((l) => l.trimEnd() === op.after_section.trimEnd());
      if (idx !== -1) {
        const end = lines.findIndex((l, i) => i > idx && l.startsWith("#"));
        const insertAt = end === -1 ? lines.length : end;
        lines.splice(insertAt, 0, "", ...op.content.split("\n"));
      } else {
        // section not found — append to end
        lines.push("", ...op.content.split("\n"));
      }
    } else if (op.op === "delete") {
      lines = lines.filter((l) => l !== op.old);
    }
  }
  return lines.join("\n");
}

const HANDOFF_SYSTEM_PROMPT = `You are a clinical note editor. Given an OLD NOTE and TODAY'S UPDATE, return ONLY a JSON array of minimal surgical edits — do not return the full note.

Each edit must be one of these exact shapes:
{ "op": "replace", "old": "verbatim line from OLD NOTE", "new": "replacement line" }
{ "op": "append_to", "match": "verbatim line from OLD NOTE", "add": "text to append to that line" }
{ "op": "insert_after", "match": "verbatim line from OLD NOTE", "new": "new line to insert after it" }
{ "op": "insert_section", "after_section": "verbatim #SectionHeader line", "content": "full new section as a single string with \\n between lines" }
{ "op": "delete", "old": "verbatim line from OLD NOTE to remove" }

Rules:
- "old", "match", "after_section" must be copied character-for-character from the OLD NOTE
- All new bullets must use the EXACT same bullet character and indentation as adjacent bullets in the OLD NOTE (e.g. if existing bullets use "- ", new bullets must also use "- ")
- Do not emit operations for lines that do not change
- Do not rewrite, reformat, or reword any unchanged content
- If TODAY'S UPDATE introduces a genuinely new clinical problem (e.g. fever + neutropenia + antibiotic), emit an insert_section operation
- Strip checkbox markers: "[ ] item" or "[x] item" → plain bullet using the note's existing bullet style

Clinical routing:
- Fever + neutropenic + antibiotic start → insert_section "#Febrile Neutropenia" (or "#Neutropenic Fever") after the oncology section; group CXR/RPP/cultures/imaging under it
- Transfusion (pRBC, platelets, FFP) → insert_after the last bullet in the oncology section
- "post-void bladder scan" / "PVR" / "foley" / "urinary" → insert_after in the urinary/GU section
- Prophylaxis addition (fluconazole, acyclovir, etc.) → append_to the existing ppx line
- Chemo cycle day update (e.g. C1D9 → C1D10) → replace the cycle day line
- New consult recommendation → insert_after the last bullet of the relevant problem section; prefix with specialty (e.g. "- Per Cards: start metoprolol 25mg BID")
- Medication dose change or new medication → replace existing med line if present, otherwise insert_after the last bullet in the relevant section
- Imaging result returned → if a pending imaging order line exists, replace it with the result; otherwise insert_after the relevant section
- Overnight event or nursing call (fever, desat, fall, pain) → insert_after the most relevant problem; create insert_section only for genuinely new clinical problems
- RESOLVED items → emit { "op": "delete", "old": "exact line" } for the most specific matching bullet; do NOT delete the section header unless all its bullets are also deleted

Return ONLY the JSON array. No explanation, no markdown fences.`;

export async function generateNoteFromHandoff(
  previousNote: string,
  handoffItems: Array<{ text: string; done?: boolean; status?: string }>,
  handoffNote: string,
): Promise<StructuredNote> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  const client = new OpenAI({ apiKey });

  // Resolve status: prefer explicit status, fall back to done boolean
  const getStatus = (item: { done?: boolean; status?: string }) =>
    item.status ?? (item.done ? "done" : "pending");

  const withText = handoffItems.filter((i) => i.text.trim());
  const doneItems     = withText.filter((i) => getStatus(i) === "done");
  const pendingItems  = withText.filter((i) => getStatus(i) === "pending");
  const awaitingItems = withText.filter((i) => getStatus(i) === "awaiting_result");
  const carryItems    = withText.filter((i) => getStatus(i) === "carry_forward");
  const resolvedItems = withText.filter((i) => getStatus(i) === "resolved");

  const parts: string[] = [];
  if (doneItems.length)     parts.push("Completed today:\n"                      + doneItems.map((i) => `- ${i.text}`).join("\n"));
  if (pendingItems.length)  parts.push("Still pending (not yet acted on):\n"     + pendingItems.map((i) => `- ${i.text}`).join("\n"));
  if (awaitingItems.length) parts.push("Awaiting results (sent, not back yet):\n"+ awaitingItems.map((i) => `- ${i.text}`).join("\n"));
  if (carryItems.length)    parts.push("Carry forward to overnight team:\n"      + carryItems.map((i) => `- ${i.text}`).join("\n"));
  if (resolvedItems.length) parts.push("RESOLVED — DELETE these lines from note:\n" + resolvedItems.map((i) => `- ${i.text}`).join("\n"));
  if (handoffNote.trim())   parts.push(handoffNote.trim());

  const todayUpdate = parts.join("\n\n").trim();

  // Phase A: inject extracted style rules to enforce format preservation
  const styleRules = previousNote.trim() ? extractNoteStyle(previousNote) : "";
  const systemPrompt = styleRules
    ? `${HANDOFF_SYSTEM_PROMPT}\n\n${styleRules}`
    : HANDOFF_SYSTEM_PROMPT;

  const userMsg = [
    "OLD NOTE:",
    previousNote || "(none — synthesize a full note from today's update below)",
    "",
    "TODAY'S UPDATE:",
    todayUpdate,
  ].join("\n").trim();

  const response = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
  });

  const raw = (response.choices[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  try {
    const ops = JSON.parse(cleaned) as NoteOp[];
    if (!Array.isArray(ops)) throw new Error("not an array");
    const rawText = previousNote
      ? applyOps(previousNote, ops)
      : ops.map((o) => ("new" in o ? o.new : "content" in o ? o.content : "")).join("\n");
    return { format: "SOAP", rawText, ops };
  } catch {
    // Fallback: treat response as plain text if JSON parsing fails
    const rawText = cleaned
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    return { format: "SOAP", rawText };
  }
}

// ---------------------------------------------------------------------------
// Factory + convenience function
// ---------------------------------------------------------------------------

export function createClaudeAdapter(): MedGemmaAdapter {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  return new OpenAIAdapter(apiKey);
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
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  const adapter = new OpenAIAdapter(apiKey);
  return adapter.analyze(transcript, patientContext, previousNote);
}
