/**
 * GET  /api/patients  — list all patients for the authenticated user
 * POST /api/patients  — create a new patient
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patients = await prisma.patient.findMany({
    where: { userId },
    orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(patients);
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; room?: string; mrn?: string; dob?: string; sex?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, room, mrn, dob, sex } = body;
  if (!name?.trim() || !room?.trim() || !mrn?.trim()) {
    return NextResponse.json({ error: "name, room, and mrn are required" }, { status: 400 });
  }
  if (!/^\d+$/.test(mrn.trim())) {
    return NextResponse.json({ error: "mrn must be numeric" }, { status: 400 });
  }

  const patient = await prisma.patient.create({
    data: {
      name: name.trim(),
      room: room.trim().toUpperCase(),
      mrn: mrn.trim(),
      dob: dob ?? "",
      sex: sex ?? "M",
      userId,
    },
  });

  return NextResponse.json(patient, { status: 201 });
}
