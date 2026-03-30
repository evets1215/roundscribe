/**
 * Deterministic clinical task extraction from free-text updates.
 *
 * Parses common clinical shorthand into structured task suggestions.
 * No LLM needed for these patterns — clinician language is formulaic.
 */

import type { TaskStatus } from "./handoff-types";

export interface ExtractedTask {
  text: string;
  status: TaskStatus;
  source: "parsed";
  confidence: number; // 0–1
  /** The original line that generated this task */
  sourceLine: string;
}

interface Pattern {
  regex: RegExp;
  status: TaskStatus;
  /** Transform the match into a task text */
  format: (match: RegExpMatchArray) => string;
  confidence: number;
}

// ── Patterns ──────────────────────────────────────────────────────────────

const PATTERNS: Pattern[] = [
  // "start vanc", "start vancomycin 1g q12h", "initiate heparin drip"
  {
    regex: /^(?:start|initiate|begin)\s+(.+)/i,
    status: "pending",
    format: (m) => `Start ${m[1].trim()}`,
    confidence: 0.95,
  },
  // "d/c metoprolol", "discontinue heparin", "stop warfarin", "hold lisinopril"
  {
    regex: /^(?:d\/c|dc|discontinue|stop|hold)\s+(.+)/i,
    status: "done",
    format: (m) => `D/C ${m[1].trim()}`,
    confidence: 0.95,
  },
  // "f/u CT results", "follow up blood cultures", "f/u with cards"
  {
    regex: /^(?:f\/u|fu|follow\s*up)\s+(.+)/i,
    status: "awaiting_result",
    format: (m) => `F/U ${m[1].trim()}`,
    confidence: 0.9,
  },
  // "consult cards", "consult nephrology", "get ID consult"
  {
    regex: /^(?:consult|get\s+\w+\s+consult)\s+(.+)/i,
    status: "pending",
    format: (m) => `Consult ${m[1].trim()}`,
    confidence: 0.95,
  },
  // "order CT A/P", "order BMP", "order echo", "order CXR"
  {
    regex: /^order\s+(.+)/i,
    status: "pending",
    format: (m) => `Order ${m[1].trim()}`,
    confidence: 0.9,
  },
  // "check BMP", "check lactate", "recheck Cr in AM"
  {
    regex: /^(?:check|recheck|repeat)\s+(.+)/i,
    status: "awaiting_result",
    format: (m) => `Check ${m[1].trim()}`,
    confidence: 0.9,
  },
  // "send BCx", "send UA", "send blood cultures"
  {
    regex: /^send\s+(.+)/i,
    status: "awaiting_result",
    format: (m) => `Send ${m[1].trim()}`,
    confidence: 0.9,
  },
  // "transfuse 1u pRBC", "give 2u FFP"
  {
    regex: /^(?:transfuse|give)\s+(\d+\s*u(?:nits?)?\s+.+)/i,
    status: "pending",
    format: (m) => `Transfuse ${m[1].trim()}`,
    confidence: 0.9,
  },
  // "wean O2", "titrate insulin drip", "uptitrate metoprolol"
  {
    regex: /^(?:wean|titrate|uptitrate|downtitrate|taper)\s+(.+)/i,
    status: "pending",
    format: (m) => `${m[0].split(/\s/)[0].charAt(0).toUpperCase() + m[0].split(/\s/)[0].slice(1).toLowerCase()} ${m[1].trim()}`,
    confidence: 0.85,
  },
  // "pending CTA", "awaiting MRI results", "pending nephro recs"
  {
    regex: /^(?:pending|awaiting|await)\s+(.+)/i,
    status: "awaiting_result",
    format: (m) => `Pending ${m[1].trim()}`,
    confidence: 0.85,
  },
  // "call family", "call PCP", "notify attending"
  {
    regex: /^(?:call|notify|page|contact)\s+(.+)/i,
    status: "pending",
    format: (m) => `Call ${m[1].trim()}`,
    confidence: 0.85,
  },
  // "dc planning", "discharge planning", "plan dc tomorrow"
  {
    regex: /^(?:dc|discharge)\s+planning\b/i,
    status: "pending",
    format: () => "Discharge planning",
    confidence: 0.9,
  },
  // "plan dc [day]", "target dc [day]"
  {
    regex: /^(?:plan|target)\s+(?:dc|discharge)\s+(.+)/i,
    status: "pending",
    format: (m) => `Plan D/C ${m[1].trim()}`,
    confidence: 0.9,
  },
];

// ── Main extraction ───────────────────────────────────────────────────────

/**
 * Extract tasks from a single line of clinical free text.
 * Returns empty array if no task pattern is detected.
 */
export function extractTasksFromLine(line: string): ExtractedTask[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return [];

  // Strip leading bullet/dash/number
  const cleaned = trimmed.replace(/^(?:[-•*·–]\s*|\d+[.)]\s*)/, "").trim();
  if (!cleaned) return [];

  const results: ExtractedTask[] = [];

  for (const pattern of PATTERNS) {
    const match = cleaned.match(pattern.regex);
    if (match) {
      results.push({
        text: pattern.format(match),
        status: pattern.status,
        source: "parsed",
        confidence: pattern.confidence,
        sourceLine: line,
      });
      break; // one pattern per line
    }
  }

  return results;
}

/**
 * Extract tasks from a multi-line free-text update.
 * Processes each line independently.
 */
export function extractTasksFromText(text: string): ExtractedTask[] {
  if (!text || !text.trim()) return [];

  const lines = text.split("\n");
  const tasks: ExtractedTask[] = [];

  for (const line of lines) {
    tasks.push(...extractTasksFromLine(line));
  }

  return tasks;
}

/**
 * Extract tasks from only the new lines added since the last extraction.
 * Compare previous text to current text and only process new/changed lines.
 */
export function extractTasksFromNewLines(
  previousText: string,
  currentText: string,
): ExtractedTask[] {
  const prevLines = new Set(previousText.split("\n").map((l) => l.trim()));
  const currLines = currentText.split("\n");

  const newLines = currLines.filter((l) => !prevLines.has(l.trim()));
  const tasks: ExtractedTask[] = [];

  for (const line of newLines) {
    tasks.push(...extractTasksFromLine(line));
  }

  return tasks;
}
