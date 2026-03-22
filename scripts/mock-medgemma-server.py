#!/usr/bin/env python3
"""
Mock MedGemma HTTP server for local testing.
Accepts JSON { transcript, patientContext? } and returns a dummy StructuredNote.

Usage:
    python scripts/mock-medgemma-server.py [port]
    # Default port: 8001

Then set in .env.local:
    MEDGEMMA_ENDPOINT=http://localhost:8001/analyze
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8001

MOCK_NOTE = {
    "format": "SOAP",
    "subjective": "Patient reports mild laryngeal discomfort (3/10). Sleep improved. No new complaints.",
    "objective": "Hemoglobin 8.2 g/dL (stable). Vitals within normal limits.",
    "assessment": (
        "1. Laryngeal carcinoma — pain sub-optimally controlled on current regimen.\n"
        "2. Anemia — stable, no transfusion required today.\n"
        "3. HTN/pAF — biopsy complete, anticoagulation can resume."
    ),
    "plan": (
        "1. Titrate oxycodone to 10 mg for improved pain control.\n"
        "2. Continue monitoring hemoglobin; no transfusion today.\n"
        "3. Restart rivaroxaban today.\n"
        "4. Continue discharge planning; update family."
    ),
    "rawText": (
        "Subjective: Patient reports mild laryngeal discomfort (3/10). Sleep improved.\n\n"
        "Objective: Hgb 8.2 (stable).\n\n"
        "Assessment: Laryngeal carcinoma, Anemia stable, HTN/pAF post-biopsy.\n\n"
        "Plan: Titrate oxycodone 10mg, restart rivaroxaban, discharge planning ongoing."
    ),
}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/analyze":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
            print(f"[mock-medgemma] Received transcript ({len(payload.get('transcript', ''))} chars)")
        except Exception:
            pass

        body = json.dumps(MOCK_NOTE).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[mock-medgemma] {fmt % args}")


print(f"[mock-medgemma] Listening on http://localhost:{PORT}/analyze")
HTTPServer(("", PORT), Handler).serve_forever()
