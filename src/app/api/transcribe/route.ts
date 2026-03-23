/**
 * POST /api/transcribe
 *
 * Accepts a multipart/form-data body with:
 *   audio     File   — audio recording (webm, mp4, etc.)
 *   patientId string — (optional) patient DB id; used to associate the note
 *
 * Pipeline:
 *   1. Parse audio from form data
 *   2. Store audio (local or S3 + KMS)
 *   3. MedASR: audio → transcript
 *   4. Diarizer: optional speaker labelling
 *   5. MedGemma: transcript → structured note (SOAP or bullets)
 *   6. Persist AudioRecording + Note in Postgres
 *   7. Write AuditLog entry
 *
 * Returns:
 *   200 { noteId, transcript, note }
 *   400 validation error
 *   500 pipeline error
 *   503 adapter not configured
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMedASRAdapter } from "@/lib/medasr";
import { generateNote } from "@/lib/claude";
import { createAudioStorage } from "@/lib/storage-factory";
import { createDiarizer, renderDiarizedTranscript } from "@/lib/diarizer";

// Ensure this route runs in the Node.js runtime so child_process is available
export const runtime = "nodejs";

export async function POST(request: Request) {
  // -------------------------------------------------------------------------
  // 0. Auth check
  // -------------------------------------------------------------------------
  const session = await auth();
  const userId =
    session?.user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-user" : null);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // 1. Parse multipart form data
  // -------------------------------------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 });
  }

  const audioFile = formData.get("audio");
  if (!(audioFile instanceof File) || audioFile.size === 0) {
    return NextResponse.json(
      { error: "Missing or empty 'audio' field in form data" },
      { status: 400 },
    );
  }

  const patientId = (formData.get("patientId") as string | null) ?? undefined;
  const previousNote = (formData.get("previousNote") as string | null) ?? undefined;

  const isDev = process.env.NODE_ENV === "development";

  // If a patientId is provided, verify the current user owns it (skip in dev)
  if (patientId && !isDev) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, userId } });
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
  }

  const storage = createAudioStorage();
  const diarizer = createDiarizer();

  // -------------------------------------------------------------------------
  // 2. Resolve adapters (fail fast if env vars are missing)
  // -------------------------------------------------------------------------
  let medasr;

  try {
    medasr = createMedASRAdapter();
  } catch (err) {
    return NextResponse.json(
      { error: `MedASR adapter: ${(err as Error).message}` },
      { status: 503 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set." },
      { status: 503 },
    );
  }

  // -------------------------------------------------------------------------
  // 3. Store audio + Transcribe with MedASR
  // -------------------------------------------------------------------------
  let transcript: string;
  let audioKey: string | undefined;
  const mimeType = audioFile.type || "audio/webm";

  try {
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    const stored = await storage.putAudio({
      patientId: patientId ?? "unknown",
      contentType: mimeType,
      bytes: new Uint8Array(buffer),
    });
    audioKey = stored.key;

    // Persist AudioRecording row if we have a real patient (skip in dev — no DB)
    if (patientId && !isDev) {
      await prisma.audioRecording.create({
        data: {
          patientId,
          storageKey: audioKey,
          mimeType,
          sizeBytes: audioFile.size,
        },
      });
    }

    transcript = await medasr.transcribe(buffer, mimeType);
  } catch (err) {
    console.error("[transcribe] MedASR/storage error:", err);
    return NextResponse.json(
      { error: `Transcription failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // -------------------------------------------------------------------------
  // 4. (Optional) diarize transcript then analyze with Claude
  // -------------------------------------------------------------------------
  let note;
  let diarizedTranscript: string | undefined;
  try {
    const diarized = await diarizer.diarize(transcript, { maxSpeakers: 3 });
    diarizedTranscript = renderDiarizedTranscript(diarized.segments);
    note = await generateNote(diarizedTranscript, patientId ?? "unknown", previousNote);
  } catch (err) {
    console.error("[transcribe] Claude/diarizer error:", err);
    return NextResponse.json(
      { error: `Analysis failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // -------------------------------------------------------------------------
  // 5. Persist Note in DB (and update patient status if applicable)
  // -------------------------------------------------------------------------
  let dbNoteId: string;
  if (!isDev && patientId) {
    try {
      const dbNote = await prisma.note.create({
        data: {
          patientId,
          transcript,
          noteJson: note as object,
          audioKey,
        },
      });
      dbNoteId = dbNote.id;

      await prisma.patient.updateMany({
        where: { id: patientId, status: "Pending" },
        data: { status: "In Progress" },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          patientId,
          action: "note.create",
          details: { noteId: dbNote.id, audioKey },
        },
      });
    } catch (err) {
      console.error("[transcribe] DB persist error:", err);
      return NextResponse.json(
        { error: `Failed to persist note: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  } else {
    // Dev mode or no patient — generate a transient id, skip DB
    dbNoteId = crypto.randomUUID();
  }

  return NextResponse.json({
    noteId: dbNoteId,
    transcript,
    diarizedTranscript,
    audioKey,
    note,
  });
}
