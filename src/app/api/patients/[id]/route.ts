/**
 * GET    /api/patients/[id]  — get a single patient
 * PATCH  /api/patients/[id]  — update patient fields (status, pinned, room, etc.)
 * DELETE /api/patients/[id]  — delete patient
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function getOwnedPatient(userId: string, patientId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, userId } });
}

export async function GET(_req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const patient = await getOwnedPatient(userId, id);
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(patient);
}

export async function PATCH(request: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getOwnedPatient(userId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, room, mrn, dob, sex, status, pinned } = body as {
    name?: string;
    room?: string;
    mrn?: string;
    dob?: string;
    sex?: string;
    status?: string;
    pinned?: boolean;
  };

  const updated = await prisma.patient.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(room !== undefined && { room: String(room).trim().toUpperCase() }),
      ...(mrn !== undefined && { mrn: String(mrn).trim() }),
      ...(dob !== undefined && { dob: String(dob) }),
      ...(sex !== undefined && { sex: String(sex) }),
      ...(status !== undefined && { status: String(status) }),
      ...(pinned !== undefined && { pinned: Boolean(pinned) }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getOwnedPatient(userId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.patient.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
