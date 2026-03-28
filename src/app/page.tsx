"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import AppSidebar from "@/components/AppSidebar";
import StatusBadge from "@/components/StatusBadge";
import { patients as initialPatients, type Patient } from "@/lib/data";

function storePatient(patient: Patient) {
  try { sessionStorage.setItem(`rs-patient-${patient.id}`, JSON.stringify(patient)); } catch {}
}

type SortKey = "status" | "mrn" | "room";
type ColKey = "name" | "room" | "status" | "mrn";

const DEFAULT_COL_ORDER: ColKey[] = ["name", "room", "status", "mrn"];
const COL_LABEL: Record<ColKey, string> = { name: "Name", room: "Room", status: "Status", mrn: "MRN" };
const SORTABLE_COLS = new Set<ColKey>(["room", "status", "mrn"]);


type TaskStatus = "pending" | "awaiting_result" | "done" | "carry_forward" | "resolved";
interface HandoffItem {
  id: string;
  text: string;
  status: TaskStatus;
  createdAt?: number;
}
interface HandoffData {
  items: HandoffItem[];
  note: string;
}

const STATUS_CYCLE: TaskStatus[] = ["pending", "done", "awaiting_result", "carry_forward"];
const STATUS_ICON: Record<TaskStatus, string> = {
  pending:        "radio_button_unchecked",
  done:           "check_circle",
  awaiting_result:"hourglass_empty",
  carry_forward:  "arrow_forward",
  resolved:       "cancel",
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  pending:        "var(--color-on-surface-variant)",
  done:           "#16a34a",
  awaiting_result:"#d97706",
  carry_forward:  "var(--color-primary)",
  resolved:       "var(--color-outline)",
};

function migrateItems(items: (HandoffItem & { done?: boolean })[]): HandoffItem[] {
  return items.map((i) => i.status ? i : { ...i, status: i.done ? "done" : "pending" } as HandoffItem);
}

interface NewPatientForm {
  name: string;
  room: string;
  mrn: string;
  dob: string;
  sex: "M" | "F";
}

