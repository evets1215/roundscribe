"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { garyBaileyNote, IcdCode } from "@/lib/data";
import { useAudioRecorder, formatDuration } from "@/lib/useAudioRecorder";

export default function PatientDetailPage() {
  const router = useRouter();
  const { patient, yesterday, today, icdCodes } = garyBaileyNote;
  const editorRef = useRef<HTMLDivElement>(null);

  const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(new Set());
  const [showIcd, setShowIcd] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [copied, setCopied] = useState(false);

  const recorder = useAudioRecorder();

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
      next.has(id) ? next.delete(id) : next.add(id);
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
          className="flex justify-between items-center w-full px-8 py-4 sticky top-0 z-10 shrink-0"
          style={{
            backgroundColor: "var(--color-surface)",
            borderBottom: "1px solid rgba(191,200,204,0.3)",
          }}
        >
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
              style={{
                fontFamily: "var(--font-headline)",
                color: "var(--color-primary)",
              }}
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
              className="hidden md:flex rounded-full px-4 py-2 items-center gap-2"
              style={{
                backgroundColor: "var(--color-surface-container-low)",
                border: "1px solid rgba(191,200,204,0.3)",
              }}
            >
              <span className="material-symbols-outlined" style={{ color: "var(--color-outline)" }}>
                search
              </span>
              <input
                className="bg-transparent border-none focus:outline-none text-sm w-48"
                style={{ fontFamily: "var(--font-body)" }}
                placeholder="Search clinical data..."
                type="text"
              />
            </div>
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications((v) => !v)}
                  className="p-2 rounded-full transition-colors hover:bg-slate-50"
                  style={{ color: showNotifications ? "var(--color-primary)" : "var(--color-on-surface-variant)" }}
                  title="Notifications"
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

              {/* Settings */}
              <button
                onClick={() => router.push("/settings")}
                className="p-2 rounded-full transition-colors hover:bg-slate-50"
                style={{ color: "var(--color-on-surface-variant)" }}
                title="Settings"
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
        </header>

        {/* Content canvas */}
        <div className="flex-1 overflow-hidden px-8 py-6">
          <div
            className="grid h-full gap-4"
            style={{
              gridTemplateColumns: showIcd ? "3fr 6fr 3fr" : "3fr 9fr",
            }}
          >
            {/* Column 1: Yesterday's Note */}
            <div
              className="flex flex-col rounded-xl overflow-hidden shadow-sm"
              style={{
                backgroundColor: "var(--color-surface-container-low)",
                border: "1px solid rgba(191,200,204,0.3)",
              }}
            >
              <div
                className="px-5 py-4 flex items-center justify-between shrink-0"
                style={{
                  backgroundColor: "rgba(231,232,233,0.6)",
                  borderBottom: "1px solid rgba(191,200,204,0.2)",
                }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Yesterday&apos;s Note
                </span>
                <span className="text-[10px] font-medium" style={{ color: "var(--color-outline)" }}>
                  {yesterday.date}
                </span>
              </div>
              <div
                className="p-6 text-xs leading-relaxed overflow-y-auto flex-1"
                style={{ fontFamily: "var(--font-body)", color: "rgba(63,72,76,0.8)" }}
              >
                <h4 className="font-bold mb-2" style={{ color: "var(--color-on-surface)" }}># Subjective:</h4>
                <p className="mb-4">{yesterday.subjective}</p>
                <h4 className="font-bold mt-6 mb-2" style={{ color: "var(--color-on-surface)" }}># Assessment &amp; Plan:</h4>
                {yesterday.problems.map((p) => (
                  <div key={p.label} className="mb-4">
                    <span className="font-semibold block" style={{ color: "var(--color-on-surface)" }}>#{p.label}:</span>{" "}
                    {p.text}
                  </div>
                ))}
                <h4 className="font-bold mt-6 mb-2" style={{ color: "var(--color-on-surface)" }}>#Social:</h4>
                <p>{yesterday.social}</p>
              </div>
            </div>

            {/* Column 2: Updated Note (Embedded Editor) */}
            <div
              className="flex flex-col rounded-xl overflow-hidden shadow-md relative"
              style={{
                backgroundColor: "rgba(248,250,252,0.5)",
                border: recorder.isRecording
                  ? "1px solid rgba(220,38,38,0.4)"
                  : "1px solid rgba(191,200,204,0.3)",
                transition: "border-color 0.3s",
              }}
            >
              {/* Action bar */}
              <div
                className="px-6 py-4 bg-white flex items-center justify-between shrink-0"
                style={{ borderBottom: "1px solid rgba(191,200,204,0.2)" }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                    Updated Note (Today&apos;s Rounds)
                  </span>
                  <div className="flex items-center gap-1" style={{ color: "#94a3b8" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>info</span>
                    <span className="text-[9px] font-semibold italic">Draft saved 1m ago</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 pr-3 mr-1" style={{ borderRight: "1px solid rgba(191,200,204,0.3)" }}>
                    <button
                      onClick={acceptAll}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md transition-all text-[10px] font-bold hover:bg-slate-50"
                      style={{ color: "var(--color-primary)" }}
                    >
                      <span className="material-symbols-outlined text-base">task_alt</span>
                      Accept All
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md transition-all text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                      title="Copy note to clipboard"
                    >
                      <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowIcd((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-md text-[10px] font-bold transition-all hover:bg-slate-50"
                    style={{ border: "1px solid rgba(0,70,85,0.3)", color: "var(--color-primary)" }}
                  >
                    <span className="material-symbols-outlined text-base">{showIcd ? "label_off" : "label"}</span>
                    ICD-10
                  </button>
                </div>
              </div>

              {/* Recording banner */}
              {(recorder.isRecording || recorder.audioUrl) && (
                <div
                  className="px-6 py-3 flex items-center justify-between shrink-0"
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
                          onClick={recorder.clear}
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

              {/* Error banner */}
              {recorder.error && (
                <div
                  className="px-6 py-2 flex items-center gap-2 text-[11px] font-medium shrink-0"
                  style={{ backgroundColor: "rgba(220,38,38,0.06)", color: "#dc2626", borderBottom: "1px solid rgba(220,38,38,0.2)" }}
                >
                  <span className="material-symbols-outlined text-sm">error</span>
                  {recorder.error}
                </div>
              )}

              {/* Document container */}
              <div className="flex-1 p-6 overflow-hidden flex flex-col">
                {/* Editor toolbar */}
                <div
                  className="flex items-center gap-1 px-4 py-2 bg-white rounded-t-lg"
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
                  className="flex-1 bg-white rounded-b-lg shadow-sm overflow-hidden flex flex-col"
                  style={{ border: "1px solid rgba(191,200,204,0.3)" }}
                >
                  <div
                    ref={editorRef}
                    className="p-8 text-sm leading-relaxed overflow-y-auto flex-1"
                    style={{ fontFamily: "var(--font-body)", color: "var(--color-on-surface)", outline: "none" }}
                    contentEditable
                    suppressContentEditableWarning
                  >
                    <div className="mb-6">
                      <h4 className="font-bold text-black mb-2"># Subjective:</h4>
                      <p>{today.subjective}</p>
                    </div>
                    <h4 className="font-bold text-black mb-3"># Assessment &amp; Plan:</h4>
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
                      <h4 className="font-bold text-black mb-2">#Social:</h4>
                      <p>{today.social}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diff legend footer */}
              <div
                className="px-6 py-3 bg-white flex gap-4 shrink-0"
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

              {/* Floating mic FAB */}
              <button
                onClick={recorder.toggle}
                className="absolute bottom-20 right-8 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 z-20"
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

            {/* Column 3: ICD-10 Suggestions */}
            {showIcd && (
              <div
                className="flex flex-col rounded-xl overflow-hidden shadow-sm"
                style={{
                  backgroundColor: "rgba(243,244,245,0.5)",
                  border: "1px solid rgba(191,200,204,0.3)",
                }}
              >
                <div
                  className="px-5 py-4 flex items-center justify-between shrink-0"
                  style={{
                    backgroundColor: "rgba(231,232,233,0.6)",
                    borderBottom: "1px solid rgba(191,200,204,0.2)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm" style={{ color: "var(--color-primary)" }}>label</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-primary)" }}>
                      ICD-10 Suggestions
                    </span>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-bold"
                    style={{
                      backgroundColor: "var(--color-primary-container)",
                      color: "var(--color-on-primary-container)",
                    }}
                  >
                    {icdCodes.length} CODES
                  </span>
                </div>

                <div className="p-5 flex flex-col h-full overflow-hidden">
                  <p className="text-[10px] mb-4 font-medium italic" style={{ color: "var(--color-on-surface-variant)" }}>
                    Suggested based on the problem list:
                  </p>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {icdCodes.map((icd) => (
                      <div
                        key={icd.code}
                        onClick={() => insertIcdCode(icd)}
                        className="p-3 rounded-lg shadow-sm cursor-pointer group transition-colors hover:bg-white"
                        style={{
                          backgroundColor: "var(--color-surface-container-lowest)",
                          border: "1px solid rgba(191,200,204,0.3)",
                        }}
                        title="Click to insert into note"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-[10px] uppercase tracking-wider" style={{ color: "var(--color-primary)" }}>
                            {icd.code}
                          </span>
                          <span
                            className="material-symbols-outlined text-base opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: "var(--color-primary)" }}
                          >
                            add_circle
                          </span>
                        </div>
                        <p className="text-[11px] font-bold leading-tight mb-1" style={{ color: "var(--color-on-surface)" }}>
                          {icd.description}
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--color-on-surface-variant)" }}>
                          Mapped: <span className="font-semibold">{icd.mapped}</span>
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(191,200,204,0.2)" }}>
                    <button
                      onClick={() => alert("ICD-10 full search — coming soon.")}
                      className="w-full py-2 bg-white rounded font-bold text-[10px] transition-all flex items-center justify-center gap-2 hover:bg-slate-50"
                      style={{ border: "1px solid rgba(0,70,85,0.3)", color: "var(--color-primary)" }}
                    >
                      <span className="material-symbols-outlined text-sm">search</span>
                      Search All ICD-10
                    </button>
                    <p className="text-[9px] mt-4 leading-tight" style={{ color: "var(--color-outline)" }}>
                      AI generated. Verify before billing.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
