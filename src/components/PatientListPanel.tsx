"use client";

import { useState, useRef, useEffect } from "react";
import type { Patient } from "@/lib/data";

interface PatientListPanelProps {
  patients: Patient[];
  activePatientId: string | null;
  onSelectPatient: (id: string) => void;
  onAddPatient: () => void;
  onDeletePatient: (id: string) => void;
  onPinPatient: (id: string, pinned: boolean) => void;
}

const STATUS_DOT: Record<string, string> = {
  Pending: "#94a3b8",
  "In Progress": "#d97706",
  Updated: "#16a34a",
};

export default function PatientListPanel({
  patients,
  activePatientId,
  onSelectPatient,
  onAddPatient,
  onDeletePatient,
  onPinPatient,
}: PatientListPanelProps) {
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const filtered = patients.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.room.toLowerCase().includes(q) ||
      p.mrn.includes(q)
    );
  });

  // Pinned patients first
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  return (
    <div
      className="flex flex-col h-full"
      style={{ borderRight: "1px solid var(--color-outline-variant, #e2e8f0)" }}
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-sm font-bold uppercase tracking-widest"
            style={{ color: "var(--color-on-surface-variant)", letterSpacing: "0.08em" }}
          >
            Patients
          </h2>
          <button
            onClick={onAddPatient}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95"
            style={{ color: "var(--color-primary)" }}
            title="Add patient"
          >
            <span className="material-symbols-outlined text-lg">add</span>
          </button>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{
            backgroundColor: "var(--color-surface-container, #f4f4f2)",
            border: "1px solid var(--color-outline-variant, rgba(191,200,204,0.3))",
          }}
        >
          <span className="material-symbols-outlined text-base" style={{ color: "var(--color-on-surface-variant)" }}>
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--color-on-surface)" }}
          />
        </div>
      </div>

      {/* Patient list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {sorted.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: "var(--color-on-surface-variant)" }}>
            {search ? "No patients match" : "No patients yet"}
          </p>
        )}
        {sorted.map((patient) => {
          const isActive = patient.id === activePatientId;
          return (
            <button
              key={patient.id}
              onClick={() => onSelectPatient(patient.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu(contextMenu === patient.id ? null : patient.id);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-left transition-all ${
                isActive ? "shadow-sm" : "hover:bg-slate-50"
              }`}
              style={{
                backgroundColor: isActive ? "var(--color-surface, #fff)" : "transparent",
                border: isActive ? "1px solid var(--color-outline-variant, #e2e8f0)" : "1px solid transparent",
              }}
            >
              {/* Room number */}
              <span
                className="text-[11px] font-bold w-8 text-center shrink-0"
                style={{
                  color: isActive ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {patient.room}
              </span>

              {/* Name + MRN */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {patient.pinned && (
                    <span className="material-symbols-outlined text-xs" style={{ color: "var(--color-primary)", fontSize: "10px" }}>
                      push_pin
                    </span>
                  )}
                  <span
                    className="text-sm font-medium truncate"
                    style={{
                      fontFamily: "var(--font-headline)",
                      color: isActive ? "var(--color-primary)" : "var(--color-on-surface)",
                    }}
                  >
                    {patient.name}
                  </span>
                </div>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--color-on-surface-variant)", fontFamily: "var(--font-mono)" }}
                >
                  {patient.mrn}
                </span>
              </div>

              {/* Status dot */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_DOT[patient.status] ?? "#94a3b8" }}
                title={patient.status}
              />

              {/* Context menu */}
              {contextMenu === patient.id && (
                <div
                  ref={contextRef}
                  className="absolute right-2 mt-16 z-50 bg-white rounded-lg shadow-lg border py-1 min-w-[120px]"
                  style={{ borderColor: "var(--color-outline-variant, #e2e8f0)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { onPinPatient(patient.id, !patient.pinned); setContextMenu(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                    style={{ color: "var(--color-on-surface)" }}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {patient.pinned ? "push_pin" : "push_pin"}
                    </span>
                    {patient.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    onClick={() => { onDeletePatient(patient.id); setContextMenu(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 transition-colors"
                    style={{ color: "#dc2626" }}
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete
                  </button>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Patient count */}
      <div
        className="px-4 py-3 text-[10px] font-medium shrink-0"
        style={{
          color: "var(--color-on-surface-variant)",
          borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
        }}
      >
        {patients.length} patient{patients.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