function Modal({ onClose, children, sheet = false }: { onClose: () => void; children: React.ReactNode; sheet?: boolean }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 z-50 flex justify-center ${sheet ? "items-end md:items-center" : "items-center"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>(() => {
    try {
      const saved = localStorage.getItem("rs-patient-list");
      if (saved) return JSON.parse(saved) as Patient[];
    } catch {}
    return initialPatients;
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    try {
      const saved = localStorage.getItem("rs-col-order");
      if (saved) return JSON.parse(saved) as ColKey[];
    } catch {}
    return DEFAULT_COL_ORDER;
  });
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);
  const [openHandoff, setOpenHandoff] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [swipedPatientId, setSwipedPatientId] = useState<string | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [handoffNotes, setHandoffNotes] = useState<Record<string, HandoffData>>(() => {
    try {
      const saved = localStorage.getItem("rs-handoff");
      if (saved) {
        const raw = JSON.parse(saved) as Record<string, HandoffData & { items: (HandoffItem & { done?: boolean })[] }>;
        // Migrate items that have done: boolean but no status
        const migrated: Record<string, HandoffData> = {};
        for (const [k, v] of Object.entries(raw)) {
          migrated[k] = { ...v, items: migrateItems(v.items ?? []) };
        }
        return migrated;
      }
    } catch {}
    return {};
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showSignout, setShowSignout] = useState(false);

  // Add patient form state
  const [newPatient, setNewPatient] = useState<NewPatientForm>({
    name: "", room: "", mrn: "", dob: "", sex: "M",
  });
  const [addError, setAddError] = useState("");

  // Photo scan state
  type ScanState = "idle" | "scanning" | "review";
  const [addTab, setAddTab] = useState<"manual" | "scan">("manual");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanError, setScanError] = useState("");
  const [scannedPatients, setScannedPatients] = useState<Array<{ name: string; mrn: string; location: string }>>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);


  const roundedPatients = patients.filter((p) => p.status === "Updated").length;

  const togglePin = (id: string) => {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;
    const newPinned = !patient.pinned;
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, pinned: newPinned } : p)));
  };

  const deletePatient = (id: string) => {
    setPatients((prev) => prev.filter((p) => p.id !== id));
  };

  // Persist patient list across refreshes
  useEffect(() => {
    try { localStorage.setItem("rs-patient-list", JSON.stringify(patients)); } catch {}
  }, [patients]);

  // Persist column order
  useEffect(() => {
    try { localStorage.setItem("rs-col-order", JSON.stringify(colOrder)); } catch {}
  }, [colOrder]);

  // Persist handoff notes
  useEffect(() => {
    try { localStorage.setItem("rs-handoff", JSON.stringify(handoffNotes)); } catch {}
  }, [handoffNotes]);

  // Focus newly created checklist items
  useEffect(() => {
    if (!pendingFocusId) return;
    document.getElementById(`hi-${pendingFocusId}`)?.focus();
    setPendingFocusId(null);
  }, [pendingFocusId]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  };

  const getSortIcon = (key: SortKey) => {
    if (sort?.key !== key) return "unfold_more";
    return sort.dir === "asc" ? "arrow_upward" : "arrow_downward";
  };

  const handleColDragStart = (key: ColKey) => setDragCol(key);
  const handleColDragOver = (e: React.DragEvent, key: ColKey) => { e.preventDefault(); setDragOverCol(key); };
  const handleColDrop = (key: ColKey) => {
    if (!dragCol || dragCol === key) return;
    setColOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(dragCol);
      const to = next.indexOf(key);
      next.splice(from, 1);
      next.splice(to, 0, dragCol);
      return next;
    });
    setDragCol(null);
    setDragOverCol(null);
  };
  const handleColDragEnd = () => { setDragCol(null); setDragOverCol(null); };

  const getHandoff = (patientId: string): HandoffData =>
    handoffNotes[patientId] ?? { items: [], note: "" };

  const toggleHandoff = (patientId: string) => {
    setOpenHandoff(prev => {
      if (prev === patientId) return null;
      let firstId: string | null = null;
      setHandoffNotes(n => {
        if (n[patientId]?.items?.length) {
          firstId = n[patientId].items[0].id;
          return n;
        }
        firstId = `h-${Date.now()}`;
        return { ...n, [patientId]: { items: [{ id: firstId, text: "", status: "pending" as TaskStatus, createdAt: Date.now() }], note: "" } };
      });
      if (firstId) setPendingFocusId(firstId);
      return patientId;
    });
  };

  const updateHandoffItem = (patientId: string, itemId: string, text: string) => {
    setHandoffNotes(prev => {
      const d = getHandoff(patientId);
      return { ...prev, [patientId]: { ...d, items: d.items.map(i => i.id === itemId ? { ...i, text } : i) } };
    });
  };

  const cycleHandoffStatus = (patientId: string, itemId: string) => {
    setHandoffNotes(prev => {
      const d = getHandoff(patientId);
      return {
        ...prev,
        [patientId]: {
          ...d,
          items: d.items.map((i) => {
            if (i.id !== itemId) return i;
            const idx = STATUS_CYCLE.indexOf(i.status);
            return { ...i, status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
          }),
        },
      };
    });
  };

  const updateHandoffNote = (patientId: string, note: string) => {
    setHandoffNotes(prev => ({ ...prev, [patientId]: { ...getHandoff(patientId), note } }));
  };

  const addHandoffItem = (patientId: string, afterId?: string) => {
    const newItem: HandoffItem = { id: `h-${Date.now()}-${Math.random()}`, text: "", status: "pending", createdAt: Date.now() };
    setHandoffNotes(prev => {
      const d = getHandoff(patientId);
      if (afterId) {
        const idx = d.items.findIndex(i => i.id === afterId);
        const next = [...d.items];
        next.splice(idx + 1, 0, newItem);
        return { ...prev, [patientId]: { ...d, items: next } };
      }
      return { ...prev, [patientId]: { ...d, items: [...d.items, newItem] } };
    });
    setPendingFocusId(newItem.id);
  };

  const removeHandoffItem = (patientId: string, itemId: string) => {
    setHandoffNotes(prev => {
      const d = getHandoff(patientId);
      if (d.items.length <= 1) return prev;
      const idx = d.items.findIndex(i => i.id === itemId);
      const next = d.items.filter(i => i.id !== itemId);
      setPendingFocusId(next[Math.max(0, idx - 1)]?.id ?? null);
      return { ...prev, [patientId]: { ...d, items: next } };
    });
  };

  const filtered = patients.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.room.toLowerCase().includes(q) ||
      p.mrn.includes(q)
    );
  });

  const sortedPatients = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (!sort) return 0;
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "room") {
      const aVal = (a.room ?? "").split("/")[0];
      const bVal = (b.room ?? "").split("/")[0];
      return aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" }) * dir;
    }
    const aVal = a[sort.key] as string;
    const bVal = b[sort.key] as string;
    return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
  });

  const handleAddPatient = () => {
    setAddError("");
    if (!newPatient.name.trim()) { setAddError("Patient name is required."); return; }
    if (!newPatient.room.trim()) { setAddError("Room is required."); return; }
    if (!newPatient.mrn.trim()) { setAddError("MRN is required."); return; }

    const created: Patient = {
      id: `local-${Date.now()}`,
      name: newPatient.name.trim(),
      room: newPatient.room.trim().toUpperCase(),
      mrn: newPatient.mrn.trim(),
      dob: newPatient.dob || "",
      sex: newPatient.sex,
      status: "Pending",
      lastNote: "Not started",
      pinned: false,
    };

    setPatients((prev) => [created, ...prev]);
    setNewPatient({ name: "", room: "", mrn: "", dob: "", sex: "M" });
    setShowAddPatient(false);
  };

  const resetAddForm = () => {
    setNewPatient({ name: "", room: "", mrn: "", dob: "", sex: "M" });
    setAddError("");
    setAddTab("manual");
    setScanState("idle");
    setScanError("");
    setScannedPatients([]);
    setShowAddPatient(false);
  };

  const handleScanImage = async (file: File) => {
    setScanState("scanning");
    setScanError("");
    const form = new FormData();
    form.append("image", file);
    try {
      const res = await fetch("/api/scan-patients", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      if (data.patients.length === 0) {
        setScanError("No patients found in the photo. Try a clearer image.");
        setScanState("idle");
        return;
      }
      setScannedPatients(data.patients);
      setScanState("review");
    } catch (err) {
      setScanError((err as Error).message);
      setScanState("idle");
    }
  };

  const handleAddAllScanned = () => {
    const now = Date.now();
    const created: Patient[] = scannedPatients.map((p, i) => ({
      id: `local-${now}-${i}`,
      name: p.name,
      room: p.location,
      mrn: p.mrn,
      dob: "",
      sex: "M" as const,
      status: "Pending" as const,
      lastNote: "Not started",
      pinned: false,
    }));
    setPatients((prev) => [...created, ...prev]);
    resetAddForm();
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <AppSidebar />

      {/* Main content */}
      <main className="md:ml-64 flex-1 flex flex-col min-h-screen">
        {/* Top header */}
        <header
          className="sticky top-0 z-30 flex justify-between items-center w-full px-6 py-3 h-16 border-b"
          style={{
            backgroundColor: "var(--color-surface-container-lowest)",
            borderColor: "var(--color-surface-container-high)",
          }}
        >
          {/* Mobile logo (hidden on desktop) */}
          <div className="md:hidden font-bold text-xl uppercase tracking-wider" style={{ fontFamily: "var(--font-headline)", color: "var(--color-primary)" }}>
            Roundscribe
          </div>

          {/* Search input (shown when open) */}
          {searchOpen && (
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients by name, room, or MRN…"
              className="flex-1 mx-4 px-3 py-1.5 text-sm rounded border focus:outline-none focus:ring-2"
              style={{
                borderColor: "var(--color-outline-variant)",
                fontFamily: "var(--font-body)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                }
              }}
            />
          )}

          {/* Header icon actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setSearchQuery("");
              }}
              className="p-2.5 rounded-md transition-colors hover:bg-slate-50"
              style={{ color: searchOpen ? "var(--color-primary)" : "var(--color-on-surface-variant)" }}
              title="Search patients"
            >
              <span className="material-symbols-outlined">{searchOpen ? "close" : "search"}</span>
            </button>
            <button
              onClick={() => setShowCompliance(true)}
              className="p-2.5 rounded-md transition-colors hover:bg-slate-50"
              style={{ color: "var(--color-on-surface-variant)" }}
              title="Compliance status"
            >
              <span className="material-symbols-outlined">verified_user</span>
            </button>
            <button
              onClick={() => setShowAccount(true)}
              className="p-2.5 rounded-md transition-colors hover:bg-slate-50"
              style={{ color: "var(--color-on-surface-variant)" }}
              title="Account"
            >
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            <button
              onClick={() => setShowSignout(true)}
              className="p-2.5 rounded-md transition-colors hover:bg-slate-50"
              style={{ color: "var(--color-on-surface-variant)" }}
              title="Log out"
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
        </header>

        {/* Content area */}
        <div className="px-6 py-6 max-w-7xl mx-auto w-full flex-1">
          {/* Page title + stats */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div>
              <h1
                className="text-2xl font-extrabold tracking-tight"
                style={{
                  fontFamily: "var(--font-headline)",
                  color: "var(--color-on-surface)",
                }}
              >
                Active Patients
              </h1>
              <div className="flex items-center gap-4 mt-1">
                <p
                  className="text-xs font-medium"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  {patients.length} Patients assigned
                </p>
                <div
                  className="h-3 w-px"
                  style={{ backgroundColor: "var(--color-outline-variant)" }}
                />
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Progress: {roundedPatients}/{patients.length}
                  </span>
                  <div
                    className="w-24 h-1.5 rounded-full overflow-hidden"
                    style={{
                      backgroundColor: "var(--color-surface-container-highest)",
                    }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: "var(--color-primary)",
                        width: patients.length > 0 ? `${(roundedPatients / patients.length) * 100}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddPatient(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95 touch-manipulation"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add Patient
              </button>
            </div>
          </div>

          {/* Patient Table */}
          <div
            className="rounded-md overflow-hidden"
            style={{
              backgroundColor: "var(--color-surface-container-lowest)",
              border: "1px solid var(--color-outline-variant)",
            }}
          >
            {/* Mobile: card list */}
            <div className="md:hidden p-3 space-y-2">
              {sortedPatients.map((patient) => (
                <div key={patient.id}>
                <div className="relative rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-outline-variant)" }}>
                  {/* Swipe-to-delete reveal */}
                  <div
                    className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
                    style={{ width: 64, backgroundColor: "#ef4444" }}
                  >
                    <button
                      onClick={() => { deletePatient(patient.id); setSwipedPatientId(null); }}
                      className="flex items-center justify-center w-full h-full"
                      aria-label="Delete patient"
                    >
                      <span className="material-symbols-outlined text-white text-xl">delete</span>
                    </button>
                  </div>

                  {/* Swipeable card content */}
                  <div
                    onTouchStart={(e) => {
                      touchStartX.current = e.touches[0].clientX;
                      touchStartY.current = e.touches[0].clientY;
                    }}
                    onTouchMove={(e) => {
                      const dx = e.touches[0].clientX - touchStartX.current;
                      const dy = e.touches[0].clientY - touchStartY.current;
                      if (Math.abs(dx) < Math.abs(dy)) return; // vertical scroll, ignore
                      if (dx < -40) setSwipedPatientId(patient.id);
                      else if (dx > 20) setSwipedPatientId(null);
                    }}
                    className="relative flex items-center gap-4 px-4 py-4"
                    style={{
                      backgroundColor: "var(--color-surface)",
                      transform: swipedPatientId === patient.id ? "translateX(-64px)" : "translateX(0)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    {/* Room number — large, primary, left anchor */}
                    <button
                      onClick={() => { storePatient(patient); router.push(`/patients/${patient.id}`); }}
                      className="shrink-0 text-2xl font-black leading-none min-w-[56px] text-left"
                      style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)" }}
                    >
                      {patient.room}
                    </button>

                    {/* Name + status */}
                    <button
                      onClick={() => { storePatient(patient); router.push(`/patients/${patient.id}`); }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-base font-bold truncate" style={{ color: "var(--color-on-surface)" }}>
                        {patient.name}
                      </div>
                      <div className="text-[11px] font-bold uppercase tracking-wide mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
                        {getHandoff(patient.id).items.some((i) => i.text.trim()) ? "In Progress" : patient.status}
                      </div>
                    </button>

                    {/* Mic + Handoff */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { storePatient(patient); router.push(`/patients/${patient.id}?record=1`); }}
                        className="p-2 rounded-full transition-colors hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Record"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        <span className="material-symbols-outlined text-xl">mic</span>
                      </button>
                      <button
                        onClick={() => toggleHandoff(patient.id)}
                        className="px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-colors min-h-[44px]"
                        style={{
                          backgroundColor: openHandoff === patient.id || getHandoff(patient.id).items.some((i) => i.text.trim())
                            ? "var(--color-primary)" : "transparent",
                          color: openHandoff === patient.id || getHandoff(patient.id).items.some((i) => i.text.trim())
                            ? "white" : "var(--color-primary)",
                          border: "1px solid var(--color-primary)",
                        }}
                      >
                        Handoff
                      </button>
                    </div>
                  </div>
                </div>{/* end swipe container */}
                  {openHandoff === patient.id && (
                    <div className="mt-1 rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-outline-variant)" }}>
                      {/* Header */}
                      <div
                        className="flex items-center justify-between px-4 py-3"
                        style={{ backgroundColor: "var(--color-surface-container-low)", borderBottom: "1px solid var(--color-outline-variant)" }}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface)" }}>Patient Handoff</span>
                        <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--color-on-surface-variant)" }}>Auto-saving</span>
                      </div>

                      {/* Task list */}
                      <div className="px-4 py-3 space-y-0.5" style={{ backgroundColor: "var(--color-surface)" }}>
                        {getHandoff(patient.id).items.map((item, idx) => (
                          <div key={item.id} className="flex items-center gap-1">
                            <button
                              onClick={() => cycleHandoffStatus(patient.id, item.id)}
                              title={`Status: ${item.status} — tap to cycle`}
                              className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors"
                              style={{ color: STATUS_COLOR[item.status] }}
                            >
                              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                {STATUS_ICON[item.status]}
                              </span>
                            </button>
                            <input
                              id={`hi-${item.id}`}
                              type="text"
                              value={item.text}
                              onChange={(e) => updateHandoffItem(patient.id, item.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); addHandoffItem(patient.id, item.id); }
                                if (e.key === "Backspace" && item.text === "") { e.preventDefault(); removeHandoffItem(patient.id, item.id); }
                              }}
                              placeholder={idx === 0 ? "Add task..." : ""}
                              className="flex-1 bg-transparent text-sm outline-none min-h-[44px]"
                              style={{
                                color: item.status === "done" || item.status === "resolved"
                                  ? "var(--color-on-surface-variant)"
                                  : "var(--color-on-surface)",
                                textDecoration: item.status === "resolved" ? "line-through" : "none",
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Free text note */}
                      <div className="px-4 pb-3 pt-1" style={{ backgroundColor: "var(--color-surface)", borderTop: "1px solid var(--color-outline-variant)" }}>
                        <textarea
                          value={getHandoff(patient.id).note}
                          onChange={(e) => updateHandoffNote(patient.id, e.target.value)}
                          placeholder="Start typing clinical notes here..."
                          rows={3}
                          className="w-full bg-transparent text-sm outline-none resize-none"
                          style={{ color: "var(--color-on-surface)" }}
                        />
                      </div>

                      {/* Full-width Save/Done CTA */}
                      <button
                        onClick={() => toggleHandoff(patient.id)}
                        className="w-full py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors"
                        style={{ backgroundColor: "var(--color-primary)" }}
                      >
                        Save Handoff
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {sortedPatients.length === 0 && (
                <div
                  className="rounded-lg p-8 text-center"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-outline-variant)",
                  }}
                >
                  {searchQuery ? (
                    <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                      No patients match &ldquo;{searchQuery}&rdquo;
                    </p>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: "var(--color-on-surface-variant)" }}>
                        assignment_ind
                      </span>
                      <p className="text-sm font-medium mb-1" style={{ color: "var(--color-on-surface)" }}>
                        Your patient list is empty
                      </p>
                      <p className="text-xs mb-4" style={{ color: "var(--color-on-surface-variant)" }}>
                        Add patients to start tracking your rounding tasks
                      </p>
                      <button
                        onClick={() => setShowAddPatient(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
                        style={{ backgroundColor: "var(--color-primary)" }}
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        Add Patient
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--color-surface-container-low)",
                      borderBottom: "1px solid var(--color-outline-variant)",
                    }}
                  >
                    <th
                      className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider w-10"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      Pinned
                    </th>
                    {colOrder.map((key) => (
                      <th
                        key={key}
                        draggable
                        onDragStart={() => handleColDragStart(key)}
                        onDragOver={(e) => handleColDragOver(e, key)}
                        onDrop={() => handleColDrop(key)}
                        onDragEnd={handleColDragEnd}
                        className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider select-none"
                        style={{
                          color: "var(--color-on-surface-variant)",
                          cursor: "grab",
                          borderLeft: dragOverCol === key && dragCol !== key ? "2px solid var(--color-primary)" : "2px solid transparent",
                          opacity: dragCol === key ? 0.4 : 1,
                          transition: "opacity 0.15s",
                        }}
                      >
                        {SORTABLE_COLS.has(key) ? (
                          <button
                            onClick={() => handleSort(key as SortKey)}
                            className="flex items-center gap-1 uppercase transition-colors hover:opacity-70 min-h-[44px] py-2"
                          >
                            {COL_LABEL[key]}
                            <span
                              className="material-symbols-outlined"
                              style={{
                                fontSize: "14px",
                                opacity: sort?.key === key ? 1 : 0.5,
                                color: sort?.key === key ? "var(--color-primary)" : undefined,
                              }}
                            >
                              {getSortIcon(key as SortKey)}
                            </span>
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 min-h-[44px] py-2">
                            {COL_LABEL[key]}
                          </span>
                        )}
                      </th>
                    ))}
                    <th
                      className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-right"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPatients.map((patient) => (
                    <React.Fragment key={patient.id}>
                    <tr
                      className="group transition-colors hover:bg-slate-50/50"
                      style={{
                        borderBottom: "1px solid var(--color-outline-variant)",
                      }}
                    >
                      {/* Pin */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => togglePin(patient.id)}
                          className="transition-transform hover:scale-110 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title={patient.pinned ? "Unpin patient" : "Pin patient"}
                          style={{
                            color: patient.pinned
                              ? "var(--color-primary)"
                              : "#cbd5e1",
                          }}
                        >
                          <span
                            className="material-symbols-outlined text-lg"
                            style={
                              patient.pinned
                                ? { fontVariationSettings: "'FILL' 1" }
                                : {}
                            }
                          >
                            push_pin
                          </span>
                        </button>
                      </td>

                      {colOrder.map((key) => (
                        <td key={key} className="px-4 py-3">
                          {key === "name" && (
                            <Link href={`/patients/${patient.id}`} onClick={() => storePatient(patient)} className="block">
                              <span
                                className="text-sm font-bold transition-colors group-hover:opacity-80"
                                style={{ color: "var(--color-on-surface)" }}
                              >
                                {patient.name}
                              </span>
                            </Link>
                          )}
                          {key === "room" && (
                            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
                              {patient.room}
                            </span>
                          )}
                          {key === "status" && (
                            <div className="flex flex-col gap-1">
                              <StatusBadge status={patient.status} />
                              <span className="text-[10px] font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
                                Last Rec: {patient.lastNote}
                              </span>
                            </div>
                          )}
                          {key === "mrn" && (
                            <span className="text-xs font-mono" style={{ color: "var(--color-on-surface-variant)" }}>
                              {patient.mrn}
                            </span>
                          )}
                        </td>
                      ))}

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { storePatient(patient); router.push(`/patients/${patient.id}?record=1`); }}
                            className="p-2.5 rounded-full transition-colors hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Start Recording"
                            style={{ color: "var(--color-primary)" }}
                          >
                            <span
                              className="material-symbols-outlined text-lg"
                              style={
                                patient.status === "In Progress"
                                  ? { fontVariationSettings: "'FILL' 1" }
                                  : {}
                              }
                            >
                              mic
                            </span>
                          </button>
                          <button
                            onClick={() => toggleHandoff(patient.id)}
                            className="font-bold text-[11px] uppercase tracking-wider min-h-[44px] px-3 rounded-md transition-colors"
                            style={{
                              backgroundColor: openHandoff === patient.id ? "var(--color-primary)" : "transparent",
                              color: openHandoff === patient.id ? "white" : "var(--color-primary)",
                              border: "1px solid var(--color-primary)",
                            }}
                          >
                            Handoff
                          </button>
                          <button
                            onClick={() => deletePatient(patient.id)}
                            className="p-2.5 rounded-full transition-colors hover:bg-red-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Remove patient"
                            style={{ color: "#cbd5e1" }}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {openHandoff === patient.id && (
                      <tr>
                        <td colSpan={colOrder.length + 2} className="px-4 pb-4">
                          <div
                            className="rounded-lg p-4"
                            style={{ backgroundColor: "var(--color-surface-container-low)", border: "1px solid var(--color-outline-variant)" }}
                          >
                            <div className="flex items-center justify-between pb-2 mb-3" style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
                              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface)" }}>
                                Patient Handoff Checklist
                              </span>
                              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-on-surface-variant)" }}>
                                Enter notes line-by-line
                              </span>
                            </div>
                            <div className="space-y-1">
                              {getHandoff(patient.id).items.map((item, idx) => (
                                <div key={item.id} className="flex items-center gap-2">
                                  <button
                                    onClick={() => cycleHandoffStatus(patient.id, item.id)}
                                    title={`Status: ${item.status} — tap to cycle`}
                                    className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors"
                                    style={{ color: STATUS_COLOR[item.status] }}
                                  >
                                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                                      {STATUS_ICON[item.status]}
                                    </span>
                                  </button>
                                  <input
                                    id={`hi-${item.id}`}
                                    type="text"
                                    value={item.text}
                                    onChange={(e) => updateHandoffItem(patient.id, item.id, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); addHandoffItem(patient.id, item.id); }
                                      if (e.key === "Backspace" && item.text === "") { e.preventDefault(); removeHandoffItem(patient.id, item.id); }
                                    }}
                                    placeholder={idx === 0 ? "Add task..." : ""}
                                    className="flex-1 bg-transparent text-sm outline-none"
                                    style={{
                                      color: item.status === "done" || item.status === "resolved"
                                        ? "var(--color-on-surface-variant)"
                                        : "var(--color-on-surface)",
                                      textDecoration: item.status === "resolved" ? "line-through" : "none",
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--color-outline-variant)" }}>
                              <textarea
                                value={getHandoff(patient.id).note}
                                onChange={(e) => updateHandoffNote(patient.id, e.target.value)}
                                placeholder="Free text notes..."
                                rows={3}
                                className="w-full bg-transparent text-sm outline-none resize-none"
                                style={{ color: "var(--color-on-surface)" }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {sortedPatients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        {searchQuery ? (
                          <span className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                            No patients match &ldquo;{searchQuery}&rdquo;
                          </span>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <span className="material-symbols-outlined text-4xl" style={{ color: "var(--color-on-surface-variant)" }}>
                              assignment_ind
                            </span>
                            <p className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>Your patient list is empty</p>
                            <p className="text-xs mb-2" style={{ color: "var(--color-on-surface-variant)" }}>Add patients to start tracking your rounding tasks</p>
                            <button
                              onClick={() => setShowAddPatient(true)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
                              style={{ backgroundColor: "var(--color-primary)" }}
                            >
                              <span className="material-symbols-outlined text-sm">add</span>
                              Add Patient
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* HIPAA Footer */}
          <footer
            className="mt-12 pt-6 flex flex-col md:flex-row justify-between items-center gap-4"
            style={{
              borderTop: "1px solid var(--color-surface-container-high)",
            }}
          >
            <div className="flex items-center gap-2 opacity-50">
              <span className="material-symbols-outlined text-xl">security</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">
                HIPAA Compliant Protocol 256-bit AES
              </span>
            </div>
            <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest">
              {["System Status", "Privacy Policy", "Medical Disclosure"].map(
                (link) => (
                  <span
                    key={link}
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {link}
                  </span>
                )
              )}
            </div>
            <div
              className="text-[10px] font-bold opacity-50"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              © 2026 Roundscribe Medical Systems.
            </div>
          </footer>
        </div>
      </main>

      {/* ── Add Patient Modal ── */}
      {showAddPatient && (
        <Modal onClose={resetAddForm} sheet>
          <div
            className="w-full md:max-w-md md:mx-4 rounded-t-2xl md:rounded-xl shadow-xl p-5 md:p-6 max-h-[88svh] overflow-y-auto"
            style={{ backgroundColor: "white" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-extrabold tracking-tight"
                style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
              >
                Add Patient
              </h2>
              <button
                onClick={resetAddForm}
                className="p-1 rounded-md hover:bg-slate-100 transition-colors"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg p-0.5 mb-5" style={{ backgroundColor: "var(--color-surface-container-low)" }}>
              {(["manual", "scan"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setAddTab(tab); setScanState("idle"); setScanError(""); }}
                  className="flex-1 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: addTab === tab ? "white" : "transparent",
                    color: addTab === tab ? "var(--color-on-surface)" : "var(--color-on-surface-variant)",
                    boxShadow: addTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  <span className="material-symbols-outlined text-base">
                    {tab === "manual" ? "edit" : "photo_camera"}
                  </span>
                  {tab === "manual" ? "Manual" : "Scan Photo"}
                </button>
              ))}
            </div>

            {/* ── Manual tab ── */}
            {addTab === "manual" && (
              <>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-on-surface-variant)" }}>
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={newPatient.name}
                      onChange={(e) => setNewPatient((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2"
                      style={{ borderColor: "var(--color-outline-variant)", fontFamily: "var(--font-body)" }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-on-surface-variant)" }}>
                        Room
                      </label>
                      <input
                        type="text"
                        value={newPatient.room}
                        onChange={(e) => setNewPatient((p) => ({ ...p, room: e.target.value }))}
                        placeholder="e.g. 401A"
                        className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2"
                        style={{ borderColor: "var(--color-outline-variant)", fontFamily: "var(--font-body)" }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-on-surface-variant)" }}>
                        MRN
                      </label>
                      <input
                        type="text"
                        value={newPatient.mrn}
                        onChange={(e) => setNewPatient((p) => ({ ...p, mrn: e.target.value }))}
                        placeholder="e.g. 8839210"
                        className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 font-mono"
                        style={{ borderColor: "var(--color-outline-variant)", fontFamily: "var(--font-body)" }}
                      />
                    </div>
                  </div>
                  {addError && (
                    <p className="text-xs font-medium" style={{ color: "var(--color-error)" }}>{addError}</p>
                  )}
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={resetAddForm}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all hover:bg-slate-50"
                    style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddPatient}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: "var(--color-primary)" }}
                  >
                    Save Patient
                  </button>
                </div>
              </>
            )}

            {/* ── Scan tab ── */}
            {addTab === "scan" && (
              <>
                {/* Hidden file input — opens camera on mobile */}
                <input
                  ref={scanInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleScanImage(file);
                    e.target.value = "";
                  }}
                />

                {/* Idle: prompt to take photo */}
                {scanState === "idle" && (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "var(--color-primary-container)" }}
                    >
                      <span className="material-symbols-outlined text-3xl" style={{ color: "var(--color-on-primary-container)" }}>
                        photo_camera
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>
                        Take a photo of your patient list
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--color-on-surface-variant)" }}>
                        Names and MRNs will be extracted automatically
                      </p>
                    </div>
                    {scanError && (
                      <p className="text-xs text-center px-4" style={{ color: "var(--color-error)" }}>{scanError}</p>
                    )}
                    <button
                      onClick={() => scanInputRef.current?.click()}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-2"
                      style={{ backgroundColor: "var(--color-primary)" }}
                    >
                      <span className="material-symbols-outlined text-base">photo_camera</span>
                      Take Photo
                    </button>
                    <button
                      onClick={() => {
                        // Remove capture attribute to allow gallery selection on desktop
                        if (scanInputRef.current) {
                          scanInputRef.current.removeAttribute("capture");
                          scanInputRef.current.click();
                          // Restore for next time
                          setTimeout(() => scanInputRef.current?.setAttribute("capture", "environment"), 500);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl text-sm font-bold border transition-all hover:bg-slate-50"
                      style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
                    >
                      Choose from Library
                    </button>
                  </div>
                )}

                {/* Scanning: spinner */}
                {scanState === "scanning" && (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
                      Reading patient list…
                    </p>
                  </div>
                )}

                {/* Review: show extracted patients */}
                {scanState === "review" && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-on-surface-variant)" }}>
                      {scannedPatients.length} patient{scannedPatients.length !== 1 ? "s" : ""} found
                    </p>
                    <div className="flex flex-col gap-2 max-h-56 overflow-y-auto mb-5">
                      {scannedPatients.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{ backgroundColor: "var(--color-surface-container-low)" }}
                        >
                          <span className="text-sm font-medium truncate" style={{ color: "var(--color-on-surface)" }}>
                            {p.name}
                          </span>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            {p.location && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-container)", color: "var(--color-on-surface-variant)" }}>
                                {p.location}
                              </span>
                            )}
                            {p.mrn && (
                              <span className="text-xs font-mono" style={{ color: "var(--color-on-surface-variant)" }}>
                                {p.mrn}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setScanState("idle"); setScannedPatients([]); }}
                        className="flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all hover:bg-slate-50"
                        style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
                      >
                        Retake
                      </button>
                      <button
                        onClick={handleAddAllScanned}
                        className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: "var(--color-primary)" }}
                      >
                        Add All
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── Compliance Modal ── */}
      {showCompliance && (
        <Modal onClose={() => setShowCompliance(false)}>
          <div
            className="w-full max-w-sm mx-4 rounded-xl shadow-xl p-6"
            style={{ backgroundColor: "white" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-base font-extrabold tracking-tight"
                style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
              >
                System Status
              </h2>
              <button
                onClick={() => setShowCompliance(false)}
                className="p-1 rounded-md hover:bg-slate-100 transition-colors"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3">
              {[
                { icon: "verified_user", label: "HIPAA Compliant", value: "Active" },
                { icon: "lock", label: "Encryption", value: "256-bit AES" },
                { icon: "vpn_key", label: "Sessions", value: "Encrypted & Logged" },
                { icon: "monitoring", label: "Uptime", value: "99.9%" },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
                  <span className="material-symbols-outlined text-base" style={{ color: "var(--color-primary)" }}>{icon}</span>
                  <span className="text-xs font-medium flex-1" style={{ color: "var(--color-on-surface-variant)" }}>{label}</span>
                  <span className="text-xs font-bold" style={{ color: "var(--color-primary)" }}>{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCompliance(false)}
              className="w-full mt-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Done
            </button>
          </div>
        </Modal>
      )}

      {/* ── Account Modal ── */}
      {showAccount && (
        <Modal onClose={() => setShowAccount(false)}>
          <div
            className="w-full max-w-sm mx-4 rounded-xl shadow-xl p-6"
            style={{ backgroundColor: "white" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-base font-extrabold tracking-tight"
                style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
              >
                Account
              </h2>
              <button
                onClick={() => setShowAccount(false)}
                className="p-1 rounded-md hover:bg-slate-100 transition-colors"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="flex items-center gap-4 mb-5 pb-5" style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                style={{ backgroundColor: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}
              >
                DM
              </div>
              <div>
                <p className="text-base font-extrabold" style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}>
                  Dr. Miller
                </p>
                <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
                  Internal Medicine
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: "License", value: "MD-7823" },
                { label: "Department", value: "Internal Medicine" },
                { label: "Facility", value: "General Hospital — Ward 4" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--color-on-surface-variant)" }}>{label}</span>
                  <span className="text-xs font-medium" style={{ color: "var(--color-on-surface)" }}>{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowAccount(false)}
              className="w-full mt-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* ── Sign Out Confirmation ── */}
      {showSignout && (
        <Modal onClose={() => setShowSignout(false)}>
          <div
            className="w-full max-w-sm mx-4 rounded-xl shadow-xl p-6"
            style={{ backgroundColor: "white" }}
          >
            <h2
              className="text-base font-extrabold mb-2 tracking-tight"
              style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
            >
              Sign out
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-on-surface-variant)" }}>
              Sign out of Roundscribe? Any unsaved notes will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSignout(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all hover:bg-slate-50"
                style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ backgroundColor: "var(--color-error)" }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
