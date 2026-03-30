/**
 * /api/patients/[id]/tasks
 *
 * GET    — list tasks for a patient (ordered by sortOrder, createdAt)
 * POST   — create a new task
 * PATCH  — bulk update tasks (status, text, sortOrder, resolution)
 * DELETE — delete a task by id (query param ?taskId=xxx)
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function verifyOwnership(userId: string, patientId: string) {
  if (process.env.NODE_ENV === "development") return true;
  const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
  return !!patient;
}

// ── GET — list tasks ────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: patientId } = await params;
  if (!(await verifyOwnership(userId, patientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tasks = await prisma.handoffTask.findMany({
    where: { patientId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(tasks);
}

// ── POST — create task ──────────────────────────────────────────────────────

export async function POST(req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: patientId } = await params;
  if (!(await verifyOwnership(userId, patientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { text: string; status?: string; source?: string; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const task = await prisma.handoffTask.create({
    data: {
      patientId,
      userId,
      text: body.text,
      status: body.status ?? "pending",
      source: body.source ?? "manual",
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(task, { status: 201 });
}

// ── PATCH — bulk update tasks ───────────────────────────────────────────────

interface TaskPatch {
  id: string;
  text?: string;
  status?: string;
  sortOrder?: number;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedNote?: string | null;
}

export async function PATCH(req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: patientId } = await params;
  if (!(await verifyOwnership(userId, patientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let patches: TaskPatch[];
  try {
    const body = await req.json();
    patches = Array.isArray(body) ? body : [body];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const results = await Promise.all(
    patches.map((p) =>
      prisma.handoffTask.updateMany({
        where: { id: p.id, patientId },
        data: {
          ...(p.text !== undefined && { text: p.text }),
          ...(p.status !== undefined && { status: p.status }),
          ...(p.sortOrder !== undefined && { sortOrder: p.sortOrder }),
          ...(p.resolvedAt !== undefined && { resolvedAt: p.resolvedAt ? new Date(p.resolvedAt) : null }),
          ...(p.resolvedBy !== undefined && { resolvedBy: p.resolvedBy }),
          ...(p.resolvedNote !== undefined && { resolvedNote: p.resolvedNote }),
        },
      }),
    ),
  );

  return NextResponse.json({ updated: results.reduce((sum, r) => sum + r.count, 0) });
}

// ── DELETE — delete a task ──────────────────────────────────────────────────

export async function DELETE(req: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: patientId } = await params;
  if (!(await verifyOwnership(userId, patientId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId query param required" }, { status: 400 });
  }

  const deleted = await prisma.handoffTask.deleteMany({
    where: { id: taskId, patientId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
