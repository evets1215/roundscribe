"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { garyBaileyNote, IcdCode, type Patient } from "@/lib/data";
import { extractRawNoteText } from "@/lib/patient-records";
import type { StructuredNote } from "@/lib/medgemma";
import DiffNoteView from "@/components/DiffNoteView";
import {
  type TaskStatus,
  type HandoffItem,
  STATUS_ICON,
  STATUS_COLOR,
  handleNoteKeyDown,
} from "@/lib/handoff-types";
import { useHandoff } from "@/hooks/useHandoff";
import { useSmartInput } from "@/hooks/useSmartInput";
import { extractTasksFromNewLines, type ExtractedTask } from "@/lib/task-extractor";
import { matchResultToTasks, type TaskMatch } from "@/lib/loop-closure";

type GenerateState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "done"; noteId: string; note: StructuredNote; priorText: string }
  | { status: "error"; message: string };

type DiffLine = { type: "same" | "added" | "removed"; text: string };

function normalizeNote(text: string): string {
  return text
    .replace(/\\n/g, "\n")     // literal \n → actual newline
    .replace(/\r\n/g, "\n")    // CRLF → LF
    .replace(/\r/g, "\n")      // CR → LF
    .replace(/\xa0/g, " ")     // non-breaking space → regular space
    .replace(/[ \t]+$/gm, ""); // strip trailing whitespace per line
}

function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = normalizeNote(before).split("\n");
  const b = normalizeNote(after).split("\n");
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      result.unshift({ type: "same", text: a[i-1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ type: "added", text: b[j-1] });
      j--;
    } else {
      result.unshift({ type: "removed", text: a[i-1] });
      i--;
    }
  }
  return result;
}


