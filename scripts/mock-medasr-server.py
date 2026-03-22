#!/usr/bin/env python3
"""
Mock MedASR HTTP server for local testing.
Accepts a multipart audio file and returns a dummy transcript.

Usage:
    python scripts/mock-medasr-server.py [port]
    # Default port: 8000

Then set in .env.local:
    MEDASR_ENDPOINT=http://localhost:8000/transcribe
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

MOCK_TRANSCRIPT = (
    "Patient Gary Bailey, 75-year-old male, room 402-A. "
    "Patient reports mild laryngeal discomfort overnight, rating pain 3 out of 10. "
    "Sleep improved. No new complaints. "
    "Hemoglobin stable at 8.2, no transfusion needed today. "
    "Plan to titrate oxycodone to 10mg for better pain control. "
    "Restart rivaroxaban today now that biopsy is complete. "
    "Discharge planning ongoing, family updated."
)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/transcribe":
            self.send_error(404, "Not found")
            return

        # Read body (we don't actually process the audio)
        length = int(self.headers.get("Content-Length", 0))
        _ = self.rfile.read(length)

        body = json.dumps({"transcript": MOCK_TRANSCRIPT}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[mock-medasr] {fmt % args}")


print(f"[mock-medasr] Listening on http://localhost:{PORT}/transcribe")
HTTPServer(("", PORT), Handler).serve_forever()
