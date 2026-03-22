import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import type { AudioStorage, StoredObject } from "./storage";

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export class LocalAudioStorage implements AudioStorage {
  constructor(private readonly baseDir = path.join(os.tmpdir(), "roundscribe-audio")) {}

  async putAudio(params: {
    patientId: string;
    contentType: string;
    bytes: Uint8Array;
    ext?: string;
  }): Promise<StoredObject> {
    const ext = params.ext ?? "webm";
    const patient = safeName(params.patientId || "unknown");
    const dir = path.join(this.baseDir, patient);
    await fs.mkdir(dir, { recursive: true });
    const key = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const fullPath = path.join(dir, key);
    await fs.writeFile(fullPath, params.bytes);
    return { key: `local:${patient}/${key}`, url: `file://${fullPath}` };
  }
}
