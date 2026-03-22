/**
 * GET /api/patients/[id]/notes — list all notes for a patient (newest first)
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: patientId } = await params;

  // Verify ownership
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, userId: session.user.id },
  });
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = await prisma.note.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      patientId: true,
      transcript: true,
      noteJson: true,
      audioKey: true,
      createdAt: true,
    },
  });

  return NextResponse.json(notes);
}
