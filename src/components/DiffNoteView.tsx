"use client";

import { useState, useCallback, useRef } from "react";
import type { StructuredNote, ProblemChange, NoteSection } from "@/lib/medgemma";

type Decision = "pending" | "accepted" | "declined";

// Derive changed from content, not Claude's flag (Claude sometimes sets changed:false even when text differs)
function isActuallyChanged(before: string, after: string) {
  return before.trim() !== after.trim();
}

interface Props {
  note: StructuredNote;
  onCopy: (text: string) => void;
}

function buildFinalText(
  note: StructuredNote,
  decisions: Record<string, Decision>,
  edits: Record<string, string>,
): string {
  if (!note.problems) return note.rawText;
  const lines: string[] = [];

  if (note.subjective_section) {
    const s = note.subjective_section;
    const changed = isActuallyChanged(s.before, s.after);
    lines.push("SUBJECTIVE");
    lines.push(changed && decisions["__subjective"] === "declined" ? s.before : (edits["__subjective"] ?? s.after));
    lines.push("");
  }

  lines.push("ASSESSMENT & PLAN");
  lines.push("");
  for (const p of note.problems) {
    const changed = isActuallyChanged(p.before, p.after);
    lines.push(`#${p.label}`);
    const dec = decisions[p.label];
    lines.push(changed && dec === "declined" ? p.before : (edits[p.label] ?? p.after));
    lines.push("");
  }

  if (note.social_section) {
    const s = note.social_section;
    const changed = isActuallyChanged(s.before, s.after);
    lines.push("SOCIAL");
    lines.push(changed && decisions["__social"] === "declined" ? s.before : (edits["__social"] ?? s.after));
  }

  return lines.join("\n");
}

function SectionDiff({
  id,
  label,
  section,
  decision,
  editedText,
  onAccept,
  onDecline,
  onEdit,
}: {
  id: string;
  label: string;
  section: NoteSection;
  decision: Decision;
  editedText: string | undefined;
  onAccept: () => void;
  onDecline: () => void;
  onEdit: (text: string) => void;
}) {
  const changed = isActuallyChanged(section.before, section.after);

  if (!changed) {
    return (
      <div id={id} className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--color-on-surface-variant)" }}>
          {label}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-on-surface)" }}>{section.after}</p>
      </div>
    );
  }

  return (
    <div id={id} className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface-variant)" }}>{label}</p>
        {decision === "pending" && (
          <div className="flex items-center gap-1.5">
            <button onClick={onAccept} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-white transition-all active:scale-95" style={{ backgroundColor: "#16a34a" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>check</span> Accept
            </button>
            <button onClick={onDecline} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all active:scale-95" style={{ backgroundColor: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>close</span> Decline
            </button>
          </div>
        )}
        {decision === "accepted" && <span className="text-[10px] font-bold" style={{ color: "#16a34a" }}>✓ Accepted</span>}
        {decision === "declined" && <span className="text-[10px] font-bold" style={{ color: "#64748b" }}>✗ Declined</span>}
      </div>
      {decision === "accepted" && (
        <textarea
          value={editedText ?? section.after}
          onChange={(e) => onEdit(e.target.value)}
          rows={3}
          className="w-full resize-none rounded px-3 py-2 text-sm leading-relaxed focus:outline-none"
          style={{ backgroundColor: "white", borderLeft: "3px solid #16a34a", color: "var(--color-on-surface)", border: "1px solid #e2e8f0" }}
        />
      )}
      {decision === "pending" && (
        <>
          <p className="text-sm leading-relaxed px-3 py-2 rounded mb-1" style={{ backgroundColor: "#f0fdf4", borderLeft: "3px solid #16a34a", color: "var(--color-on-surface)" }}>
            {section.after}
          </p>
          <p className="text-sm leading-relaxed mt-1 line-through" style={{ color: "#94a3b8" }}>{section.before}</p>
        </>
      )}
      {decision === "declined" && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-on-surface)" }}>{section.before}</p>
      )}
    </div>
  );
}

