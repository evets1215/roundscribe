import "server-only";

import type { AudioStorage } from "./storage";
import { LocalAudioStorage } from "./storage-local";
import { S3AudioStorage } from "./storage-s3";

export function createAudioStorage(): AudioStorage {
  const backend = (process.env.ROUNDSCRIBE_STORAGE ?? "local").toLowerCase();
  if (backend === "s3") return new S3AudioStorage();
  return new LocalAudioStorage();
}
