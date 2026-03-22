#!/usr/bin/env bash
# Manual integration test for the MedASR + MedGemma transcription pipeline.
#
# Prerequisites:
#   - Next.js dev server running: npm run dev
#   - MEDASR_ENDPOINT or MEDASR_CLI set in .env.local
#   - MEDGEMMA_ENDPOINT or MEDGEMMA_CLI set in .env.local
#
# Usage:
#   ./scripts/test-pipeline.sh [BASE_URL] [AUDIO_FILE] [PATIENT_ID]
#
# Defaults:
#   BASE_URL   = http://localhost:3000
#   AUDIO_FILE = <generated silent webm> (requires ffmpeg)
#   PATIENT_ID = test-patient-001

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
PATIENT_ID="${3:-test-patient-001}"
ENDPOINT="${BASE_URL}/api/transcribe"

# ---------------------------------------------------------------------------
# Resolve audio file
# ---------------------------------------------------------------------------
if [[ -n "${2:-}" && -f "$2" ]]; then
  AUDIO_FILE="$2"
  CLEANUP_AUDIO=false
else
  # Generate 3s of silence as a minimal webm for testing
  TMP_AUDIO="$(mktemp /tmp/test-audio-XXXXXX.webm)"
  CLEANUP_AUDIO=true

  if command -v ffmpeg &>/dev/null; then
    echo "[test] Generating 3s silent audio with ffmpeg → $TMP_AUDIO"
    ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 3 -c:a libopus -y "$TMP_AUDIO" -loglevel quiet
  else
    echo "[WARN] ffmpeg not found — creating a stub 1-byte file (MedASR may error)."
    echo -n "x" > "$TMP_AUDIO"
  fi

  AUDIO_FILE="$TMP_AUDIO"
fi

echo ""
echo "=========================================="
echo " Roundscribe pipeline test"
echo "=========================================="
echo "  Endpoint  : $ENDPOINT"
echo "  Audio     : $AUDIO_FILE ($(wc -c < "$AUDIO_FILE" | tr -d ' ') bytes)"
echo "  Patient   : $PATIENT_ID"
echo ""

# ---------------------------------------------------------------------------
# POST to /api/transcribe
# ---------------------------------------------------------------------------
HTTP_STATUS=$(
  curl -s -o /tmp/transcribe-response.json -w "%{http_code}" \
    -X POST "$ENDPOINT" \
    -F "audio=@${AUDIO_FILE};type=audio/webm" \
    -F "patientId=${PATIENT_ID}"
)

echo "HTTP status: $HTTP_STATUS"
echo ""
echo "Response body:"
# Pretty-print JSON if python3 available
if command -v python3 &>/dev/null; then
  python3 -m json.tool /tmp/transcribe-response.json 2>/dev/null || cat /tmp/transcribe-response.json
else
  cat /tmp/transcribe-response.json
fi
echo ""

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
if [[ "$CLEANUP_AUDIO" == "true" ]]; then
  rm -f "$AUDIO_FILE"
fi

if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "[PASS] Pipeline returned 200."
  exit 0
else
  echo "[FAIL] Pipeline returned HTTP $HTTP_STATUS."
  exit 1
fi
