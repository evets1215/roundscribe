"use client";

import AppSidebar from "@/components/AppSidebar";

export default function RoundingPage() {
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

        <div className="px-6 py-12 max-w-2xl mx-auto w-full flex-1 flex flex-col items-center justify-center text-center">
          <span className="material-symbols-outlined text-5xl mb-4" style={{ color: "var(--color-outline-variant)" }}>
            clinical_notes
          </span>
          <h1
            className="text-2xl font-extrabold tracking-tight mb-2"
            style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
          >
            Rounding
          </h1>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            Structured rounding workflows and checklists will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}
