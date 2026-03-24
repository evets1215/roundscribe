/**
 * Optional diarization adapter.
 *
 * Goal for MVP: label transcript with generic speakers (Speaker 1/2/3).
 *
 * For now we keep diarization *text-level* to avoid complex forced alignment.
 * If you have a diarization service that takes audio+transcript and returns segments,
 * we can extend this interface.
 */

export type DiarizedSegment = {
  speaker: "Speaker 1" | "Speaker 2" | "Speaker 3";
  text: string;
  startSec?: number;
  endSec?: number;
};

export interface DiarizerAdapter {
  diarize(transcript: string, opts?: { maxSpeakers?: 3 }): Promise<{ segments: DiarizedSegment[] }>;
}

class NoopDiarizer implements DiarizerAdapter {
  async diarize(transcript: string, _opts?: { maxSpeakers?: 3 }): Promise<{ segments: DiarizedSegment[] }> {
    return { segments: [{ speaker: "Speaker 1", text: transcript }] };
  }
}

class HttpDiarizer implements DiarizerAdapter {
  constructor(private readonly endpoint: string, private readonly timeoutMs: number) {}

  async diarize(transcript: string, opts?: { maxSpeakers?: 3 }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, maxSpeakers: opts?.maxSpeakers ?? 3 }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Diarizer HTTP ${res.status}: ${text || res.statusText}`);
      }
      const data = (await res.json()) as { segments?: DiarizedSegment[] };
      if (!Array.isArray(data?.segments)) throw new Error("Diarizer response missing segments[]");
      return { segments: data.segments as DiarizedSegment[] };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createDiarizer(): DiarizerAdapter {
  const enabled = (process.env.DIARIZER_ENABLED ?? "0") === "1";
  if (!enabled) return new NoopDiarizer();

  const endpoint = process.env.DIARIZER_ENDPOINT?.trim();
  const timeoutMs = Number(process.env.DIARIZER_TIMEOUT_MS ?? 30_000);

  if (endpoint) return new HttpDiarizer(endpoint, timeoutMs);

  // For now only HTTP is implemented; CLI can be added once you have a concrete command.
  throw new Error("Diarizer enabled but DIARIZER_ENDPOINT not set");
}

export function renderDiarizedTranscript(segments: DiarizedSegment[]) {
  return segments
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n");
}
