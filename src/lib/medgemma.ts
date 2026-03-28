/**
 * MedGemma adapter — converts a medical transcript into a trimmed structured note.
 *
 * Configured via env vars (one required):
 *   MEDGEMMA_ENDPOINT   HTTP endpoint, e.g. http://localhost:8001/analyze
 *   MEDGEMMA_CLI        Path to CLI binary; transcript is written to stdin,
 *                       JSON StructuredNote (or plain SOAP text) on stdout.
 *   MEDGEMMA_TIMEOUT_MS Optional request/process timeout in ms (default 60000)
 *
 * Expected HTTP request body  : { transcript: string, patientContext?: string }
 * Expected HTTP response body : StructuredNote (see below)
 *
 * Expected CLI stdin  : raw transcript text
 * Expected CLI stdout : JSON StructuredNote, OR plain SOAP-formatted text
 */

/** One changed (or unchanged) problem section in a diff note */
export interface ProblemChange {
  label: string;
  changed: boolean;
  /** Original text from the prior note (line-break separated items) */
  before: string;
  /** Updated text after rounds (line-break separated items) */
  after: string;
}

export interface NoteSection {
  changed: boolean;
  before: string;
  after: string;
}

export interface StructuredNote {
  /** Output format produced by the model */
  format: "SOAP" | "bullets" | "problem-diff";
  /** SOAP sections (present when format === "SOAP") */
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  /** Bullet list lines (present when format === "bullets") */
  bullets?: string[];
  /** Problem-diff sections (present when format === "problem-diff") */
  problems?: ProblemChange[];
  subjective_section?: NoteSection;
  social_section?: NoteSection;
  /** Full raw text returned by the model */
  rawText: string;
  /** Surgical ops used to produce rawText (present when format === "SOAP" via handoff) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ops?: any[];
}

export interface MedGemmaAdapter {
  analyze(transcript: string, patientContext?: string): Promise<StructuredNote>;
}

// ---------------------------------------------------------------------------
// HTTP adapter
// ---------------------------------------------------------------------------

class MedGemmaHttpAdapter implements MedGemmaAdapter {
  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
  ) {}

  async analyze(transcript: string, patientContext?: string): Promise<StructuredNote> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, patientContext }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`MedGemma HTTP ${response.status}: ${text || response.statusText}`);
      }

      const data = await response.json();
      return data as StructuredNote;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI adapter
// ---------------------------------------------------------------------------

class MedGemmaCliAdapter implements MedGemmaAdapter {
  constructor(
    private readonly cliPath: string,
    private readonly timeoutMs: number,
  ) {}

  async analyze(transcript: string, patientContext?: string): Promise<StructuredNote> {
    const { spawn } = await import("child_process");

    return new Promise<StructuredNote>((resolve, reject) => {
      const args = patientContext ? ["--context", patientContext] : [];
      const proc = spawn(this.cliPath, args, { stdio: ["pipe", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`MedGemma CLI timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });

      proc.stdin.write(transcript, "utf8");
      proc.stdin.end();

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`MedGemma CLI exited ${code}: ${stderr.trim()}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim()) as StructuredNote);
        } catch {
          // Not valid JSON — try to parse as plain SOAP text
          resolve(parseSoapOrBullets(stdout.trim()));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`MedGemma CLI error: ${err.message}`));
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Text parser fallback (plain SOAP text → StructuredNote)
// ---------------------------------------------------------------------------

function parseSoapOrBullets(text: string): StructuredNote {
  const sectionRe = /^(subjective|objective|assessment|plan)\s*:?\s*/im;

  if (sectionRe.test(text)) {
    // Split on section headers
    const parts = text.split(/(?=\n(?:subjective|objective|assessment|plan)\s*:?\s)/i);
    const sections: Record<string, string> = {};

    for (const part of parts) {
      const m = part.match(/^(subjective|objective|assessment|plan)\s*:?\s*/i);
      if (m) {
        sections[m[1].toLowerCase()] = part.slice(m[0].length).trim();
      }
    }

    if (Object.keys(sections).length >= 2) {
      return {
        format: "SOAP",
        subjective: sections.subjective,
        objective: sections.objective,
        assessment: sections.assessment,
        plan: sections.plan,
        rawText: text,
      };
    }
  }

  // Fall back to bullet list
  const bullets = text
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);

  return { format: "bullets", bullets, rawText: text };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMedGemmaAdapter(): MedGemmaAdapter {
  const endpoint = process.env.MEDGEMMA_ENDPOINT?.trim();
  const cli = process.env.MEDGEMMA_CLI?.trim();
  const timeoutMs = Number(process.env.MEDGEMMA_TIMEOUT_MS ?? 60_000);

  if (endpoint) return new MedGemmaHttpAdapter(endpoint, timeoutMs);
  if (cli) return new MedGemmaCliAdapter(cli, timeoutMs);

  throw new Error(
    "MedGemma not configured. Set MEDGEMMA_ENDPOINT (HTTP) or MEDGEMMA_CLI (local binary).",
  );
}
