import type { Patient, PatientStatus } from "@/lib/data";

export interface PatientRecord {
  id: string;
  name: string;
  room: string;
  mrn: string;
  dob: string;
  sex: string;
  status: PatientStatus;
  pinned: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastNoteAt?: string | null;
}

export interface PatientNoteRecord {
  id: string;
  patientId: string;
  transcript: string;
  noteJson: unknown;
  audioKey: string | null;
  createdAt: string;
}

export function toDashboardPatient(patient: PatientRecord): Patient {
  return {
    id: patient.id,
    name: patient.name,
    room: patient.room,
    mrn: patient.mrn,
    dob: patient.dob,
    sex: patient.sex === "F" ? "F" : "M",
    status: patient.status,
    pinned: patient.pinned,
    lastNote: formatLastNote(patient.lastNoteAt, patient.status),
  };
}

export function formatLastNote(
  lastNoteAt: string | null | undefined,
  status?: PatientStatus,
): string {
  if (!lastNoteAt) {
    return status === "Pending" ? "Not started" : "No notes";
  }

  const date = new Date(lastNoteAt);
  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  const diffMs = Date.now() - date.getTime();
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < hourMs) {
    return `${Math.max(1, Math.floor(diffMs / minuteMs))}m ago`;
  }

  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)}h ago`;
  }

  if (diffMs < 7 * dayMs) {
    return `${Math.floor(diffMs / dayMs)}d ago`;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function extractRawNoteText(noteJson: unknown): string {
  if (!noteJson || typeof noteJson !== "object") {
    return "";
  }

  const rawText = (noteJson as { rawText?: unknown }).rawText;
  return typeof rawText === "string" ? rawText : "";
}
