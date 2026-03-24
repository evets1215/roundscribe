"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import AppSidebar from "@/components/AppSidebar";
import StatusBadge from "@/components/StatusBadge";
import { patients as initialPatients, type Patient } from "@/lib/data";

function storePatient(patient: Patient) {
  try { sessionStorage.setItem(`rs-patient-${patient.id}`, JSON.stringify(patient)); } catch {}
}

type SortKey = "status" | "mrn";

const TOTAL_PATIENTS = 12;

const sortableColumns: { label: string; key: SortKey }[] = [
  { label: "Status", key: "status" },
  { label: "MRN", key: "mrn" },
];

interface NewPatientForm {
  name: string;
  room: string;
  mrn: string;
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onMouseDown={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showSignout, setShowSignout] = useState(false);

  // Add patient form state
  const [newPatient, setNewPatient] = useState<NewPatientForm>({
    name: "", room: "", mrn: "",
  });

  const roundedPatients = patients.filter((p) => p.status === "Updated").length;

  const togglePin = (id: string) => {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;
    const newPinned = !patient.pinned;
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, pinned: newPinned } : p)));
  };

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
    const aVal = a[sort.key] as string;
    const bVal = b[sort.key] as string;
    return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
  });

  const handleAddPatient = () => {
    const created: Patient = {
      id: `local-${Date.now()}`,
      name: newPatient.name.trim() || "New Patient",
      room: newPatient.room.trim().toUpperCase() || "—",
      mrn: newPatient.mrn.trim() || "—",
      dob: "",
      sex: "M",
      status: "Pending",
      lastNote: "Not started",
      pinned: false,
    };

    setPatients((prev) => [created, ...prev]);
    setNewPatient({ name: "", room: "", mrn: "" });
    setShowAddPatient(false);
  };

  const resetAddForm = () => {
    setNewPatient({ name: "", room: "", mrn: "" });
    setShowAddPatient(false);
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
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1
                  className="text-[28px] md:text-2xl font-extrabold tracking-tight uppercase"
                  style={{
                    fontFamily: "var(--font-headline)",
                    color: "var(--color-on-surface)",
                    letterSpacing: "0.02em",
                  }}
                >
                  Current Rounding List
                </h1>
              </div>
              <div
                className="text-base md:text-sm font-semibold shrink-0"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                {patients.length} Patients
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddPatient(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
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
            <div className="md:hidden space-y-4">
              {sortedPatients.map((patient) => {
                const statusColor =
                  patient.status === "Updated"
                    ? "#67d7e5"
                    : patient.status === "In Progress"
                      ? "#f5bf3b"
                      : "#c9d1d6";

                return (
                  <div
                    key={patient.id}
                    onClick={() => router.push(`/patients/${patient.id}`)}
                    className="rounded-[28px] px-5 py-6 cursor-pointer shadow-sm"
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #eef2f4",
                      boxShadow: "0 2px 10px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-[18px] font-bold"
                          style={{
                            backgroundColor: "#edf4f7",
                            color: "#0d5966",
                          }}
                        >
                          {patient.room.replace(/[^0-9A-Z]/g, "") || "—"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className="text-[20px] leading-tight font-semibold truncate"
                            style={{ color: "#101418" }}
                          >
                            {patient.name}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: statusColor }}
                            />
                            <span
                              className="text-[12px] font-medium uppercase tracking-[0.12em]"
                              style={{ color: "#7b8790" }}
                            >
                              {patient.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/patients/${patient.id}?record=1`);
                          }}
                          className="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
                          title="Start Recording"
                          style={{ color: "#0d5966" }}
                        >
                          <span className="material-symbols-outlined text-[30px]">mic</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {sortedPatients.length === 0 && (
                <div
                  className="rounded-[28px] p-6 text-center text-sm"
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #eef2f4",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  No patients match &quot;{searchQuery}&quot;
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
                    <th
                      className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      Name / Room
                    </th>
                    {sortableColumns.map(({ label, key }) => (
                      <th
                        key={label}
                        className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        <button
                          onClick={() => handleSort(key)}
                          className="flex items-center gap-1 uppercase transition-colors hover:opacity-70 min-h-[44px] py-2"
                        >
                          {label}
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: "14px",
                              opacity: sort?.key === key ? 1 : 0.5,
                              color: sort?.key === key ? "var(--color-primary)" : undefined,
                            }}
                          >
                            {getSortIcon(key)}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th
                      className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-right"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      Record
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      onClick={() => router.push(`/patients/${patient.id}`)}
                      className="group transition-colors hover:bg-slate-50/50 cursor-pointer"
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

                      {/* Name + Room */}
                      <td className="px-4 py-3">
                        <Link href={`/patients/${patient.id}`} onClick={() => storePatient(patient)} className="block">
                          <span
                            className="text-xs font-bold block uppercase tracking-wide"
                            style={{ color: "var(--color-primary)" }}
                          >
                            {patient.room}
                          </span>
                          <span
                            className="text-sm font-bold transition-colors group-hover:opacity-80"
                            style={{ color: "var(--color-on-surface)" }}
                          >
                            {patient.name}
                          </span>
                        </Link>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={patient.status} />
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: "var(--color-on-surface-variant)" }}
                          >
                            Last Rec: {patient.lastNote}
                          </span>
                        </div>
                      </td>

                      {/* MRN */}
                      <td
                        className="px-4 py-3 text-xs font-mono"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        {patient.mrn}
                      </td>

                      {/* DOB */}
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        {patient.dob}
                      </td>

                      {/* Sex */}
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        {patient.sex}
                      </td>

                      {/* Record */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/patients/${patient.id}?record=1`);
                            }}
                            className="p-1.5 rounded-full transition-colors hover:bg-slate-100"
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
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedPatients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                        No patients match &quot;{searchQuery}&quot;
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
        <div
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) resetAddForm();
          }}
        >
          <div
            className="w-full max-w-md mx-0 md:mx-auto rounded-t-2xl md:rounded-xl shadow-xl p-5 md:p-6 fixed bottom-0 left-0 right-0 md:top-1/2 md:bottom-auto md:-translate-y-1/2 max-h-[88vh] overflow-y-auto"
            style={{ backgroundColor: "white" }}
          >
            <div className="flex items-center justify-between mb-5">
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

            <div className="flex flex-col gap-4">
              {/* Name */}
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

              {/* Room */}
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
          </div>
        </div>
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
