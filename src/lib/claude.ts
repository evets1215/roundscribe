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
  const lines = note.split("\n");

  // --- Bullet detection (top-level + sub-bullets) ---
  const bulletCounts: Record<string, number> = {};
  const subBulletCounts: Record<string, number> = {};
  for (const line of lines) {
    const topMatch = line.match(/^([-•*·–])\s/);
    if (topMatch) {
      bulletCounts[topMatch[1]] = (bulletCounts[topMatch[1]] || 0) + 1;
      continue;
    }
    const subMatch = line.match(/^([ \t]+)([-•*·–])\s/);
    if (subMatch) {
      const key = `${subMatch[1]}${subMatch[2]}`;
      subBulletCounts[key] = (subBulletCounts[key] || 0) + 1;
    }
  }
  // Most-used bullet character
  const bullet = Object.entries(bulletCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  const altBullets = ["- ", "• ", "* ", "· ", "– "].filter((b) => b[0] !== bullet).map((b) => `'${b.trim()}'`).join(", ");

  // Sub-bullet pattern (if any)
  const subBulletEntry = Object.entries(subBulletCounts).sort((a, b) => b[1] - a[1])[0];
  const subBulletRule = subBulletEntry
    ? `- Sub-bullets use '${subBulletEntry[0]}' (preserve this indent+character exactly)`
    : "- No sub-bullets detected — do not introduce indented sub-bullets";

  // --- Header detection ---
  const hashHeaders = lines.filter((l) => /^#{1,3}[A-Z\w]/.test(l));
  const hashSpaceHeaders = lines.filter((l) => /^#{1,3}\s+[A-Z\w]/.test(l));
  let headerRule: string;
  if (hashHeaders.length > 0 && hashSpaceHeaders.length === 0) {
    headerRule = "- Section headers use '#' directly before the name (e.g. '#Sepsis') — no space after '#'";
  } else if (hashSpaceHeaders.length > 0) {
    headerRule = "- Section headers use '# ' with a space (e.g. '# Sepsis')";
  } else {
    headerRule = "- Match the section header format already present in the OLD NOTE (no '#' headers detected)";
  }

  // --- Blank line patterns ---
  let blanksBeforeSections = 0;
  let sectionTransitions = 0;
  for (let i = 1; i < lines.length; i++) {
    if (/^#{1,3}\s*[A-Z\w]/.test(lines[i])) {
      sectionTransitions++;
      if (lines[i - 1]?.trim() === "") blanksBeforeSections++;
    }
  }
  const blankLineRule = sectionTransitions > 0 && blanksBeforeSections >= sectionTransitions * 0.5
    ? "- Sections are separated by a blank line before each '#' header — preserve this spacing"
    : "- Do not add extra blank lines between sections unless the OLD NOTE already has them";

  // --- Line ending detection (trailing spaces, etc.) ---
  const trailingSpaceLines = lines.filter((l) => l !== l.trimEnd()).length;
  const trailingRule = trailingSpaceLines > lines.length * 0.1
    ? "- Some lines have trailing whitespace — preserve it, do not trim"
    : "- Do not introduce trailing whitespace";

  return [
    "STYLE ENFORCEMENT (extracted from OLD NOTE — follow exactly, no exceptions):",
    `- All new bullet points must use exactly '${bullet} ' (${bullet} + space) — never ${altBullets}, numbered lists, or any other character`,
    subBulletRule,
    headerRule,
    blankLineRule,
    trailingRule,
    "- Do not reformat, re-indent, or rephrase any line that is not explicitly changed by an operation",
    "- New lines must match the indentation and spacing of adjacent lines in the OLD NOTE",
    "- Preserve all existing whitespace, blank lines, and formatting in unchanged content",
  ].join("\n");
}

/**
 * Fuzzy line finder — tries exact match first, then normalized match
 * (trimmed + collapsed whitespace). Returns the index or -1.
 */
function findLine(lines: string[], target: string): number {
  // Exact match first
  const exact = lines.indexOf(target);
  if (exact !== -1) return exact;
  // Normalized: trim + collapse internal whitespace
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  const targetNorm = norm(target);
  if (!targetNorm) return -1;
  return lines.findIndex((l) => norm(l) === targetNorm);
}

export interface ApplyOpsResult {
  text: string;
  failedOps: NoteOp[];
}

export function applyOps(note: string, ops: NoteOp[]): ApplyOpsResult {
  let lines = note.split("\n");
  const failedOps: NoteOp[] = [];

  for (const op of ops) {
    if (op.op === "replace") {
      const idx = findLine(lines, op.old);
      if (idx !== -1) {
        lines[idx] = op.new;
      } else {
        failedOps.push(op);
      }
    } else if (op.op === "append_to") {
      const idx = findLine(lines, op.match);
      if (idx !== -1) {
        lines[idx] = lines[idx] + op.add;
      } else {
        failedOps.push(op);
      }
    } else if (op.op === "insert_after") {
      const idx = findLine(lines, op.match);
      if (idx !== -1) {
        lines.splice(idx + 1, 0, op.new);
      } else {
        failedOps.push(op);
      }
    } else if (op.op === "insert_section") {
      const idx = lines.findIndex((l) => l.trimEnd() === op.after_section.trimEnd());
      if (idx !== -1) {
        const end = lines.findIndex((l, i) => i > idx && /^#{1,3}\s*[A-Z\w]/.test(l));
        const insertAt = end === -1 ? lines.length : end;
        lines.splice(insertAt, 0, "", ...op.content.split("\n"));
      } else {
        // Fallback: append to end, but still flag as partial failure
        lines.push("", ...op.content.split("\n"));
        failedOps.push(op);
      }
    } else if (op.op === "delete") {
      const idx = findLine(lines, op.old);
      if (idx !== -1) {
        lines.splice(idx, 1);
      } else {
        failedOps.push(op);
      }
    }
  }
  return { text: lines.join("\n"), failedOps };
}

const HANDOFF_SYSTEM_PROMPT = `You are a clinical note editor. Given an OLD NOTE and TODAY'S UPDATE, return ONLY a JSON array of minimal surgical edits — do not return the full note.

Each edit must be one of these exact shapes:
{ "op": "replace", "old": "verbatim line from OLD NOTE", "new": "replacement line" }
{ "op": "append_to", "match": "verbatim line from OLD NOTE", "add": "text to append to that line" }
{ "op": "insert_after", "match": "verbatim line from OLD NOTE", "new": "new line to insert after it" }
{ "op": "insert_section", "after_section": "verbatim #SectionHeader line", "content": "full new section as a single string with \\n between lines" }
{ "op": "delete", "old": "verbatim line from OLD NOTE to remove" }

CRITICAL — line matching:
- "old", "match", "after_section" must be copied CHARACTER-FOR-CHARACTER from the OLD NOTE
- Copy the ENTIRE line including any leading whitespace, bullet character, and trailing text
- Do NOT fix typos, adjust spacing, or normalize the original line — use it exactly as-is
- If the OLD NOTE line is "- vancomycin 1g q12h", you write exactly "- vancomycin 1g q12h" — not "- Vancomycin 1g q12h", not "-vancomycin 1g q12h"

CRITICAL — format preservation:
- All new bullets must use the EXACT same bullet character and indentation as adjacent bullets in the OLD NOTE
- Do NOT emit operations for lines that do not change
- Do NOT rewrite, reformat, capitalize, re-indent, or rephrase any unchanged content
- Do NOT convert "- " bullets to "• " or vice versa
- Do NOT add numbering (1., 2.) where the note uses dash bullets
- Do NOT wrap or split lines differently than the OLD NOTE
- Do NOT add section headers that don't follow the OLD NOTE's header format
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
- RESOLVED items → emit { "op": "delete", "old": "exact line" } for the MOST SPECIFIC matching bullet in the OLD NOTE. Find the line that most closely corresponds to the resolved item and delete it. Do NOT delete section headers unless ALL their bullets are also deleted in the same edit batch.

PENDING FROM YESTERDAY handling:
- If a "PENDING FROM YESTERDAY" section is present, these are tasks carried forward or awaiting results from the prior shift
- Surface them in the note: e.g. "labs pending from overnight: BMP, coags" or "neurology consult called, awaiting callback"
- Use insert_after or replace to add these into the relevant problem sections — do not append to the bottom
- If the prior note already mentions the pending item, update it rather than duplicating

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

  // Phase B: inject carry_forward + awaiting_result as explicit "pending from yesterday" context
  const pendingFromYesterday: string[] = [];
  if (carryItems.length) {
    pendingFromYesterday.push("Carried forward from prior shift (not yet completed — surface these in the note as ongoing):");
    for (const i of carryItems) pendingFromYesterday.push(`- ${i.text}`);
  }
  if (awaitingItems.length) {
    pendingFromYesterday.push("Awaiting results from prior shift (orders placed, results not back — note as pending):");
    for (const i of awaitingItems) pendingFromYesterday.push(`- ${i.text}`);
  }

  const userMsgParts = [
    "OLD NOTE:",
    previousNote || "(none — synthesize a full note from today's update below)",
  ];
  if (pendingFromYesterday.length) {
    userMsgParts.push("", "PENDING FROM YESTERDAY:", ...pendingFromYesterday);
  }
  userMsgParts.push("", "TODAY'S UPDATE:", todayUpdate);
  const userMsg = userMsgParts.join("\n").trim();

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
    if (previousNote) {
      const result = applyOps(previousNote, ops);
      return {
        format: "SOAP",
        rawText: result.text,
        ops,
        failedOps: result.failedOps.length > 0 ? result.failedOps : undefined,
      };
    }
    const rawText = ops.map((o) => ("new" in o ? o.new : "content" in o ? o.content : "")).join("\n");
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
