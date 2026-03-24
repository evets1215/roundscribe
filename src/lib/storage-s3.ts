import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import type { AudioStorage, StoredObject } from "./storage";

function env(name: string) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : undefined;
}

function guessExt(contentType: string) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("m4a")) return "m4a";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("wav")) return "wav";
  return "bin";
}

export class S3AudioStorage implements AudioStorage {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly kmsKeyId?: string;
  private readonly prefix: string;

  constructor() {
    const region = env("AWS_REGION") ?? env("AWS_DEFAULT_REGION") ?? "us-east-1";
    this.bucket = env("ROUNDSCRIBE_S3_BUCKET") ?? "";
    if (!this.bucket) throw new Error("Missing env ROUNDSCRIBE_S3_BUCKET");

    this.kmsKeyId = env("ROUNDSCRIBE_KMS_KEY_ID");
    this.prefix = env("ROUNDSCRIBE_S3_PREFIX") ?? "audio";

    this.s3 = new S3Client({ region });
  }

  async putAudio(params: {
    patientId: string;
    contentType: string;
    bytes: Uint8Array;
    ext?: string;
  }): Promise<StoredObject> {
    const ext = params.ext ?? guessExt(params.contentType);
    const patient = (params.patientId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const key = `${this.prefix}/${patient}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(params.bytes),
        ContentType: params.contentType,
        ...(this.kmsKeyId
          ? { ServerSideEncryption: "aws:kms" as const, SSEKMSKeyId: this.kmsKeyId }
          : { ServerSideEncryption: "AES256" as const }),
      },
    });

    await upload.done();

    return { key };
  }
}
