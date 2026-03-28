/**
 * POST /api/patients/[id]/generate-note
 *
 * Generates today's progress note from a prior note + handoff checklist.
 * Replaces the audio-recording based /api/transcribe flow.
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { generateNoteFromHandoff } from "@/lib/claude";
import type { StructuredNote } from "@/lib/medgemma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: patientId } = await params;
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
    if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let previousNote: string;
  let handoffItems: Array<{ text: string; done?: boolean; status?: string }>;
  let handoffNote: string;
  try {
    const body = await req.json();
    previousNote = typeof body.previousNote === "string" ? body.previousNote : "";
    handoffItems = Array.isArray(body.handoffItems) ? body.handoffItems : [];
    handoffNote = typeof body.handoffNote === "string" ? body.handoffNote : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const hasContent = handoffItems.some((i) => i.text?.trim()) || handoffNote.trim();
  if (!hasContent) {
    return NextResponse.json({ error: "No handoff content to generate from" }, { status: 400 });
  }

  let note: StructuredNote;
  try {
    note = await generateNoteFromHandoff(previousNote, handoffItems, handoffNote);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let noteId: string;
  try {
    if (!isDev) {
      const dbNote = await prisma.note.create({
        data: { patientId, transcript: "", noteJson: note as object },
        select: { id: true },
      });
      noteId = dbNote.id;

      await prisma.patient.updateMany({
        where: { id: patientId, status: "Pending" },
        data: { status: "In Progress" },
      });

      await prisma.auditLog.create({
        data: { userId, patientId, action: "note.create", details: { noteId, source: "handoff" } as object },
      });
    } else {
      noteId = crypto.randomUUID();
    }
  } catch {
    // DB failed but note was generated — still return it so the user isn't blocked
    noteId = crypto.randomUUID();
  }

  return NextResponse.json({ noteId, note });
}
