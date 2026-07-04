#!/usr/bin/env python3
"""LegalHack — Backend Flask (agent RH uniquement)"""

import os, json, subprocess, sys, time
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from flask import Flask, Response, send_file, jsonify, redirect
from flask_cors import CORS
from portail_rh import rh as rh_blueprint

app = Flask(__name__)
CORS(app)
app.register_blueprint(rh_blueprint)

BASE_DIR       = Path(__file__).parent
STATE_FILE     = BASE_DIR / "state.json"
RH_CONFIG_FILE = BASE_DIR / "config_rh.json"

_rh_proc = None


@app.route("/")
def index():
    return redirect("/rh")

@app.route("/audit")
def audit():
    return send_file(BASE_DIR / "rh.html")


@app.route("/api/analyze-rh", methods=["POST"])
def analyze_rh():
    global _rh_proc
    if _rh_proc and _rh_proc.poll() is None:
        _rh_proc.terminate()
        try: _rh_proc.wait(timeout=3)
        except subprocess.TimeoutExpired: _rh_proc.kill()

    STATE_FILE.write_text(json.dumps({
        "status": "starting", "step": 0, "total": 40,
        "current_url": None, "current_log": "Démarrage...", "results": [],
    }, ensure_ascii=False, indent=2))

    _rh_proc = subprocess.Popen(
        [sys.executable, str(BASE_DIR / "agent_rh.py"), str(RH_CONFIG_FILE)],
        env={**os.environ}, cwd=str(BASE_DIR)
    )
    return jsonify({"status": "started", "pid": _rh_proc.pid})


@app.route("/api/stream")
def stream():
    def generate():
        while True:
            try:
                state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {"status": "waiting"}
            except Exception:
                state = {"status": "waiting"}
            yield f"data: {json.dumps(state, ensure_ascii=False)}\n\n"
            if state.get("status") in ("done", "error"):
                break
            time.sleep(0.5)
    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/api/stop-rh", methods=["POST"])
def stop_rh():
    global _rh_proc
    if _rh_proc and _rh_proc.poll() is None:
        _rh_proc.terminate()
        return jsonify({"status": "stopped"})
    return jsonify({"status": "not_running"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"LegalHack  →  http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
