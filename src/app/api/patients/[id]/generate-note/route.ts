/**
 * POST /api/patients/[id]/generate-note
 *
 * Generates today's progress note from server-backed state:
 * - Prior note: fetched from DB (latest Note record)
 * - Tasks: fetched from DB (all HandoffTasks for this patient)
 * - Optional free-text update from request body
 *
 * Also accepts legacy client-side handoff data for backwards compatibility.
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { generateNoteFromHandoff } from "@/lib/claude";
import { extractRawNoteText } from "@/lib/patient-records";
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

  let body: {
    freeTextUpdate?: string;
    // Legacy fields (backwards compat with client-side handoff)
    previousNote?: string;
    handoffItems?: Array<{ text: string; done?: boolean; status?: string }>;
    handoffNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── Resolve prior note ──────────────────────────────────────────────────
  let previousNote: string;
  if (body.previousNote) {
    // Legacy: client sent prior note directly
    previousNote = body.previousNote;
  } else {
    // Server-first: fetch latest note from DB
    const latestNote = await prisma.note.findFirst({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      select: { noteJson: true, transcript: true },
    });
    if (latestNote) {
      previousNote = extractRawNoteText(latestNote.noteJson as Record<string, unknown>) || latestNote.transcript || "";
    } else {
      previousNote = "";
    }
  }

  // ── Resolve tasks ───────────────────────────────────────────────────────
  let handoffItems: Array<{ text: string; done?: boolean; status?: string }>;
  if (body.handoffItems && body.handoffItems.length > 0) {
    // Legacy: client sent handoff items directly
    handoffItems = body.handoffItems;
  } else {
    // Server-first: fetch all tasks from DB
    const dbTasks = await prisma.handoffTask.findMany({
      where: { patientId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    handoffItems = dbTasks.map((t) => ({
      text: t.text,
      status: t.status,
    }));
  }

  const handoffNote = body.handoffNote ?? body.freeTextUpdate ?? "";

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

  // ── Persist ─────────────────────────────────────────────────────────────
  let noteId: string;
  const taskIds = handoffItems.length > 0
    ? (await prisma.handoffTask.findMany({
        where: { patientId },
        select: { id: true },
      })).map((t) => t.id)
    : [];

  try {
    if (!isDev) {
      const dbNote = await prisma.note.create({
        data: {
          patientId,
          transcript: "",
          noteJson: note as object,
          type: "generated",
          sourceTaskIds: taskIds.length > 0 ? taskIds : undefined,
        },
        select: { id: true },
      });
      noteId = dbNote.id;

      await prisma.patient.updateMany({
        where: { id: patientId, status: "Pending" },
        data: { status: "In Progress" },
      });

      // Auto-increment dayNumber for carry_forward tasks
      await prisma.handoffTask.updateMany({
        where: { patientId, status: "carry_forward" },
        data: { dayNumber: { increment: 1 } },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          patientId,
          action: "note.generate",
          details: { noteId, taskCount: handoffItems.length, source: "server" } as object,
        },
      });
    } else {
      noteId = crypto.randomUUID();
    }
  } catch {
    // DB failed but note was generated — still return it
    noteId = crypto.randomUUID();
  }

  return NextResponse.json({ noteId, note });
}
