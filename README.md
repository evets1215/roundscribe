# Roundscribe

A clinical rounding note tool that captures ambient audio during patient rounds and converts it to structured SOAP notes using MedASR (speech-to-text) and MedGemma (medical language model).

---

## Features

- Record ambient audio during rounds with one click
- Transcribe audio via **MedASR** (HTTP endpoint or local CLI)
- Convert transcripts to trimmed **SOAP notes or bullets** via **MedGemma**
- Insert AI-generated notes directly into the editable note editor
- Swappable model adapters behind environment variables

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure model adapters

Copy the example env file and fill in your model endpoints:

```bash
cp .env.example .env.local
```

Then edit `.env.local`. You must configure **both** MedASR and MedGemma. Each accepts either an HTTP endpoint or a local CLI binary:

```env
# MedASR (speech → transcript)
MEDASR_ENDPOINT=http://localhost:8000/transcribe
# or
MEDASR_CLI=/path/to/medasr-cli

# MedGemma (transcript → structured note)
MEDGEMMA_ENDPOINT=http://localhost:8001/analyze
# or
MEDGEMMA_CLI=/path/to/medgemma-cli
```

#### Adapter interface contracts

**MedASR HTTP** (`MEDASR_ENDPOINT`):
- `POST <endpoint>` with `multipart/form-data`, field `audio` (binary)
- Response: `{ "transcript": "..." }` or `{ "text": "..." }`

**MedASR CLI** (`MEDASR_CLI`):
- Invoked as: `<cli> <path-to-temp-audio-file>`
- Stdout: plain transcript text

**MedGemma HTTP** (`MEDGEMMA_ENDPOINT`):
- `POST <endpoint>` with `Content-Type: application/json`
- Body: `{ "transcript": "...", "patientContext": "patient-id" }`
- Response: JSON matching the `StructuredNote` type (see `src/lib/medgemma.ts`)

**MedGemma CLI** (`MEDGEMMA_CLI`):
- Invoked as: `<cli> [--context <patientId>]`
- Stdin: transcript text
- Stdout: JSON `StructuredNote`, or plain SOAP text (auto-parsed as fallback)

**Optional timeout overrides:**
```env
MEDASR_TIMEOUT_MS=30000    # default 30s
MEDGEMMA_TIMEOUT_MS=60000  # default 60s
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Testing locally

### With mock servers (no real models needed)

In three separate terminals:

```bash
# Terminal 1 — mock MedASR
python scripts/mock-medasr-server.py

# Terminal 2 — mock MedGemma
python scripts/mock-medgemma-server.py

# Terminal 3 — Next.js dev server
# Set .env.local:
#   MEDASR_ENDPOINT=http://localhost:8000/transcribe
#   MEDGEMMA_ENDPOINT=http://localhost:8001/analyze
npm run dev
```

### Manual API test (curl)

```bash
# With an existing audio file
./scripts/test-pipeline.sh http://localhost:3000 /path/to/audio.webm patient-001

# Auto-generate a silent test file (requires ffmpeg)
./scripts/test-pipeline.sh
```

### End-to-end in the browser

1. Open a patient detail page (e.g. `http://localhost:3000/patients/gary-bailey`)
2. Click the microphone FAB (bottom-right of the note editor)
3. Speak, then click **Stop**
4. Click **Transcribe & Analyze**
5. The structured note is inserted into the editor automatically

---

## Architecture

```
Browser
  └─ useAudioRecorder (WebRTC MediaRecorder)
       └─ POST /api/transcribe  (multipart: audio + patientId)
            ├─ MedASR adapter  → transcript
            ├─ MedGemma adapter → StructuredNote (SOAP or bullets)
            └─ notes-store.saveNote() → { noteId, transcript, note }
```

### Key files

| Path | Purpose |
|------|---------|
| `src/lib/medasr.ts` | MedASR adapter (HTTP + CLI) |
| `src/lib/medgemma.ts` | MedGemma adapter (HTTP + CLI) + `StructuredNote` type |
| `src/lib/notes-store.ts` | In-memory note persistence (swap for DB) |
| `src/app/api/transcribe/route.ts` | Server-side pipeline API route |
| `src/app/patients/[id]/page.tsx` | Patient detail page with recording + transcription UI |
| `scripts/mock-medasr-server.py` | Mock MedASR HTTP server (testing) |
| `scripts/mock-medgemma-server.py` | Mock MedGemma HTTP server (testing) |
| `scripts/test-pipeline.sh` | curl-based manual test script |

### Swapping implementations

The adapters are resolved at runtime from env vars. To add a new backend:

1. Implement `MedASRAdapter` or `MedGemmaAdapter` (interfaces in `src/lib/medasr.ts` / `src/lib/medgemma.ts`)
2. Add a new env var check in the respective `createMedASRAdapter()` / `createMedGemmaAdapter()` factory

To persist notes to a real database, replace the in-memory `Map` in `src/lib/notes-store.ts` with a database client while keeping the same exported function signatures.

---

## Production notes

- **Audio size limit**: configured to 50 MB in `next.config.ts` (`serverBodySizeLimit`). Adjust if needed.
- **Runtime**: the `/api/transcribe` route uses `export const runtime = "nodejs"` to ensure `child_process` is available for the CLI adapter.
- **Notes store**: the in-memory store resets on server restart. Replace with Prisma/Drizzle for persistence.
