"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { garyBaileyNote, IcdCode } from "@/lib/data";
import { useAudioRecorder, formatDuration } from "@/lib/useAudioRecorder";
import type { StructuredNote } from "@/lib/medgemma";

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
  const { patient, yesterday, today, icdCodes } = garyBaileyNote;
  const editorRef = useRef<HTMLDivElement>(null);

  const [transcribeState, setTranscribeState] = useState<TranscribeState>({ status: "idle" });

  const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(new Set());
  const [mobilePane, setMobilePane] = useState<"note" | "prior">("note");
  const [showNotifications, setShowNotifications] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previousNote, setPreviousNote] = useState<string>(() =>
    [
      `Date: ${yesterday.date}`,
      `Patient: ${patient.name}`,
      "",
      "SUBJECTIVE",
      yesterday.subjective,
      "",
      "ASSESSMENT & PLAN",
      ...yesterday.problems.flatMap((p) => [`#${p.label}`, p.text, ""]),
      "SOCIAL",
      yesterday.social,
    ].join("\n")
  );

  const recorder = useAudioRecorder();

  const handleTranscribe = async () => {
    if (!recorder.audioBlob) return;

    setTranscribeState({ status: "uploading" });
    const form = new FormData();
    form.append("audio", recorder.audioBlob, "recording.webm");
    form.append("patientId", patientId);
    form.append("previousNote", previousNote);
    if (recorder.transcript) form.append("transcript", recorder.transcript);

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

    // Replace the editor content with the full updated note
    const editor = editorRef.current;
    if (editor && result.note.rawText) {
      editor.innerText = result.note.rawText;
    }
  };

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
    setAcceptedChanges(new Set(today.changes.map((c) => c.id)));
  };

  const execFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
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
                {patient.name}
              </h1>
              <p className="text-xs truncate" style={{ color: "var(--color-on-surface-variant)" }}>
                {yesterday.date} · Room {patient.room}
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
                {patient.name} • Room {patient.room}
              </h1>
              <span
                className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase rounded"
                style={{
                  backgroundColor: "var(--color-surface-container-highest)",
                  color: "var(--color-on-surface-variant)",
                }}
              >
                {patient.age} Y.O. {patient.sex}
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
                  onClick={() => setPreviousNote("")}
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
                  onClick={() => setPreviousNote("")}
                  className="text-xs"
                  style={{ color: "var(--color-outline)" }}
                >
                  Clear
                </button>
              </div>
              {previousNote === "" ? (
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-3">
                  <span className="material-symbols-outlined text-4xl" style={{ color: "var(--color-outline)" }}>content_paste</span>
                  <p className="text-xs text-center leading-relaxed" style={{ color: "var(--color-on-surface-variant)" }}>
                    Paste the patient&apos;s prior note from Epic or Cerner here.
                    <br />RoundScribe will use it as context when generating the updated note.
                  </p>
                  <textarea
                    className="w-full mt-2 p-3 rounded-lg text-xs resize-none focus:outline-none"
                    style={{
                      fontFamily: "var(--font-body)",
                      border: "1px solid rgba(191,200,204,0.5)",
                      backgroundColor: "white",
                      color: "var(--color-on-surface)",
                      minHeight: "160px",
                    }}
                    placeholder="Paste prior note here…"
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (text) {
                        e.preventDefault();
                        setPreviousNote(text);
                      }
                    }}
                    onChange={(e) => setPreviousNote(e.target.value)}
                  />
                </div>
              ) : (
                <textarea
                  className="flex-1 px-5 py-5 md:p-6 text-sm md:text-xs leading-relaxed resize-none focus:outline-none"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: "rgba(63,72,76,0.8)",
                    backgroundColor: "transparent",
                  }}
                  value={previousNote}
                  onChange={(e) => setPreviousNote(e.target.value)}
                  placeholder="Paste prior note from EHR…"
                />
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
                        {/* Pulsing red dot */}
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                        </span>
                        <span className="text-[11px] font-bold text-red-600 tracking-wide">Recording</span>
                        <span
                          className="text-[11px] font-mono font-bold"
                          style={{ color: "var(--color-on-surface-variant)" }}
                        >
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
                        <span className="material-symbols-outlined text-sm" style={{ color: "var(--color-primary)" }}>
                          check_circle
                        </span>
                        <span className="text-[11px] font-bold" style={{ color: "var(--color-primary)" }}>
                          Recording saved — {formatDuration(recorder.duration)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <audio
                          src={recorder.audioUrl ?? undefined}
                          controls
                          className="h-7"
                          style={{ minWidth: "160px" }}
                        />
                        <button
                          onClick={handleTranscribe}
                          disabled={
                            transcribeState.status === "uploading" ||
                            transcribeState.status === "transcribing" ||
                            transcribeState.status === "analyzing"
                          }
                          className="flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                          style={{ backgroundColor: "var(--color-primary)" }}
                          title="Transcribe & analyze with MedASR + MedGemma"
                        >
                          <span className="material-symbols-outlined text-sm">auto_awesome</span>
                          {transcribeState.status === "uploading"
                            ? "Uploading…"
                            : transcribeState.status === "transcribing"
                              ? "Transcribing…"
                              : transcribeState.status === "analyzing"
                                ? "Analyzing…"
                                : "Transcribe & Analyze"}
                        </button>
                        <button
                          onClick={() => {
                            recorder.clear();
                            setTranscribeState({ status: "idle" });
                          }}
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
                  Note generated and inserted into editor.
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
                {/* Editor toolbar — desktop only */}
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
                    {/* Patient metadata block (matches OpenEvidence style) */}
                    <div className="mb-6 text-sm leading-7" style={{ color: "var(--color-on-surface-variant)" }}>
                      <p>Date &amp; Time: {yesterday.date}</p>
                      <p>Patient: {patient.name}</p>
                      <p>Room: {patient.room} · MRN: {patient.mrn}</p>
                      <p>DOB: {patient.dob} · {patient.age} Y.O. {patient.sex}</p>
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
                  </div>
                </div>
              </div>

              {/* Diff legend footer — desktop only */}
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
