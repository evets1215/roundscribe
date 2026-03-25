/**
 * POST /api/patients/[id]/prior-note
 *
 * Persists a manually pasted prior note to the DB immediately (on editor blur,
 * visibilitychange, and beforeunload) so Day-1 setup survives browser close
 * before a note is generated.
 *
 * Creates a new Note record with type:"manual-paste" in noteJson.
 * The GET /api/patients/[id]/notes route (take:1, orderBy createdAt desc)
 * will load this on next visit if no generated note exists yet.
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: patientId } = await params;

  // Verify ownership
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, userId },
  });
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let rawText: string;
  try {
    const body = await req.json();
    rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!rawText) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: {
      patientId,
      transcript: "",
      noteJson: { rawText, type: "manual-paste" },
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json(note, { status: 201 });
}
