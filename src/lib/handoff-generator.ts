/**
 * Structured handoff generator.
 *
 * Formats tasks into a sign-out-ready handoff document with:
 * - Tasks grouped by status
 * - Aging warnings for carry-forwards and stale awaiting-result items
 * - Clean text output for clipboard paste
 */

import type { TaskStatus } from "./handoff-types";

interface HandoffTask {
  text: string;
  status: TaskStatus;
  dayNumber?: number;
  source?: string;
  createdAt?: number | string;
}

interface HandoffOptions {
  patientName: string;
  room?: string;
  mrn?: string;
  /** Free-text additional notes */
  note?: string;
  /** Threshold (in days) to flag aging carry-forwards */
  carryForwardWarningDays?: number;
  /** Threshold (in days) to flag stale awaiting-result tasks */
  awaitingResultWarningDays?: number;
}

const DEFAULT_CARRY_WARNING_DAYS = 2;
const DEFAULT_AWAITING_WARNING_DAYS = 3;

/**
 * Generate a formatted handoff document from tasks.
 */
export function generateHandoff(tasks: HandoffTask[], options: HandoffOptions): string {
  const {
    patientName,
    room,
    mrn,
    note,
    carryForwardWarningDays = DEFAULT_CARRY_WARNING_DAYS,
    awaitingResultWarningDays = DEFAULT_AWAITING_WARNING_DAYS,
  } = options;

  const byStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s && t.text.trim());

  const active = byStatus("pending");
  const done = byStatus("done");
  const awaiting = byStatus("awaiting_result");
  const carry = byStatus("carry_forward");
  const resolved = byStatus("resolved");

  const lines: string[] = [];

  // Header
  const headerParts = [patientName];
  if (room) headerParts.push(`Rm ${room}`);
  if (mrn) headerParts.push(`MRN ${mrn}`);
  lines.push(headerParts.join(" | "));
  lines.push("─".repeat(Math.min(60, headerParts.join(" | ").length)));
  lines.push("");

  // Active tasks
  if (active.length > 0) {
    lines.push("TO DO:");
    for (const t of active) lines.push(`  [ ] ${t.text}`);
    lines.push("");
  }

  // Awaiting results
  if (awaiting.length > 0) {
    lines.push("AWAITING RESULTS:");
    for (const t of awaiting) {
      const aging = t.dayNumber && t.dayNumber > awaitingResultWarningDays
        ? ` ⚠ Day ${t.dayNumber}`
        : "";
      lines.push(`  ⏳ ${t.text}${aging}`);
    }
    lines.push("");
  }

  // Carry forward
  if (carry.length > 0) {
    lines.push("CARRY FORWARD:");
    for (const t of carry) {
      const aging = t.dayNumber && t.dayNumber > carryForwardWarningDays
        ? ` ⚠ Day ${t.dayNumber} — consider escalating`
        : "";
      lines.push(`  → ${t.text}${aging}`);
    }
    lines.push("");
  }

  // Completed today
  if (done.length > 0) {
    lines.push("COMPLETED TODAY:");
    for (const t of done) lines.push(`  ✓ ${t.text}`);
    lines.push("");
  }

  // Resolved
  if (resolved.length > 0) {
    lines.push("RESOLVED:");
    for (const t of resolved) lines.push(`  ✗ ${t.text}`);
    lines.push("");
  }

  // Additional notes
  if (note?.trim()) {
    lines.push("NOTES:");
    lines.push(note.trim());
    lines.push("");
  }

  // Warnings section
  const warnings: string[] = [];
  for (const t of carry) {
    if (t.dayNumber && t.dayNumber > carryForwardWarningDays) {
      warnings.push(`"${t.text}" has been carried forward for ${t.dayNumber} days`);
    }
  }
  for (const t of awaiting) {
    if (t.dayNumber && t.dayNumber > awaitingResultWarningDays) {
      warnings.push(`"${t.text}" has been awaiting results for ${t.dayNumber} days`);
    }
  }
  if (warnings.length > 0) {
    lines.push("⚠ ATTENTION:");
    for (const w of warnings) lines.push(`  ${w}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Check if a patient has tasks that need attention (for badge/indicator).
 */
export function hasAttentionNeeded(
  tasks: HandoffTask[],
  carryForwardWarningDays = DEFAULT_CARRY_WARNING_DAYS,
  awaitingResultWarningDays = DEFAULT_AWAITING_WARNING_DAYS,
): boolean {
  return tasks.some(
    (t) =>
      (t.status === "carry_forward" && (t.dayNumber ?? 1) > carryForwardWarningDays) ||
      (t.status === "awaiting_result" && (t.dayNumber ?? 1) > awaitingResultWarningDays),
  );
}
