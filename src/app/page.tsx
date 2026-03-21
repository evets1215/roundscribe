"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import StatusBadge from "@/components/StatusBadge";
import { patients as initialPatients, Patient } from "@/lib/data";

type SortKey = "status" | "mrn" | "dob" | "sex";

const TOTAL_PATIENTS = 12;

const sortableColumns: { label: string; key: SortKey }[] = [
  { label: "Status", key: "status" },
  { label: "MRN", key: "mrn" },
  { label: "DOB", key: "dob" },
  { label: "Sex", key: "sex" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const roundedPatients = patients.filter((p) => p.status === "Updated").length;

  const togglePin = (id: string) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p))
    );
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
              className="p-2 rounded-md transition-colors hover:bg-slate-50"
              style={{ color: searchOpen ? "var(--color-primary)" : "var(--color-on-surface-variant)" }}
              title="Search patients"
            >
              <span className="material-symbols-outlined">{searchOpen ? "close" : "search"}</span>
            </button>
            <button
              onClick={() => alert("System Status: HIPAA Compliant\n256-bit AES Encryption Active\nAll sessions encrypted and logged.")}
              className="p-2 rounded-md transition-colors hover:bg-slate-50"
              style={{ color: "var(--color-on-surface-variant)" }}
              title="Compliance status"
            >
              <span className="material-symbols-outlined">verified_user</span>
            </button>
            <button
              onClick={() => alert("Dr. Miller\nInternal Medicine\nLicense: MD-7823\nDept: General Hospital — Ward 4")}
              className="p-2 rounded-md transition-colors hover:bg-slate-50"
              style={{ color: "var(--color-on-surface-variant)" }}
              title="Account"
            >
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            <button
              onClick={() => {
                if (confirm("Sign out of Roundscribe?")) alert("You have been signed out.");
              }}
              className="p-2 rounded-md transition-colors hover:bg-slate-50"
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
                  {TOTAL_PATIENTS} Patients assigned
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
                    Progress: {roundedPatients}/{TOTAL_PATIENTS}
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
                        width: `${(roundedPatients / TOTAL_PATIENTS) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => alert("Add Patient — form coming soon.")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
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
            <div className="overflow-x-auto">
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
                          className="flex items-center gap-1 uppercase transition-colors hover:opacity-70"
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
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="group transition-colors hover:bg-slate-50/50"
                      style={{
                        borderBottom: "1px solid var(--color-outline-variant)",
                      }}
                    >
                      {/* Pin */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => togglePin(patient.id)}
                          className="transition-transform hover:scale-110"
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
                        <Link href={`/patients/${patient.id}`} className="block">
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

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => router.push(`/patients/${patient.id}?record=1`)}
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
                          <Link
                            href={`/patients/${patient.id}`}
                            className="font-bold text-[11px] hover:underline uppercase tracking-wider w-16 text-right"
                            style={{
                              color:
                                patient.status === "Updated"
                                  ? "var(--color-on-surface-variant)"
                                  : "var(--color-primary)",
                            }}
                          >
                            {patient.status === "Pending"
                              ? "Round"
                              : patient.status === "In Progress"
                              ? "Resume"
                              : "View"}
                          </Link>
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
                  <a
                    key={link}
                    href="#"
                    className="transition-colors hover:opacity-70"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {link}
                  </a>
                )
              )}
            </div>
            <div
              className="text-[10px] font-bold opacity-50"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              © 2024 Roundscribe Medical Systems.
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
