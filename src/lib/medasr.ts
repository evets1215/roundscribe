/**
 * MedASR adapter — transcribes medical audio to text.
 *
 * Configured via env vars (one required):
 *   MEDASR_ENDPOINT  HTTP endpoint, e.g. http://localhost:8000/transcribe
 *   MEDASR_CLI       Path to CLI binary, receives a temp audio file path as $1
 *                    and prints the transcript to stdout.
 *   MEDASR_TIMEOUT_MS  Optional request/process timeout in ms (default 30000)
 */

export interface MedASRAdapter {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// HTTP adapter
// ---------------------------------------------------------------------------

class MedASRHttpAdapter implements MedASRAdapter {
  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
  ) {}

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const form = new FormData();
      // Buffer isn't always typed as a valid BlobPart under TS DOM libs; wrap as Uint8Array.
      form.append(
        "audio",
        new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
        "recording.webm",
      );

      const response = await fetch(this.endpoint, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`MedASR HTTP ${response.status}: ${text || response.statusText}`);
      }

      const data = (await response.json()) as { transcript?: string; text?: string };
      const transcript = data.transcript ?? data.text;
      if (typeof transcript !== "string") {
        throw new Error("MedASR response missing 'transcript' or 'text' field");
      }
      return transcript;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI adapter
// ---------------------------------------------------------------------------

class MedASRCliAdapter implements MedASRAdapter {
  constructor(
    private readonly cliPath: string,
    private readonly timeoutMs: number,
  ) {}

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const { spawn } = await import("child_process");
    const { writeFile, unlink } = await import("fs/promises");
    const os = await import("os");
    const path = await import("path");
    const { randomUUID } = await import("crypto");

    const ext = mimeType.includes("webm")
      ? "webm"
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : "audio";
    const tmpPath = path.join(os.tmpdir(), `medasr-${randomUUID()}.${ext}`);

    await writeFile(tmpPath, audioBuffer);

    try {
      return await new Promise<string>((resolve, reject) => {
        const proc = spawn(this.cliPath, [tmpPath], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        const timer = setTimeout(() => {
          proc.kill("SIGTERM");
          reject(new Error(`MedASR CLI timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);

        proc.stdout.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", (d: Buffer) => {
          stderr += d.toString();
        });

        proc.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`MedASR CLI exited ${code}: ${stderr.trim()}`));
          }
        });

        proc.on("error", (err) => {
          clearTimeout(timer);
          reject(new Error(`MedASR CLI error: ${err.message}`));
        });
      });
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMedASRAdapter(): MedASRAdapter {
  const endpoint = process.env.MEDASR_ENDPOINT?.trim();
  const cli = process.env.MEDASR_CLI?.trim();
  const timeoutMs = Number(process.env.MEDASR_TIMEOUT_MS ?? 30_000);

  if (endpoint) return new MedASRHttpAdapter(endpoint, timeoutMs);
  if (cli) return new MedASRCliAdapter(cli, timeoutMs);

  throw new Error(
    "MedASR not configured. Set MEDASR_ENDPOINT (HTTP) or MEDASR_CLI (local binary).",
  );
}
