"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { garyBaileyNote, IcdCode, type Patient } from "@/lib/data";
import { extractRawNoteText } from "@/lib/patient-records";
import { useAudioRecorder, formatDuration } from "@/lib/useAudioRecorder";
import type { StructuredNote } from "@/lib/medgemma";
import DiffNoteView from "@/components/DiffNoteView";

type TranscribeState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "transcribing" }
  | { status: "analyzing" }
  | { status: "done"; noteId: string; transcript: string; note: StructuredNote }
  | { status: "error"; message: string };

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = (params?.id as string) ?? "unknown";

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

  const [transcribeState, setTranscribeState] = useState<TranscribeState>({ status: "idle" });
  const [editableTranscript, setEditableTranscript] = useState<string>("");

  const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(new Set());
  const [mobilePane, setMobilePane] = useState<"note" | "prior">("note");
  const [showNotifications, setShowNotifications] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const recorder = useAudioRecorder();

  const handleTranscribe = async () => {
    if (!recorder.audioBlob) return;

    setTranscribeState({ status: "uploading" });
    const form = new FormData();
    form.append("audio", recorder.audioBlob, "recording.webm");
    form.append("patientId", patientId);
    form.append("previousNote", priorEditorRef.current?.innerText ?? previousNote);
    if (editableTranscript) form.append("transcript", editableTranscript);

    let result: { noteId: string; transcript: string; note: StructuredNote };
    try {
      setTranscribeState({ status: "transcribing" });
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error ?? response.statusText);
      }
      setTranscribeState({ status: "analyzing" });
      result = await response.json();
    } catch (err) {
      setTranscribeState({ status: "error", message: (err as Error).message });
      return;
    }

    setTranscribeState({ status: "done", ...result });

    // Auto-advance: update prior editor with the newly generated note so the next
    // dictation session uses the freshest note as context (all formats, not just non-diff).
    const advancedText = extractRawNoteText(result.note);
    if (advancedText && priorEditorRef.current) {
      isAutoLoading.current = true;
      priorEditorRef.current.innerText = advancedText;
      isAutoLoading.current = false;
    }

    // Only update the plain editor for non-diff formats (diff view manages its own display)
    if (result.note.format !== "problem-diff") {
      const editor = editorRef.current;
      if (editor && result.note.rawText) {
        editor.innerText = result.note.rawText;
      }
    }
  };

  // When recording stops, copy the captured transcript into the editable field
  useEffect(() => {
    if (!recorder.isRecording && recorder.transcript) {
      setEditableTranscript(recorder.transcript);
    }
  }, [recorder.isRecording, recorder.transcript]);

  // Auto-start recording if navigated with ?record=1
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("record") === "1") {
        recorder.start();
        // Clean the query param from the URL without a page reload
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAccept = (id: string) => {
    setAcceptedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const acceptAll = () => {
    if (!isNewPatient) setAcceptedChanges(new Set(today.changes.map((c) => c.id)));
  };

  const priorEditorRef = useRef<HTMLDivElement>(null);
  // Prevents blur/visibilitychange handlers from saving when we programmatically
  // set innerText (auto-load on mount, auto-advance after generation).
  const isAutoLoading = useRef(false);
  const [priorSaveError, setPriorSaveError] = useState(false);

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

  const execFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  const handleLink = () => {
    const url = prompt("Enter URL:");
    if (url) execFormat("createLink", url);
  };

  const handleCopy = async () => {
    const text = editorRef.current?.innerText ?? "";
    await navigator.clipboard.writeText(text);
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


  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--color-surface)" }}>
      <AppSidebar />

      <main className="md:ml-64 flex-1 flex flex-col min-w-0" style={{ backgroundColor: "var(--color-surface)" }}>
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
          <div className="md:hidden px-4 pb-3">
            <div className="flex rounded-xl p-1" style={{ backgroundColor: "#f1f3f4" }}>
              {[
                { key: "note", label: "Updated Note" },
                { key: "prior", label: "Prior Note" },
              ].map((t) => {
                const active = mobilePane === (t.key as "note" | "prior");
                return (
                  <button
                    key={t.key}
                    onClick={() => setMobilePane(t.key as "note" | "prior")}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={
                      active
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
            className="flex flex-col h-full gap-0 md:gap-4 md:grid"
            style={{
              gridTemplateColumns: "5fr 7fr",
            }}
          >
            {/* Column 1: Prior Note (paste area) */}
            <div
              className={`${mobilePane === "prior" ? "flex" : "hidden"} md:flex flex-col flex-1 md:rounded-xl overflow-hidden md:shadow-sm`}
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
              <div
                ref={priorEditorRef}
                className="prior-editor flex-1 px-5 py-5 md:p-6 text-sm md:text-xs leading-relaxed overflow-y-auto focus:outline-none"
                style={{ fontFamily: "var(--font-body)", color: "rgba(63,72,76,0.8)", backgroundColor: "transparent" }}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Paste yesterday's note here to get started"
              />
              {priorSaveError && (
                <p className="px-5 pb-2 text-xs text-red-600">Couldn&apos;t save — check connection</p>
              )}
            </div>

            {/* Column 2: Updated Note (Generated / Editor) */}
            <div
              className={`${mobilePane === "note" ? "flex" : "hidden"} md:flex flex-col flex-1 md:rounded-xl overflow-hidden md:shadow-md relative`}
              style={{
                backgroundColor: "white",
                border: "none",
                outline: recorder.isRecording ? "1px solid rgba(220,38,38,0.4)" : undefined,
                transition: "outline-color 0.3s",
              }}
            >
              {/* Action bar */}
              <div
                className="px-5 py-3 md:px-6 md:py-4 bg-white flex items-center justify-between shrink-0"
                style={{ borderBottom: "1px solid rgba(191,200,204,0.2)" }}
              >
                {/* Mobile: "Note" heading */}
                <span className="md:hidden font-bold text-base" style={{ color: "var(--color-on-surface)" }}>Note</span>
                {/* Desktop: label + draft info */}
                <div className="hidden md:flex items-center gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                    Updated Note (Today&apos;s Rounds)
                  </span>
                  <div className="flex items-center gap-1" style={{ color: "#94a3b8" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>info</span>
                    <span className="text-[9px] font-semibold italic">Draft saved 1m ago</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={acceptAll}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-md transition-all hover:bg-slate-50"
                    style={{ color: "var(--color-primary)" }}
                    title="Accept all changes"
                  >
                    <span className="material-symbols-outlined text-base">task_alt</span>
                    <span className="hidden md:inline text-[10px] font-bold">Accept All</span>
                  </button>
                  {/* Mobile: Edit button (pencil + text like OpenEvidence) */}
                  <button
                    onClick={() => editorRef.current?.focus()}
                    className="md:hidden flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      border: "1px solid rgba(191,200,204,0.5)",
                      color: "var(--color-on-surface)",
                      backgroundColor: "white",
                    }}
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Edit
                  </button>
                  {/* Desktop: Copy to EHR */}
                  <button
                    onClick={handleCopy}
                    className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-md transition-all text-slate-600 hover:bg-slate-100"
                    title={copied ? "Copied!" : "Copy note to clipboard"}
                  >
                    <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
                    <span className="text-[10px] font-bold">{copied ? "Copied!" : "Copy to EHR"}</span>
                  </button>
                </div>
              </div>

              {/* Recording banner — desktop only (mobile uses bottom bar) */}
              {(recorder.isRecording || recorder.audioUrl) && (
                <div
                  className="hidden md:flex px-6 py-3 items-center justify-between shrink-0"
                  style={{
                    backgroundColor: recorder.isRecording ? "rgba(220,38,38,0.06)" : "rgba(0,95,115,0.06)",
                    borderBottom: "1px solid rgba(191,200,204,0.2)",
                  }}
                >
                  {recorder.isRecording ? (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                        </span>
                        <span className="text-[11px] font-bold text-red-600 tracking-wide">Recording</span>
                        <span className="text-[11px] font-mono font-bold" style={{ color: "var(--color-on-surface-variant)" }}>
                          {formatDuration(recorder.duration)}
                        </span>
                      </div>
                      <button
                        onClick={recorder.stop}
                        className="flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold text-white transition-all active:scale-95"
                        style={{ backgroundColor: "#dc2626" }}
                      >
                        <span className="material-symbols-outlined text-sm">stop</span>
                        Stop
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-sm" style={{ color: "var(--color-primary)" }}>check_circle</span>
                        <span className="text-[11px] font-bold" style={{ color: "var(--color-primary)" }}>
                          Recording saved — {formatDuration(recorder.duration)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleTranscribe}
                          disabled={
                            transcribeState.status === "uploading" ||
                            transcribeState.status === "transcribing" ||
                            transcribeState.status === "analyzing"
                          }
                          className="flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                          style={{ backgroundColor: "var(--color-primary)" }}
                        >
                          <span className="material-symbols-outlined text-sm">auto_awesome</span>
                          {transcribeState.status === "uploading"
                            ? "Uploading…"
                            : transcribeState.status === "transcribing"
                              ? "Transcribing…"
                              : transcribeState.status === "analyzing"
                                ? "Analyzing…"
                                : "Analyze"}
                        </button>
                        <button
                          onClick={() => { recorder.clear(); setEditableTranscript(""); setTranscribeState({ status: "idle" }); }}
                          className="p-1 rounded hover:bg-slate-100 transition-colors"
                          title="Discard recording"
                          style={{ color: "var(--color-on-surface-variant)" }}
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Live transcript preview — while recording */}
              {recorder.isRecording && (
                <div
                  className="hidden md:block px-6 py-3 shrink-0"
                  style={{ borderBottom: "1px solid rgba(191,200,204,0.2)", backgroundColor: "rgba(220,38,38,0.03)" }}
                >
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#dc2626" }}>
                    Live Transcript
                  </p>
                  <p className="text-[12px] leading-relaxed min-h-[1.5rem]" style={{ color: "var(--color-on-surface-variant)", fontFamily: "var(--font-body)" }}>
                    {recorder.liveTranscript || <span className="italic opacity-40">Listening…</span>}
                  </p>
                </div>
              )}

              {/* Editable transcript review — after recording stops, before Analyze */}
              {!recorder.isRecording && recorder.audioUrl && transcribeState.status === "idle" && (
                <div
                  className="hidden md:block px-6 py-4 shrink-0"
                  style={{ borderBottom: "1px solid rgba(191,200,204,0.2)", backgroundColor: "#fafaf8" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface-variant)" }}>
                      Transcript — Review &amp; Edit Before Analyzing
                    </p>
                    {editableTranscript && (
                      <button
                        onClick={() => setEditableTranscript("")}
                        className="text-[9px] font-medium hover:underline"
                        style={{ color: "var(--color-outline)" }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    placeholder="No transcript captured — you can type or paste the rounding discussion here before analyzing."
                    rows={4}
                    className="w-full resize-none rounded-md px-3 py-2 text-[12px] leading-relaxed focus:outline-none"
                    style={{
                      border: "1px solid rgba(191,200,204,0.5)",
                      backgroundColor: "white",
                      color: "var(--color-on-surface)",
                      fontFamily: "var(--font-body)",
                    }}
                  />
                </div>
              )}

              {/* Transcription result banner — desktop only */}
              {transcribeState.status === "done" && (
                <div
                  className="hidden md:flex px-6 py-2 items-center gap-2 text-[11px] font-medium shrink-0"
                  style={{
                    backgroundColor: "rgba(0,95,115,0.06)",
                    color: "var(--color-primary)",
                    borderBottom: "1px solid rgba(0,95,115,0.15)",
                  }}
                >
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  {transcribeState.note.format === "problem-diff"
                    ? "Changes ready to review — accept or decline each update below."
                    : "Note generated and inserted into editor."}
                  <span className="ml-auto font-mono opacity-60 text-[9px]">
                    id:{transcribeState.noteId.slice(0, 8)}
                  </span>
                </div>
              )}

              {/* Transcription error banner — desktop only (mobile error shown in bottom bar) */}
              {transcribeState.status === "error" && (
                <div
                  className="hidden md:flex px-6 py-2 items-center gap-2 text-[11px] font-medium shrink-0"
                  style={{
                    backgroundColor: "rgba(220,38,38,0.06)",
                    color: "#dc2626",
                    borderBottom: "1px solid rgba(220,38,38,0.2)",
                  }}
                >
                  <span className="material-symbols-outlined text-sm">error</span>
                  {transcribeState.message}
                  <button
                    onClick={() => setTranscribeState({ status: "idle" })}
                    className="ml-auto text-[9px] underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Microphone error banner — desktop only */}
              {recorder.error && (
                <div
                  className="hidden md:flex px-6 py-2 items-center gap-2 text-[11px] font-medium shrink-0"
                  style={{ backgroundColor: "rgba(220,38,38,0.06)", color: "#dc2626", borderBottom: "1px solid rgba(220,38,38,0.2)" }}
                >
                  <span className="material-symbols-outlined text-sm">error</span>
                  {recorder.error}
                </div>
              )}

              {/* Document container */}
              <div className="flex-1 p-0 md:p-6 overflow-hidden flex flex-col">
                {/* Diff view — shown when Claude returns structured changes */}
                {transcribeState.status === "done" && transcribeState.note.format === "problem-diff" && (
                  <div className="flex-1 overflow-hidden flex flex-col md:bg-white md:rounded-lg md:shadow-sm">
                    <DiffNoteView
                      note={transcribeState.note}
                      onCopy={async (text) => {
                        await navigator.clipboard.writeText(text);
                        setPreviousNote(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    />
                  </div>
                )}

                {/* Editor toolbar + content — hidden when showing diff view */}
                {!(transcribeState.status === "done" && transcribeState.note.format === "problem-diff") && (<>
                <div
                  className="hidden md:flex items-center gap-1 px-4 py-2 bg-white rounded-t-lg"
                  style={{ border: "1px solid rgba(191,200,204,0.3)", borderBottom: "none" }}
                >
                  {[
                    { icon: "undo", title: "Undo", cmd: "undo" },
                    { icon: "redo", title: "Redo", cmd: "redo" },
                  ].map(({ icon, title, cmd }) => (
                    <button
                      key={icon}
                      title={title}
                      onClick={() => execFormat(cmd)}
                      className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">{icon}</span>
                    </button>
                  ))}
                  <div className="h-4 w-px bg-slate-200 mx-1" />
                  {[
                    { icon: "format_bold", title: "Bold", cmd: "bold" },
                    { icon: "format_italic", title: "Italic", cmd: "italic" },
                    { icon: "format_underlined", title: "Underline", cmd: "underline" },
                  ].map(({ icon, title, cmd }) => (
                    <button
                      key={icon}
                      title={title}
                      onClick={() => execFormat(cmd)}
                      className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">{icon}</span>
                    </button>
                  ))}
                  <div className="h-4 w-px bg-slate-200 mx-1" />
                  {[
                    { icon: "format_list_bulleted", title: "Bulleted List", cmd: "insertUnorderedList" },
                    { icon: "format_list_numbered", title: "Numbered List", cmd: "insertOrderedList" },
                  ].map(({ icon, title, cmd }) => (
                    <button
                      key={icon}
                      title={title}
                      onClick={() => execFormat(cmd)}
                      className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">{icon}</span>
                    </button>
                  ))}
                  <div className="h-4 w-px bg-slate-200 mx-1" />
                  <button
                    title="Insert Link"
                    onClick={handleLink}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">link</span>
                  </button>
                  <div className="ml-auto text-[10px] font-medium text-slate-400 px-2">Arial · 11pt</div>
                </div>

                {/* Editable content area */}
                <div
                  className="flex-1 md:bg-white md:rounded-b-lg md:shadow-sm overflow-hidden flex flex-col"
                  style={{ border: "none", borderTop: undefined }}
                >
                  <div
                    ref={editorRef}
                    className="px-5 py-5 md:p-8 text-sm md:text-sm leading-relaxed overflow-y-auto flex-1"
                    style={{ fontFamily: "var(--font-body)", color: "var(--color-on-surface)", outline: "none" }}
                    contentEditable
                    suppressContentEditableWarning
                  >
                    {isNewPatient ? (
                      /* New patient — no note yet */
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center px-4" contentEditable={false}>
                        <span className="material-symbols-outlined mb-4" style={{ fontSize: "48px", color: "var(--color-outline)" }}>mic_none</span>
                        <p className="text-base font-semibold mb-1" style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}>
                          No note yet
                        </p>
                        <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                          Record today&apos;s rounding discussion to generate the first note for {displayName}.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Patient metadata block (matches OpenEvidence style) */}
                        <div className="mb-6 text-sm leading-7" style={{ color: "var(--color-on-surface-variant)" }}>
                          <p>Date &amp; Time: {yesterday.date}</p>
                          <p>Patient: {displayName}</p>
                          <p>Room: {displayRoom} · MRN: {displayMrn}</p>
                          <p>DOB: {displayDob}{displayAge ? ` · ${displayAge} Y.O. ${displaySex}` : ""}</p>
                          <p>Author / Clinician: D. Miller, MD</p>
                        </div>
                        <div className="mb-6">
                          <h4 className="font-bold text-black mb-2">Subjective</h4>
                          <p>{today.subjective}</p>
                        </div>
                        <h4 className="font-bold text-black mb-3">Assessment &amp; Plan</h4>
                        {today.changes.map((change) => {
                          const accepted = acceptedChanges.has(change.id);
                          return (
                            <div key={change.id} className="mb-6 group relative">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <span className="font-bold block mb-1">#{change.label}:</span>
                                  {change.prefix}
                                  {accepted ? (
                                    <span className="diff-addition">{change.addition}</span>
                                  ) : (
                                    <>
                                      <span className="diff-deletion">{change.deletion}</span>
                                      <span className="diff-addition">{change.addition}</span>
                                    </>
                                  )}
                                  {change.suffix}
                                </div>
                                <button
                                  onClick={() => toggleAccept(change.id)}
                                  contentEditable={false}
                                  className="accept-btn p-1.5 rounded-full ml-4 shrink-0 transition-colors"
                                  style={{ color: "var(--color-tertiary-container)" }}
                                  title={accepted ? "Undo" : "Accept this change"}
                                >
                                  <span className="material-symbols-outlined text-xl font-bold">
                                    {accepted ? "undo" : "check"}
                                  </span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <div className="mt-8">
                          <h4 className="font-bold text-black mb-2">Social</h4>
                          <p>{today.social}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                </>)}
              </div>

              {/* Diff legend footer — desktop only (hidden when showing diff view) */}
              {!(transcribeState.status === "done" && transcribeState.note.format === "problem-diff") && (
              <div
                className="hidden md:flex px-6 py-3 bg-white gap-4 shrink-0"
                style={{ borderTop: "1px solid rgba(191,200,204,0.2)" }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-green-100 border border-green-200 rounded-sm" />
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--color-on-surface-variant)" }}>
                    Added
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm relative overflow-hidden flex items-center justify-center">
                    <div className="w-full h-px bg-red-400" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--color-on-surface-variant)" }}>
                    Deleted
                  </span>
                </div>
              </div>
              )}

              {/* Desktop-only floating mic FAB */}
              <button
                onClick={recorder.toggle}
                className="hidden md:flex absolute bottom-20 right-8 w-14 h-14 text-white rounded-full shadow-lg items-center justify-center transition-all active:scale-95 z-20"
                style={{
                  backgroundColor: recorder.isRecording ? "#dc2626" : "#005F73",
                  boxShadow: recorder.isRecording
                    ? "0 0 0 6px rgba(220,38,38,0.2), 0 4px 12px rgba(220,38,38,0.3)"
                    : undefined,
                }}
                title={recorder.isRecording ? "Stop recording" : "Start voice edit"}
              >
                <span
                  className="material-symbols-outlined text-2xl"
                  style={recorder.isRecording ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {recorder.isRecording ? "stop_circle" : "mic"}
                </span>
              </button>
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
          {/* Primary CTA: Record → Stop → Transcribe → based on state */}
          {recorder.isRecording ? (
            <button
              onClick={recorder.stop}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white"
              style={{ backgroundColor: "#dc2626" }}
            >
              <span className="material-symbols-outlined text-base">stop</span>
              Stop · {formatDuration(recorder.duration)}
            </button>
          ) : recorder.audioBlob ? (
            <button
              onClick={handleTranscribe}
              disabled={transcribeState.status === "uploading" || transcribeState.status === "transcribing" || transcribeState.status === "analyzing"}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              {transcribeState.status === "uploading"
                ? "Uploading…"
                : transcribeState.status === "transcribing"
                  ? "Transcribing…"
                  : transcribeState.status === "analyzing"
                    ? "Analyzing…"
                    : "Transcribe →"}
            </button>
          ) : (
            <button
              onClick={recorder.start}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              <span className="material-symbols-outlined text-base">mic</span>
              Record →
            </button>
          )}

          {/* Secondary: Copy note */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-semibold transition-all"
            style={{ backgroundColor: "#f1f3f4", color: "var(--color-on-surface)" }}
          >
            <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
            {copied ? "Copied" : "Copy note"}
          </button>

          {/* Error message */}
          {transcribeState.status === "error" && (
            <div
              className="absolute left-4 right-4 -top-8 text-[11px] font-medium text-center py-1.5 rounded-lg"
              style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }}
            >
              {transcribeState.message}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