function ProblemDiff({
  id,
  problem,
  decision,
  editedText,
  onAccept,
  onDecline,
  onEdit,
}: {
  id: string;
  problem: ProblemChange;
  decision: Decision;
  editedText: string | undefined;
  onAccept: () => void;
  onDecline: () => void;
  onEdit: (text: string) => void;
}) {
  const changed = isActuallyChanged(problem.before, problem.after);
  const afterLines = problem.after.split("\n").filter(Boolean);
  const beforeLines = problem.before.split("\n").filter(Boolean);

  return (
    <div id={id} className="mb-5">
      {/* Problem header */}
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[15px] font-normal" style={{ fontFamily: "var(--font-serif)", color: "var(--color-primary)" }}>
          #{problem.label}
        </h3>
        {changed && decision === "pending" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ backgroundColor: "#fef3c7", color: "#d97706" }}>
              Updated
            </span>
            <button
              onClick={onAccept}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-white transition-all active:scale-95 hover:brightness-110"
              style={{ backgroundColor: "#16a34a" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>check</span>
              Accept
            </button>
            <button
              onClick={onDecline}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all active:scale-95"
              style={{ backgroundColor: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>close</span>
              Decline
            </button>
          </div>
        )}
        {changed && decision === "accepted" && (
          <span className="text-[10px] font-bold" style={{ color: "#16a34a" }}>✓ Accepted</span>
        )}
        {changed && decision === "declined" && (
          <span className="text-[10px] font-bold" style={{ color: "#94a3b8" }}>✗ Declined</span>
        )}
      </div>

      {/* Accepted — editable text */}
      {changed && decision === "accepted" && (
        <textarea
          value={editedText ?? problem.after}
          onChange={(e) => onEdit(e.target.value)}
          rows={afterLines.length + 1}
          className="w-full resize-none rounded px-3 py-2.5 text-sm leading-relaxed focus:outline-none"
          style={{ backgroundColor: "white", borderLeft: "3px solid #16a34a", color: "var(--color-on-surface)", border: "1px solid #e2e8f0" }}
        />
      )}

      {/* Pending — new text highlighted + old crossed out */}
      {changed && decision === "pending" && (
        <>
          <div className="px-3 py-2.5 rounded mb-1" style={{ backgroundColor: "#f0fdf4", borderLeft: "3px solid #16a34a" }}>
            {afterLines.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--color-on-surface)" }}>{line}</p>
            ))}
          </div>
          <div className="px-3 py-1.5">
            {beforeLines.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed line-through" style={{ color: "#94a3b8" }}>{line}</p>
            ))}
          </div>
        </>
      )}

      {/* Declined — show old text */}
      {changed && decision === "declined" && (
        <div className="px-3 py-1.5">
          {beforeLines.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--color-on-surface)" }}>{line}</p>
          ))}
        </div>
      )}

      {/* Unchanged */}
      {!changed && (
        <div className="px-3 py-1">
          {afterLines.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--color-on-surface)" }}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DiffNoteView({ note, onCopy }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Derive changed keys from actual content diff (not Claude's changed flag)
  const changedProblemKeys = note.problems?.filter((p) => isActuallyChanged(p.before, p.after)).map((p) => p.label) ?? [];
  const changedSectionKeys = [
    note.subjective_section && isActuallyChanged(note.subjective_section.before, note.subjective_section.after) && "__subjective",
    note.social_section && isActuallyChanged(note.social_section.before, note.social_section.after) && "__social",
  ].filter(Boolean) as string[];
  const allChangedKeys = [...changedProblemKeys, ...changedSectionKeys];

  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(allChangedKeys.map((k) => [k, "pending" as Decision]))
  );
  const [edits, setEdits] = useState<Record<string, string>>({});

  const scrollToNextPending = useCallback((justDecidedKey: string, currentDecisions: Record<string, Decision>) => {
    // Find the next pending key after the one just decided
    const pending = allChangedKeys.filter((k) => k !== justDecidedKey && currentDecisions[k] === "pending");
    if (pending.length === 0) return;
    const nextId = `diff-item-${pending[0]}`;
    setTimeout(() => {
      const el = document.getElementById(nextId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [allChangedKeys]);

  const decide = useCallback((key: string, d: Decision) => {
    setDecisions((prev) => {
      const next = { ...prev, [key]: d };
      scrollToNextPending(key, next);
      return next;
    });
  }, [scrollToNextPending]);

  const acceptAll = useCallback(() => {
    setDecisions(Object.fromEntries(allChangedKeys.map((k) => [k, "accepted" as Decision])));
  }, [allChangedKeys]);

  const pendingCount = Object.values(decisions).filter((d) => d === "pending").length;

  const handleCopy = () => {
    onCopy(buildFinalText(note, decisions, edits));
  };

  if (note.format !== "problem-diff" || !note.problems) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-5 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(191,200,204,0.2)", backgroundColor: "#fafaf8" }}
      >
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#d97706" }} />
              <span className="text-[11px] font-semibold" style={{ color: "#d97706" }}>
                {pendingCount} change{pendingCount !== 1 ? "s" : ""} to review
              </span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm" style={{ color: "#16a34a" }}>check_circle</span>
              <span className="text-[11px] font-semibold" style={{ color: "#16a34a" }}>All changes reviewed</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={acceptAll}
              className="text-[10px] font-bold px-2.5 py-1 rounded transition-all hover:brightness-110 text-white"
              style={{ backgroundColor: "#16a34a" }}
            >
              Accept All
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded transition-all"
            style={{ backgroundColor: "#f1f5f9", color: "#1e3a5f", border: "1px solid #e2e8f0" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>content_copy</span>
            Copy to EHR
          </button>
        </div>
      </div>

      {/* Note body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        {/* Subjective */}
        {note.subjective_section && (
          <SectionDiff
            id="diff-item-__subjective"
            label="SUBJECTIVE"
            section={note.subjective_section}
            decision={decisions["__subjective"] ?? "accepted"}
            editedText={edits["__subjective"]}
            onAccept={() => decide("__subjective", "accepted")}
            onDecline={() => decide("__subjective", "declined")}
            onEdit={(text) => setEdits((prev) => ({ ...prev, "__subjective": text }))}
          />
        )}

        {/* Assessment & Plan */}
        <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--color-on-surface-variant)" }}>
          Assessment &amp; Plan
        </p>
        {note.problems.map((problem) => {
          const changed = isActuallyChanged(problem.before, problem.after);
          return (
            <ProblemDiff
              key={problem.label}
              id={`diff-item-${problem.label}`}
              problem={problem}
              decision={changed ? (decisions[problem.label] ?? "pending") : "accepted"}
              editedText={edits[problem.label]}
              onAccept={() => decide(problem.label, "accepted")}
              onDecline={() => decide(problem.label, "declined")}
              onEdit={(text) => setEdits((prev) => ({ ...prev, [problem.label]: text }))}
            />
          );
        })}

        {/* Social */}
        {note.social_section && (
          <SectionDiff
            id="diff-item-__social"
            label="SOCIAL"
            section={note.social_section}
            decision={decisions["__social"] ?? "accepted"}
            editedText={edits["__social"]}
            onAccept={() => decide("__social", "accepted")}
            onDecline={() => decide("__social", "declined")}
            onEdit={(text) => setEdits((prev) => ({ ...prev, "__social": text }))}
          />
        )}
      </div>
    </div>
  );
}
