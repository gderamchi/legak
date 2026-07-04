#!/usr/bin/env python3
"""
LegalHack — Backend Flask
Usage: GOOGLE_API_KEY=... python server.py
"""

import os
import json
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from flask import Flask, request, Response, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).parent
STATE_FILE = BASE_DIR / "state.json"
CONFIG_FILE = BASE_DIR / "config.json"

_agent_proc = None


@app.route("/")
def index():
    return send_file(BASE_DIR / "index.html")


@app.route("/documents")
def documents():
    return send_file(BASE_DIR / "documents.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    global _agent_proc

    # Kill any running agent
    if _agent_proc and _agent_proc.poll() is None:
        _agent_proc.terminate()
        try:
            _agent_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            _agent_proc.kill()

    data = request.get_json(force=True, silent=True) or {}
    sujet = data.get("sujet", "").strip()
    urls = data.get("urls", [])

    if not sujet:
        return jsonify({"error": "Le champ 'sujet' est requis"}), 400
    if isinstance(urls, str):
        urls = [u.strip() for u in urls.splitlines() if u.strip()]
    if not urls:
        return jsonify({"error": "Au moins une URL est requise"}), 400

    CONFIG_FILE.write_text(
        json.dumps({"sujet": sujet, "urls": urls}, ensure_ascii=False, indent=2)
    )
    STATE_FILE.write_text(
        json.dumps({
            "status": "starting",
            "current_log": "Demarrage...",
            "total": len(urls),
            "done": 0,
            "results": []
        }, ensure_ascii=False)
    )

    env = {**os.environ}
    _agent_proc = subprocess.Popen(
        [sys.executable, str(BASE_DIR / "agent.py"), str(CONFIG_FILE)],
        env=env,
        cwd=str(BASE_DIR)
    )

    return jsonify({"status": "started", "pid": _agent_proc.pid, "url_count": len(urls)})


@app.route("/api/stream")
def stream():
    def generate():
        while True:
            try:
                state = (
                    json.loads(STATE_FILE.read_text())
                    if STATE_FILE.exists()
                    else {"status": "waiting"}
                )
            except Exception:
                state = {"status": "waiting"}

            yield f"data: {json.dumps(state, ensure_ascii=False)}\n\n"

            if state.get("status") in ("done", "error"):
                break
            time.sleep(0.5)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


@app.route("/api/results")
def results():
    if not STATE_FILE.exists():
        return jsonify({"status": "no_data"})
    try:
        return jsonify(json.loads(STATE_FILE.read_text()))
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/stop", methods=["POST"])
def stop():
    global _agent_proc
    if _agent_proc and _agent_proc.poll() is None:
        _agent_proc.terminate()
        return jsonify({"status": "stopped"})
    return jsonify({"status": "not_running"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    key_ok = bool(os.environ.get("GOOGLE_API_KEY"))
    print(f"LegalHack Server  →  http://localhost:{port}")
    print(f"GOOGLE_API_KEY    →  {'definie OK' if key_ok else 'MANQUANTE - export GOOGLE_API_KEY=...'}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
