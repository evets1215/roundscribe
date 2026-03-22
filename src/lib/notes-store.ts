/**
 * Simple in-memory notes store.
 *
 * Notes survive server restarts only if you swap this out for a real database.
 * The interface is intentionally minimal so it's easy to replace with
 * Prisma / Drizzle / any key-value store.
 */

import { randomUUID } from "crypto";
import type { StructuredNote } from "@/lib/medgemma";

export interface StoredNote {
  id: string;
  patientId: string;
  transcript: string;
  note: StructuredNote;
  createdAt: string; // ISO-8601
}

// Module-level singleton (shared across requests in the same Node.js process)
const store = new Map<string, StoredNote>();

export function saveNote(
  patientId: string,
  transcript: string,
  note: StructuredNote,
): StoredNote {
  const id = randomUUID();
  const record: StoredNote = {
    id,
    patientId,
    transcript,
    note,
    createdAt: new Date().toISOString(),
  };
  store.set(id, record);
  return record;
}

export function getNote(id: string): StoredNote | undefined {
  return store.get(id);
}

export function getPatientNotes(patientId: string): StoredNote[] {
  return Array.from(store.values())
    .filter((n) => n.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteNote(id: string): boolean {
  return store.delete(id);
}
