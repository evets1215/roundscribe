"use client";

import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";

const SECTIONS = [
  {
    title: "Transcription",
    items: [
      { label: "Auto-transcribe after recording", description: "Immediately send to MedASR when recording stops", defaultOn: false },
      { label: "Speaker diarization", description: "Label speakers in transcript (requires diarizer endpoint)", defaultOn: false },
    ],
  },
  {
    title: "Editor",
    items: [
      { label: "Auto-accept all changes", description: "Accept AI suggestions without review", defaultOn: false },
      { label: "Show ICD-10 panel by default", description: "Open the ICD-10 sidebar on every patient", defaultOn: true },
    ],
  },
  {
    title: "Notifications",
    items: [
      { label: "Rounding reminders", description: "Receive reminders for patients not yet rounded", defaultOn: true },
    ],
  },
];

export default function SettingsPage() {
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    SECTIONS.forEach((s) => s.items.forEach((item) => { initial[item.label] = item.defaultOn; }));
    return initial;
  });

  const toggle = (label: string) =>
    setToggles((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <AppSidebar />
      <main className="md:ml-64 flex-1 flex flex-col min-h-screen">
        <header
          className="sticky top-0 z-30 flex items-center px-6 py-3 h-16 border-b"
          style={{
            backgroundColor: "var(--color-surface-container-lowest)",
            borderColor: "var(--color-surface-container-high)",
          }}
        >
          <div className="md:hidden font-bold text-xl uppercase tracking-wider" style={{ fontFamily: "var(--font-headline)", color: "var(--color-primary)" }}>
            Roundscribe
          </div>
        </header>

        <div className="px-6 py-8 max-w-2xl mx-auto w-full">
          <h1
            className="text-2xl font-extrabold tracking-tight mb-6"
            style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
          >
            Settings
          </h1>

          <div className="flex flex-col gap-8">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h2
                  className="text-[11px] font-bold uppercase tracking-widest mb-3"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  {section.title}
                </h2>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: "var(--color-surface-container-lowest)",
                    border: "1px solid var(--color-outline-variant)",
                  }}
                >
                  {section.items.map((item, i) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between px-5 py-4 gap-4"
                      style={i < section.items.length - 1 ? { borderBottom: "1px solid var(--color-outline-variant)" } : {}}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>
                          {item.label}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
                          {item.description}
                        </p>
                      </div>
                      <button
                        role="switch"
                        aria-checked={toggles[item.label]}
                        onClick={() => toggle(item.label)}
                        className="shrink-0 w-11 h-6 rounded-full transition-colors relative"
                        style={{
                          backgroundColor: toggles[item.label] ? "var(--color-primary)" : "var(--color-surface-container-highest)",
                        }}
                      >
                        <span
                          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
                          style={{ left: toggles[item.label] ? "calc(100% - 20px)" : "4px" }}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Account section */}
            <div>
              <h2
                className="text-[11px] font-bold uppercase tracking-widest mb-3"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                Account
              </h2>
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "var(--color-surface-container-lowest)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              >
                <div className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}
                  >
                    DM
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "var(--color-on-surface)" }}>Dr. Miller</p>
                    <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Internal Medicine · MD-7823</p>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                    General Hospital — Ward 4
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