function buildHandoffText(items: HandoffItem[], note: string): string {
  const byStatus = (s: TaskStatus) => items.filter((i) => i.status === s && i.text.trim());
  const sections: string[] = [];
  const done     = byStatus("done");
  const pending  = byStatus("pending");
  const carry    = byStatus("carry_forward");
  const awaiting = byStatus("awaiting_result");
  if (done.length)     sections.push("Updated today:\n"              + done.map((i) => `- ${i.text}`).join("\n"));
  if (pending.length)  sections.push("Still pending:\n"              + pending.map((i) => `- ${i.text}`).join("\n"));
  if (carry.length)    sections.push("Carry forward to overnight:\n" + carry.map((i) => `- ${i.text}`).join("\n"));
  if (awaiting.length) sections.push("Awaiting results:\n"           + awaiting.map((i) => `- ${i.text}`).join("\n"));
  if (note.trim())     sections.push(note.trim());
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Inline diff view
// ---------------------------------------------------------------------------

function LineDiffView({
  before,
  after,
  onAccept,
  copied,
}: {
  before: string;
  after: string;
  onAccept: (text: string) => void;
  copied: boolean;
}) {
  const normBefore = normalizeNote(before);
  const normAfter = normalizeNote(after);
  const diff = computeLineDiff(normBefore, normAfter);
  // toggled[i] = true means the line's default is flipped:
  //   "added"   toggled → excluded from output
  //   "removed" toggled → included in output
  const [toggled, setToggled] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setToggled((prev) => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  const buildText = (t: Set<number>) =>
    diff
      .filter((l, i) => {
        if (l.type === "same") return true;
        if (l.type === "added") return !t.has(i);
        return t.has(i); // removed: keep only if toggled back in
      })
      .map((l) => l.text)
      .join("\n");

  const addedCount = diff.filter((l, i) => l.type === "added" && !toggled.has(i)).length;
  const removedCount = diff.filter((l, i) => l.type === "removed" && !toggled.has(i)).length;

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div
        className="flex items-center justify-between px-5 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(191,200,204,0.2)", backgroundColor: "#f8fafc" }}
      >
        <div className="flex items-center gap-3 text-[11px]">
          {addedCount > 0 && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: "#16a34a" }}>
              <span>+{addedCount}</span>
            </span>
          )}
          {removedCount > 0 && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: "#dc2626" }}>
              <span>−{removedCount}</span>
            </span>
          )}
          {addedCount === 0 && removedCount === 0 && (
            <span className="text-slate-400">No changes</span>
          )}
        </div>
        <button
          onClick={() => onAccept(buildText(toggled))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all active:scale-95"
          style={{ backgroundColor: copied ? "#16a34a" : "var(--color-primary)" }}
        >
          <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
          {copied ? "Copied!" : "Accept & Copy"}
        </button>
      </div>

      {/* Diff lines */}
      <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
        {diff.map((line, i) => {
          const isToggled = toggled.has(i);
          if (line.type === "same") {
            return (
              <div key={i} className="py-0.5" style={{ color: "var(--color-on-surface)" }}>
                {line.text || "\u00a0"}
              </div>
            );
          }
          if (line.type === "added") {
            const excluded = isToggled;
            return (
              <div
                key={i}
                className="flex items-start gap-2 py-0.5 px-2 rounded group cursor-pointer"
                style={{ backgroundColor: excluded ? "transparent" : "rgba(22,163,74,0.08)", color: excluded ? "#9ca3af" : "#15803d", textDecoration: excluded ? "line-through" : "none" }}
                onClick={() => toggle(i)}
                title={excluded ? "Click to include" : "Click to exclude"}
              >
                <span className="shrink-0 text-[10px] font-bold mt-0.5 w-3" style={{ color: excluded ? "#9ca3af" : "#16a34a" }}>+</span>
                <span>{line.text || "\u00a0"}</span>
              </div>
            );
          }
          // removed
          const kept = isToggled;
          return (
            <div
              key={i}
              className="flex items-start gap-2 py-0.5 px-2 rounded group cursor-pointer"
              style={{ backgroundColor: kept ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.06)", color: kept ? "#15803d" : "#b91c1c", textDecoration: kept ? "none" : "line-through" }}
              onClick={() => toggle(i)}
              title={kept ? "Click to remove" : "Click to keep"}
            >
              <span className="shrink-0 text-[10px] font-bold mt-0.5 w-3" style={{ color: kept ? "#16a34a" : "#dc2626" }}>−</span>
              <span>{line.text || "\u00a0"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Reusable workspace component — can be embedded or used standalone */
export function PatientWorkspace({ patientId, embedded = false }: { patientId: string; embedded?: boolean }) {
  const router = useRouter();

  // Gary Bailey is the demo patient with pre-loaded note data
  const isNewPatient = patientId !== "gary-bailey";
  const { patient: gbPatient, yesterday, today, icdCodes: gbIcdCodes } = garyBaileyNote;

  // Read patient metadata saved by the dashboard before navigating here.
  // Falls back to API fetch in a useEffect below if sessionStorage is empty.
  const [sessionPatient, setSessionPatient] = useState<Patient | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(`rs-patient-${patientId}`);
      if (raw) return JSON.parse(raw) as Patient;
    } catch {}
    return null;
  });

  // Unified display values (either from the session patient or gary bailey)
  const displayName = isNewPatient ? (sessionPatient?.name ?? "New Patient") : gbPatient.name;
  const displayRoom = isNewPatient ? (sessionPatient?.room ?? "—") : gbPatient.room;
  const displayMrn  = isNewPatient ? (sessionPatient?.mrn  ?? "—") : gbPatient.mrn;
  const displayDob  = isNewPatient ? (sessionPatient?.dob  ?? "—") : gbPatient.dob;
  const displayAge  = isNewPatient ? "" : String(gbPatient.age);
  const displaySex  = isNewPatient
    ? (sessionPatient?.sex === "M" ? "MALE" : sessionPatient?.sex === "F" ? "FEMALE" : "—")
    : gbPatient.sex;
  const icdCodes    = isNewPatient ? [] : gbIcdCodes;

  const editorRef = useRef<HTMLDivElement>(null);

  const [generateState, setGenerateState] = useState<GenerateState>({ status: "idle" });
  const handoff = useHandoff(patientId);

  // ── Loop closure state ──────────────────────────────────────────────────
  const [loopMatches, setLoopMatches] = useState<TaskMatch[]>([]);
  const [recentResolutions, setRecentResolutions] = useState<Array<{ match: TaskMatch; undoData: { id: string; prevStatus: string } }>>([]);

  const smart = useSmartInput({
    onPaste: (parsed) => {
      const items = handoff.getHandoff(patientId).items;
      const matches = matchResultToTasks(parsed, items);
      if (matches.length === 0) return;

      // High confidence (>0.9): auto-resolve with undo banner
      // Medium confidence (0.5-0.9): show suggestion
      const autoResolve = matches.filter((m) => m.confidence > 0.9);
      const suggestions = matches.filter((m) => m.confidence > 0.5 && m.confidence <= 0.9);

      for (const match of autoResolve) {
        const task = items.find((i) => i.id === match.taskId);
        if (!task) continue;
        const prevStatus = task.status;
        // Resolve the task
        handoff.setAllHandoff((prev) => {
          const d = prev[patientId];
          if (!d) return prev;
          return {
            ...prev,
            [patientId]: {
              ...d,
              items: d.items.map((i) =>
                i.id === match.taskId ? { ...i, status: "resolved" as const } : i,
              ),
            },
          };
        });
        setRecentResolutions((prev) => [...prev, { match, undoData: { id: match.taskId, prevStatus } }]);
        // Auto-clear the undo banner after 8s
        setTimeout(() => {
          setRecentResolutions((prev) => prev.filter((r) => r.match.taskId !== match.taskId));
        }, 8000);
      }

      if (suggestions.length > 0) {
        setLoopMatches((prev) => [...prev, ...suggestions]);
      }
    },
  });

  const handoffItems = handoff.getHandoff(patientId).items;
  const handoffNote = handoff.getHandoff(patientId).note;
  // Thin wrappers so inline keyboard handlers (Enter/Backspace) keep working
  const setHandoffItems = (updater: (prev: HandoffItem[]) => HandoffItem[]) => {
    handoff.setAllHandoff(prev => {
      const d = prev[patientId] ?? { items: [], note: "" };
      return { ...prev, [patientId]: { ...d, items: updater(d.items) } };
    });
  };
  const setHandoffNote = (note: string) => handoff.updateNote(patientId, note);
  const { setPendingFocusId } = handoff;

  // ── Task extraction from free text ──────────────────────────────────────
  const [suggestedTasks, setSuggestedTasks] = useState<ExtractedTask[]>([]);
  const prevNoteText = useRef(handoffNote);

  // Run deterministic extraction when the note changes (on newline)
  useEffect(() => {
    if (handoffNote === prevNoteText.current) return;
    const prev = prevNoteText.current;
    prevNoteText.current = handoffNote;

    // Only extract when a new line was added (Enter pressed)
    if (!handoffNote.includes("\n") || handoffNote.split("\n").length <= prev.split("\n").length) return;

    const extracted = extractTasksFromNewLines(prev, handoffNote);
    if (extracted.length > 0) {
      setSuggestedTasks((s) => [...s, ...extracted]);
    }
  }, [handoffNote]);

  const acceptSuggestedTask = (task: ExtractedTask) => {
    handoff.addItem(patientId, undefined, task.text);
    // Find the new item and set its status
    setTimeout(() => {
      handoff.setAllHandoff((prev) => {
        const d = prev[patientId];
        if (!d) return prev;
        const lastItem = d.items[d.items.length - 1];
        if (lastItem && lastItem.text === task.text) {
          return {
            ...prev,
            [patientId]: {
              ...d,
              items: d.items.map((i) => i.id === lastItem.id ? { ...i, status: task.status } : i),
            },
          };
        }
        return prev;
      });
    }, 50);
    setSuggestedTasks((s) => s.filter((t) => t !== task));
  };

  const dismissSuggestedTask = (task: ExtractedTask) => {
    setSuggestedTasks((s) => s.filter((t) => t !== task));
  };

  const [mobilePane, setMobilePane] = useState<"prior" | "handoff" | "note">("prior");
  const [showNotifications, setShowNotifications] = useState(false);
  const [copied, setCopied] = useState(false);
  const [handoffCopied, setHandoffCopied] = useState(false);
  const [previousNote, setPreviousNote] = useState<string>(() => {
    if (isNewPatient) return "";
    return [
      `Date: ${yesterday.date}`,
      `Patient: ${gbPatient.name}`,
      "",
      "SUBJECTIVE",
      yesterday.subjective,
      "",
      "ASSESSMENT & PLAN",
      ...yesterday.problems.flatMap((p) => [`#${p.label}`, p.text, ""]),
      "SOCIAL",
      yesterday.social,
    ].join("\n");
  });

  const handleGenerate = async () => {
    const priorText = priorEditorRef.current?.innerText ?? previousNote;
    setGenerateState({ status: "generating" });
    try {
      const res = await fetch(`/api/patients/${patientId}/generate-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousNote: priorText,
          handoffItems: handoffItems.filter((i) => i.text.trim()),
          handoffNote,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      const result: { noteId: string; note: StructuredNote } = await res.json();
      setGenerateState({ status: "done", ...result, priorText });
      setMobilePane("note");
    } catch (err) {
      setGenerateState({ status: "error", message: (err as Error).message });
    }
  };

  const priorEditorRef = useRef<HTMLDivElement>(null);
  // Prevents blur/visibilitychange handlers from saving when we programmatically
  // set innerText (auto-load on mount, auto-advance after generation).
  const isAutoLoading = useRef(false);
  const [priorSaveError, setPriorSaveError] = useState(false);
  const [priorLoading, setPriorLoading] = useState(isNewPatient);

  // Populate prior editor on mount.
  // Gary Bailey demo: use static data. New patients: fetch latest note from DB.
  useEffect(() => {
    const el = priorEditorRef.current;

    if (!isNewPatient) {
      // Gary Bailey demo — populate from static data
      if (el && previousNote) {
        isAutoLoading.current = true;
        el.innerHTML = previousNote.replace(/\n/g, "<br/>");
        isAutoLoading.current = false;
      }
      return;
    }

    // New patient: load prior note from DB (newest note's rawText)
    // Disable editor during fetch to prevent race with user edits.
    if (el) el.contentEditable = "false";

    fetch(`/api/patients/${patientId}/notes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((notes: Array<{ noteJson: unknown }>) => {
        const rawText = extractRawNoteText(notes[0]?.noteJson);
        if (rawText && priorEditorRef.current) {
          isAutoLoading.current = true;
          priorEditorRef.current.innerText = rawText;
          isAutoLoading.current = false;
        }
      })
      .catch(() => {
        // Fetch failed — editor stays empty, doctor can paste manually
      })
      .finally(() => {
        if (priorEditorRef.current) priorEditorRef.current.contentEditable = "true";
        setPriorLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // Patient metadata API fallback: if sessionStorage was empty (direct URL / refresh),
  // fetch from the API and hydrate the header.
  useEffect(() => {
    if (sessionPatient || !isNewPatient) return;
    fetch(`/api/patients/${patientId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((patient: Patient) => setSessionPatient(patient))
      .catch(() => {
        // Patient not found — header shows "New Patient"
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // Paste persistence: save prior editor content to DB on blur, visibility change,
  // and before unload — so Day-1 paste work survives browser close before first generation.
  useEffect(() => {
    if (!isNewPatient) return;

    const doSave = (rawText: string, keepalive = false) => {
      if (!rawText.trim() || isAutoLoading.current) return;
      fetch(`/api/patients/${patientId}/prior-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
        keepalive,
      })
        .then(() => setPriorSaveError(false))
        .catch(() => {
          setPriorSaveError(true);
          setTimeout(() => setPriorSaveError(false), 4000);
        });
    };

    const handleBlur = () => doSave(priorEditorRef.current?.innerText ?? "");

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const rawText = priorEditorRef.current?.innerText ?? "";
        if (rawText.trim() && !isAutoLoading.current) {
          fetch(`/api/patients/${patientId}/prior-note`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawText }),
            keepalive: true,
          }).catch(() => {
            console.warn("[roundscribe] visibilitychange prior-note save failed");
          });
        }
      }
    };

    const handleBeforeUnload = () => {
      const rawText = priorEditorRef.current?.innerText ?? "";
      if (rawText.trim() && !isAutoLoading.current) {
        navigator.sendBeacon(
          `/api/patients/${patientId}/prior-note`,
          new Blob([JSON.stringify({ rawText })], { type: "application/json" })
        );
      }
    };

    const el = priorEditorRef.current;
    el?.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      el?.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // Seed demo data for Gary Bailey on mount (if no handoff exists yet)
  const handoffSeeded = useRef(false);
  useEffect(() => {
    if (handoffSeeded.current) return;
    handoffSeeded.current = true;
    if (!isNewPatient && handoffItems.length === 0) {
      handoff.setPatientHandoff(patientId, {
        items: [
          { id: "gb-1", text: "restart rivaroxaban today", status: "pending" },
          { id: "gb-2", text: "titrate oxycodone to 10mg", status: "pending" },
          { id: "gb-3", text: "hgb stable — no transfusion needed", status: "done" },
        ],
        note: "",
      });
    } else if (isNewPatient && handoffItems.length === 0) {
      handoff.setPatientHandoff(patientId, {
        items: [{ id: `h-${Date.now()}`, text: "", status: "pending" }],
        note: "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleHandoffStatus = (id: string) => handoff.cycleStatus(patientId, id);
  const updateHandoffItem = (id: string, text: string) => handoff.updateItem(patientId, id, text);
  const addHandoffItem = (afterId?: string, initialText = "") => handoff.addItem(patientId, afterId, initialText);
  const removeHandoffItem = (id: string) => handoff.removeItem(patientId, id);

  const execFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  const handleLink = () => {
    const url = prompt("Enter URL:");
    if (url) execFormat("createLink", url);
  };

  const handleCopy = async (text?: string) => {
    const content = text ?? (generateState.status === "done" ? generateState.note.rawText : editorRef.current?.innerText ?? "");
    await navigator.clipboard.writeText(content);
    if (generateState.status === "done" && priorEditorRef.current) {
      isAutoLoading.current = true;
      priorEditorRef.current.innerText = content;
      isAutoLoading.current = false;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const insertIcdCode = (icd: IcdCode) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand("insertText", false, `\n${icd.code} – ${icd.description}`);
  };


  const outerContent = (
      <main className={`${embedded ? "" : "md:ml-64"} flex-1 flex flex-col min-w-0`} style={{ backgroundColor: "var(--color-surface)" }}>
        {/* Header */}
        <header
          className="sticky top-0 z-10 shrink-0 bg-white"
          style={{ borderBottom: "1px solid rgba(191,200,204,0.3)" }}
        >
          {/* Mobile header: back | centered name | avatar */}
          <div className="md:hidden flex items-center px-2 py-3">
            <Link
              href="/"
              className="p-2 rounded-full transition-colors hover:bg-slate-100 shrink-0"
              style={{ color: "var(--color-on-surface)" }}
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <div className="flex-1 text-center min-w-0 px-2">
              <h1 className="font-semibold text-base truncate" style={{ color: "var(--color-on-surface)" }}>
                {displayName}
              </h1>
              <p className="text-xs truncate" style={{ color: "var(--color-on-surface-variant)" }}>
                {isNewPatient ? "New Patient" : `${yesterday.date} · Room ${displayRoom}`}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                backgroundColor: "var(--color-primary-container)",
                color: "var(--color-on-primary-container)",
              }}
            >
              DM
            </div>
          </div>

          {/* Desktop header: left name+info | right search+icons */}
          <div className="hidden md:flex justify-between items-center px-8 py-4">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="p-2 rounded-full transition-colors hover:bg-slate-100"
                style={{ color: "var(--color-primary)" }}
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </Link>
              <h1
                className="font-extrabold text-2xl tracking-tighter"
                style={{ fontFamily: "var(--font-headline)", color: "var(--color-primary)" }}
              >
                {displayName}{!isNewPatient && ` • Room ${displayRoom}`}
              </h1>
              <span
                className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase rounded"
                style={{
                  backgroundColor: "var(--color-surface-container-highest)",
                  color: "var(--color-on-surface-variant)",
                }}
              >
                {displayAge}{displayAge ? " Y.O. " : ""}{displaySex}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div
                className="flex rounded-full px-4 py-2 items-center gap-2"
                style={{
                  backgroundColor: "var(--color-surface-container-low)",
                  border: "1px solid rgba(191,200,204,0.3)",
                }}
              >
                <span className="material-symbols-outlined" style={{ color: "var(--color-outline)" }}>search</span>
                <input
                  className="bg-transparent border-none focus:outline-none text-sm w-48"
                  style={{ fontFamily: "var(--font-body)" }}
                  placeholder="Search clinical data..."
                  type="text"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications((v) => !v)}
                    className="p-2 rounded-full transition-colors hover:bg-slate-50"
                    style={{ color: showNotifications ? "var(--color-primary)" : "var(--color-on-surface-variant)" }}
                  >
                    <span className="material-symbols-outlined">notifications</span>
                  </button>
                  {showNotifications && (
                    <div
                      className="absolute right-0 top-10 w-64 rounded-lg shadow-lg z-50 p-4"
                      style={{
                        backgroundColor: "var(--color-surface-container-lowest)",
                        border: "1px solid var(--color-outline-variant)",
                      }}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-on-surface-variant)" }}>
                        Notifications
                      </p>
                      <p className="text-xs text-center py-4" style={{ color: "var(--color-on-surface-variant)" }}>
                        No new notifications
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => router.push("/settings")}
                  className="p-2 rounded-full transition-colors hover:bg-slate-50"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  <span className="material-symbols-outlined">settings</span>
                </button>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: "var(--color-primary-container)",
                    color: "var(--color-on-primary-container)",
                    border: "1px solid var(--color-outline-variant)",
                  }}
                >
                  DM
                </div>
              </div>
            </div>
          </div>

          {/* Mobile segmented tabs */}
          <div className="lg:hidden px-4 pb-3">
            <div className="flex rounded-xl p-1" style={{ backgroundColor: "#f1f3f4" }}>
              {([
                { key: "prior", label: "Prior Note" },
                { key: "handoff", label: "Handoff" },
                { key: "note", label: "Note", disabled: generateState.status === "idle" },
              ] as { key: "prior"|"handoff"|"note"; label: string; disabled?: boolean }[]).map((t) => {
                const active = mobilePane === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => !t.disabled && setMobilePane(t.key)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={
                      t.disabled
                        ? { color: "var(--color-on-surface-variant)", opacity: 0.35 }
                        : active
                          ? { backgroundColor: "white", color: "var(--color-on-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
                          : { color: "var(--color-on-surface-variant)" }
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Content canvas */}
        <div className="flex-1 overflow-hidden px-0 py-0 pb-20 md:px-8 md:py-6 md:pb-6">

          <div
            className="flex flex-col h-full gap-0 lg:gap-4 lg:grid"
            style={{
              gridTemplateColumns: "5fr 7fr",
            }}
          >
            {/* Column 1: Prior Note (paste area) */}
            <div
              className={`${mobilePane === "prior" ? "flex" : "hidden"} lg:flex flex-col flex-1 lg:rounded-xl overflow-hidden lg:shadow-sm`}

              style={{
                backgroundColor: "var(--color-surface-container-low)",
                border: "none",
              }}
            >
              {/* Desktop column header */}
              <div
                className="hidden md:flex px-5 py-4 items-center justify-between shrink-0"
                style={{
                  backgroundColor: "rgba(231,232,233,0.6)",
                  borderBottom: "1px solid rgba(191,200,204,0.2)",
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface-variant)" }}>
                  Prior Note from EHR
                </span>
                <button
                  onClick={() => { setPreviousNote(""); if (priorEditorRef.current) priorEditorRef.current.innerHTML = ""; }}
                  className="text-[10px] font-medium hover:underline transition-colors"
                  style={{ color: "var(--color-outline)" }}
                  title="Clear and paste your own note"
                >
                  Clear
                </button>
              </div>
              {/* Mobile header */}
              <div className="md:hidden px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
                <span className="font-bold text-base" style={{ color: "var(--color-on-surface)" }}>Prior Note</span>
                <button
                  onClick={() => { setPreviousNote(""); if (priorEditorRef.current) priorEditorRef.current.innerHTML = ""; }}
                  className="text-xs"
                  style={{ color: "var(--color-outline)" }}
                >
                  Clear
                </button>
              </div>
              {/* Toolbar */}
              <div
                className="hidden md:flex items-center gap-1 px-4 py-2 shrink-0"
                style={{ backgroundColor: "rgba(231,232,233,0.6)", borderBottom: "1px solid rgba(191,200,204,0.2)" }}
              >
                {[
                  { icon: "undo", title: "Undo", cmd: "undo" },
                  { icon: "redo", title: "Redo", cmd: "redo" },
                ].map(({ icon, title, cmd }) => (
                  <button key={icon} title={title} onClick={() => { priorEditorRef.current?.focus(); execFormat(cmd); }} className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors">
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                  </button>
                ))}
                <div className="h-4 w-px bg-slate-300 mx-1" />
                {[
                  { icon: "format_bold", title: "Bold", cmd: "bold" },
                  { icon: "format_italic", title: "Italic", cmd: "italic" },
                  { icon: "format_underlined", title: "Underline", cmd: "underline" },
                ].map(({ icon, title, cmd }) => (
                  <button key={icon} title={title} onClick={() => { priorEditorRef.current?.focus(); execFormat(cmd); }} className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors">
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                  </button>
                ))}
                <div className="h-4 w-px bg-slate-300 mx-1" />
                {[
                  { icon: "format_list_bulleted", title: "Bulleted List", cmd: "insertUnorderedList" },
                  { icon: "format_list_numbered", title: "Numbered List", cmd: "insertOrderedList" },
                ].map(({ icon, title, cmd }) => (
                  <button key={icon} title={title} onClick={() => { priorEditorRef.current?.focus(); execFormat(cmd); }} className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors">
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                  </button>
                ))}
                <div className="h-4 w-px bg-slate-300 mx-1" />
                <button title="Insert Link" onClick={() => { const url = prompt("Enter URL:"); if (url) { priorEditorRef.current?.focus(); execFormat("createLink", url); }}} className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors">
                  <span className="material-symbols-outlined text-lg">link</span>
                </button>
              </div>
              {/* Editable area — always mounted, never swapped */}
              <div className="relative flex-1 overflow-hidden">
                {priorLoading && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                    <span className="material-symbols-outlined text-sm animate-spin" style={{ animationDuration: "1s" }}>progress_activity</span>
                    Loading prior note…
                  </div>
                )}
                <div
                  ref={priorEditorRef}
                  className="prior-editor h-full px-5 py-5 md:p-6 text-sm md:text-xs leading-relaxed overflow-y-auto focus:outline-none"
                  style={{ fontFamily: "var(--font-body)", color: priorLoading ? "transparent" : "rgba(63,72,76,0.8)", backgroundColor: "transparent" }}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Paste yesterday's note here to get started"
                />
              </div>
              {priorSaveError && (
                <p className="px-5 pb-2 text-xs text-red-600">Couldn&apos;t save — check connection</p>
              )}
            </div>

            {/* Column 2: Handoff (State A) or Generated Note (State B) */}
            <div
              className={`${mobilePane === "handoff" || mobilePane === "note" ? "flex" : "hidden"} lg:flex flex-col flex-1 lg:rounded-xl overflow-hidden lg:shadow-md relative`}
              style={{ backgroundColor: "white", border: "none" }}
            >
              {/* State A — Handoff panel (before generation) */}
              {generateState.status !== "done" && (
                <>
                  {/* Header */}
                  <div
                    className="px-5 py-3 md:px-6 md:py-4 bg-white flex items-center justify-between shrink-0"
                    style={{ borderBottom: "1px solid rgba(191,200,204,0.2)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                        Today&apos;s Handoff
                      </span>
                      {handoffItems.filter((i) => i.text.trim()).length > 0 && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "var(--color-primary-container)", color: "var(--color-primary)" }}
                        >
                          {handoffItems.filter((i) => i.text.trim()).length}
                        </span>
                      )}
                    </div>
                    {generateState.status === "error" && (
                      <span className="text-[10px] text-red-600 font-medium max-w-[200px] truncate">{generateState.message}</span>
                    )}
                  </div>

                  {/* Warning if no prior note */}
                  {!(priorEditorRef.current?.innerText?.trim() || previousNote.trim()) && (
                    <div
                      className="hidden md:flex px-6 py-2 items-center gap-2 text-[11px] shrink-0"
                      style={{ backgroundColor: "rgba(217,119,6,0.06)", color: "#b45309", borderBottom: "1px solid rgba(217,119,6,0.15)" }}
                    >
                      <span className="material-symbols-outlined text-sm">warning</span>
                      No prior note loaded — note will be generated from handoff only
                    </div>
                  )}

                  {/* Checklist + free text */}
                  <div className="flex-1 overflow-y-auto p-5 md:p-6 flex flex-col gap-4">
                    <div className="space-y-1">
                      {handoffItems.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-2 py-0.5 group">
                          <button
                            onClick={() => cycleHandoffStatus(item.id)}
                            title={`Status: ${item.status} — tap to cycle`}
                            className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors hover:bg-slate-100"
                            style={{ color: STATUS_COLOR[item.status] }}
                          >
                            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                              {STATUS_ICON[item.status]}
                            </span>
                          </button>
                          <input
                            id={`hi-${item.id}`}
                            type="text"
                            value={item.text}
                            onChange={(e) => updateHandoffItem(item.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (smart.handleKeyDown(e, () => item.text, (v) => updateHandoffItem(item.id, v))) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const pos = e.currentTarget.selectionStart ?? item.text.length;
                                const before = item.text.slice(0, pos);
                                const after = item.text.slice(pos);
                                const newId = `h-${Date.now()}-${Math.random()}`;
                                setHandoffItems(prev => {
                                  const updated = prev.map(i => i.id === item.id ? { ...i, text: before } : i);
                                  const i2 = updated.findIndex(i => i.id === item.id);
                                  updated.splice(i2 + 1, 0, { id: newId, text: after, status: "pending" as TaskStatus, createdAt: Date.now() });
                                  return updated;
                                });
                                setPendingFocusId(newId);
                              }
                              if (e.key === "ArrowUp" && idx > 0) {
                                const pos = e.currentTarget.selectionStart ?? 0;
                                e.preventDefault();
                                const prevEl = document.getElementById(`hi-${handoffItems[idx - 1].id}`) as HTMLInputElement | null;
                                if (prevEl) { prevEl.focus(); prevEl.setSelectionRange(Math.min(pos, handoffItems[idx - 1].text.length), Math.min(pos, handoffItems[idx - 1].text.length)); }
                              }
                              if (e.key === "ArrowDown" && idx < handoffItems.length - 1) {
                                const pos = e.currentTarget.selectionStart ?? 0;
                                e.preventDefault();
                                const nextEl = document.getElementById(`hi-${handoffItems[idx + 1].id}`) as HTMLInputElement | null;
                                if (nextEl) { nextEl.focus(); nextEl.setSelectionRange(Math.min(pos, handoffItems[idx + 1].text.length), Math.min(pos, handoffItems[idx + 1].text.length)); }
                              }
                              if (e.key === "Backspace" && idx > 0 && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
                                e.preventDefault();
                                const prevItem = handoffItems[idx - 1];
                                const cursorPos = prevItem.text.length;
                                const merged = prevItem.text + item.text;
                                setHandoffItems(prev => prev.map(i => i.id === prevItem.id ? { ...i, text: merged } : i).filter(i => i.id !== item.id));
                                requestAnimationFrame(() => {
                                  const el = document.getElementById(`hi-${prevItem.id}`) as HTMLInputElement | null;
                                  if (el) { el.focus(); el.setSelectionRange(cursorPos, cursorPos); }
                                });
                              } else if (e.key === "Backspace" && item.text === "" && idx === 0 && handoffItems.length > 1) {
                                e.preventDefault(); removeHandoffItem(item.id);
                              }
                            }}
                            placeholder={idx === 0 ? "Add task..." : ""}
                            className="flex-1 bg-transparent text-sm focus:outline-none min-h-[36px]"
                            style={{
                              color: item.status === "done" || item.status === "resolved"
                                ? "var(--color-on-surface-variant)"
                                : "var(--color-on-surface)",
                              textDecoration: item.status === "resolved" ? "line-through" : "none",
                            }}
                          />
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider shrink-0 hidden md:block"
                            style={{ color: STATUS_COLOR[item.status], minWidth: 60 }}
                          >
                            {item.status.replace("_", " ")}
                          </span>
                          {item.status === "carry_forward" && item.createdAt && Date.now() - item.createdAt > 3 * 24 * 60 * 60 * 1000 && (
                            <span
                              className="text-[9px] font-bold shrink-0 flex items-center gap-0.5"
                              style={{ color: "var(--warning)" }}
                              title={`Carried forward for ${Math.floor((Date.now() - item.createdAt) / (24 * 60 * 60 * 1000))} days — consider resolving or re-carrying`}
                            >
                              <span className="material-symbols-outlined text-xs">warning</span>
                              {Math.floor((Date.now() - item.createdAt) / (24 * 60 * 60 * 1000))}d
                            </span>
                          )}
                          <button
                            onClick={() => removeHandoffItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity shrink-0"
                            style={{ color: "var(--color-outline)" }}
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addHandoffItem()}
                        className="flex items-center gap-1.5 mt-1 text-xs transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-primary)" }}
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        Add task
                      </button>
                    </div>

                    <div style={{ borderTop: "1px solid rgba(191,200,204,0.3)" }} className="pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--color-on-surface-variant)" }}>
                        Additional notes
                      </p>
                      <textarea
                        value={handoffNote}
                        onChange={(e) => {
                          setHandoffNote(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        onKeyDown={(e) => handleNoteKeyDown(e, setHandoffNote)}
                        onPaste={smart.handlePaste}
                        placeholder="Free text notes..."
                        className="w-full bg-transparent text-sm focus:outline-none resize-none"
                        style={{ color: "var(--color-on-surface)", minHeight: "88px" }}
                      />
                      {smart.pasteConfirmation && (
                        <p className="text-xs mt-1 animate-pulse" style={{ color: "var(--color-primary)" }}>
                          {smart.pasteConfirmation}
                        </p>
                      )}
                    </div>

                    {/* Task extraction suggestions */}
                    {suggestedTasks.length > 0 && (
                      <div className="px-1 pt-3 pb-1 flex flex-col gap-2" style={{ borderTop: "1px solid rgba(191,200,204,0.2)" }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface-variant)" }}>
                          Suggested tasks
                        </p>
                        {suggestedTasks.map((task, idx) => (
                          <div
                            key={`${task.text}-${idx}`}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                            style={{ backgroundColor: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant, rgba(191,200,204,0.3))" }}
                          >
                            <span className="material-symbols-outlined text-sm" style={{ color: "var(--color-primary)" }}>
                              add_task
                            </span>
                            <span className="flex-1" style={{ color: "var(--color-on-surface)" }}>
                              {task.text}
                            </span>
                            <button
                              onClick={() => acceptSuggestedTask(task)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all active:scale-95"
                              style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
                            >
                              Add
                            </button>
                            <button
                              onClick={() => dismissSuggestedTask(task)}
                              className="flex items-center px-1 py-1 rounded transition-opacity hover:opacity-70"
                              style={{ color: "var(--color-on-surface-variant)" }}
                            >
                              <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Loop closure: auto-resolution banners */}
                    {recentResolutions.length > 0 && (
                      <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid rgba(191,200,204,0.2)" }}>
                        {recentResolutions.map((r) => (
                          <div
                            key={r.match.taskId}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                            style={{ backgroundColor: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)" }}
                          >
                            <span className="material-symbols-outlined text-sm" style={{ color: "#16a34a" }}>check_circle</span>
                            <span className="flex-1" style={{ color: "#15803d" }}>
                              {r.match.summary} resolved task
                            </span>
                            <button
                              onClick={() => {
                                // Undo: restore previous status
                                handoff.setAllHandoff((prev) => {
                                  const d = prev[patientId];
                                  if (!d) return prev;
                                  return {
                                    ...prev,
                                    [patientId]: {
                                      ...d,
                                      items: d.items.map((i) =>
                                        i.id === r.undoData.id
                                          ? { ...i, status: r.undoData.prevStatus as HandoffItem["status"] }
                                          : i,
                                      ),
                                    },
                                  };
                                });
                                setRecentResolutions((prev) => prev.filter((x) => x.match.taskId !== r.match.taskId));
                              }}
                              className="text-[10px] font-bold px-2 py-1 rounded transition-all active:scale-95"
                              style={{ color: "#15803d", border: "1px solid rgba(22,163,74,0.3)" }}
                            >
                              Undo
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Loop closure: suggestion banners */}
                    {loopMatches.length > 0 && (
                      <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid rgba(191,200,204,0.2)" }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface-variant)" }}>
                          Result matches
                        </p>
                        {loopMatches.map((match, idx) => {
                          const taskItem = handoffItems.find((i) => i.id === match.taskId);
                          return (
                            <div
                              key={`${match.taskId}-${idx}`}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                              style={{ backgroundColor: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)" }}
                            >
                              <span className="material-symbols-outlined text-sm" style={{ color: "#d97706" }}>link</span>
                              <span className="flex-1" style={{ color: "var(--color-on-surface)" }}>
                                <strong>{match.summary}</strong>
                                {taskItem ? ` may ${match.action} "${taskItem.text}"` : ""}
                              </span>
                              <button
                                onClick={() => {
                                  handoff.setAllHandoff((prev) => {
                                    const d = prev[patientId];
                                    if (!d) return prev;
                                    return {
                                      ...prev,
                                      [patientId]: {
                                        ...d,
                                        items: d.items.map((i) =>
                                          i.id === match.taskId
                                            ? { ...i, status: match.action === "resolve" ? "resolved" as const : i.status }
                                            : i,
                                        ),
                                      },
                                    };
                                  });
                                  setLoopMatches((prev) => prev.filter((m) => m.taskId !== match.taskId));
                                }}
                                className="text-[10px] font-bold px-2 py-1 rounded transition-all active:scale-95"
                                style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => setLoopMatches((prev) => prev.filter((m) => m.taskId !== match.taskId))}
                                className="flex items-center px-1 py-1 rounded transition-opacity hover:opacity-70"
                                style={{ color: "var(--color-on-surface-variant)" }}
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Generate button row */}
                  <div
                    className="hidden md:flex px-6 py-4 shrink-0 items-center gap-3"
                    style={{ borderTop: "1px solid rgba(191,200,204,0.2)" }}
                  >
                    {generateState.status === "error" && (
                      <p className="text-xs text-red-600 flex-1">{generateState.message}</p>
                    )}
                    {/* Generate Handoff */}
                    <button
                      onClick={async () => {
                        const text = buildHandoffText(handoffItems, handoffNote);
                        if (!text.trim()) return;
                        await navigator.clipboard.writeText(text);
                        setHandoffCopied(true);
                        setTimeout(() => setHandoffCopied(false), 2000);
                      }}
                      disabled={!handoffItems.some((i) => i.text.trim()) && !handoffNote.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
                      style={{ color: "var(--color-primary)", border: "1px solid var(--color-primary)" }}
                    >
                      <span className="material-symbols-outlined text-sm">{handoffCopied ? "check" : "content_copy"}</span>
                      {handoffCopied ? "Copied!" : "Copy Handoff"}
                    </button>
                    {/* Generate Progress Note */}
                    <button
                      onClick={handleGenerate}
                      disabled={generateState.status === "generating" || (!handoffItems.some((i) => i.text.trim()) && !handoffNote.trim())}
                      className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                      style={{ backgroundColor: "var(--color-primary)" }}
                    >
                      {generateState.status === "generating" ? (
                        <>
                          <span className="material-symbols-outlined text-base animate-spin">autorenew</span>
                          Generating…
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-base">auto_awesome</span>
                          Generate Progress Note
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* State B — Generated note */}
              {generateState.status === "done" && (
                <>
                  {/* Header */}
                  <div
                    className="px-5 py-3 md:px-6 md:py-4 bg-white flex items-center justify-between shrink-0"
                    style={{ borderBottom: "1px solid rgba(191,200,204,0.2)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                        Generated Note
                      </span>
                      <span className="text-[9px] font-mono opacity-40">id:{generateState.noteId.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setGenerateState({ status: "idle" })}
                        className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all hover:bg-slate-50"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Revise Handoff
                      </button>
                      <button
                        onClick={() => { void handleCopy(generateState.status === "done" ? generateState.note.rawText : undefined); }}
                        className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-md transition-all text-slate-600 hover:bg-slate-100"
                      >
                        <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
                        <span className="text-[10px] font-bold">{copied ? "Copied!" : "Copy to EHR"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Warning if some ops failed to match lines in the prior note */}
                  {generateState.note.failedOps && generateState.note.failedOps.length > 0 && (
                    <div
                      className="mx-5 mt-3 md:mx-6 px-3 py-2 rounded-md flex items-start gap-2 text-[11px]"
                      style={{ backgroundColor: "var(--warning-bg)", color: "#92400e" }}
                    >
                      <span className="material-symbols-outlined text-sm mt-px" style={{ color: "var(--warning)" }}>warning</span>
                      <span>
                        <strong>{generateState.note.failedOps.length} edit{generateState.note.failedOps.length > 1 ? "s" : ""}</strong> could not be matched to lines in your prior note and may be missing.
                        Review the diff carefully.
                      </span>
                    </div>
                  )}

                  {/* Generated note content — inline diff view */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <LineDiffView
                      before={generateState.priorText}
                      after={generateState.note.rawText ?? ""}
                      onAccept={(text) => handleCopy(text)}
                      copied={copied}
                    />
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {/* Mobile bottom action bar */}
        <div
          className="md:hidden fixed left-0 right-0 bottom-0 px-4 py-3 flex gap-3"
          style={{
            backgroundColor: "white",
            borderTop: "1px solid rgba(191,200,204,0.3)",
            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          }}
        >
          {/* Error message */}
          {generateState.status === "error" && (
            <div
              className="absolute left-4 right-4 -top-8 text-[11px] font-medium text-center py-1.5 rounded-lg"
              style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }}
            >
              {generateState.message}
            </div>
          )}

          {mobilePane === "handoff" ? (
            <button
              onClick={handleGenerate}
              disabled={generateState.status === "generating"}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {generateState.status === "generating" ? (
                <>
                  <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                  Generating…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">auto_awesome</span>
                  Generate Progress Note
                </>
              )}
            </button>
          ) : mobilePane === "note" && generateState.status === "done" ? (
            <button
              onClick={() => { void handleCopy(); }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
              {copied ? "Copied!" : "Copy to EHR"}
            </button>
          ) : null}
        </div>
      </main>
  );

  if (embedded) return outerContent;

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--color-surface)" }}>
      <AppSidebar />
      {outerContent}
    </div>
  );
}

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = (params?.id as string) ?? "unknown";
  return <PatientWorkspace patientId={patientId} />;
}
