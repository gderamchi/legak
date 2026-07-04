# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Legak is a Google DeepMind–track hackathon MVP (RAISE 2026) for **French employment
due diligence in M&A**. The thesis, encoded throughout the code: the LLM reads and
drafts; deterministic code verifies, calculates, and concludes; a human expert
arbitrates and signs. Findings must always link back to an exact source passage —
never a generic RAG answer.

The repo contains **two independent sub-projects** that do not share a build or
runtime. Know which one a task belongs to before touching anything.

### 1. Root — React landing/demo (`src/`, `server/`)
A single-page React 19 + Vite + TypeScript site (`src/App.tsx`) that pitches the
product and replays a scripted audit. All findings, files, and checks are
hard-coded arrays in `App.tsx` — this is a demo surface, not a live engine.

`server/index.mjs` is an optional zero-dependency Node HTTP API (no Express). It
serves a hard-coded `demoAudit` and, if a Gemini key is present, runs it through a
`geminiSummary` adapter via `@google/genai`. Without a key it stays in `demo` mode
(`/api/health` reports the mode). Endpoints: `GET /api/health`, `POST /api/run-diligence`.

### 2. `agent-python/` — the active work (Gemini Computer Use crawler)
This is where current development happens (branch `saturne/agent-crawler`). It is a
**Python** project, unrelated to the root Node/React app. It has three moving parts:

- **`portail_rh.py`** — a fictional French HR portal ("NOVA RH") served as a Flask
  Blueprint. Pure server-rendered multi-page HTML (login → dashboard → employés →
  fiche → bulletins → prévoyance → congés → documents), **no API**. It is the
  navigation target for the agent. It deliberately embeds **4 labor-law compliance
  anomalies** (documented in the module docstring): sub-SMIC salary, unpaid
  overtime, double-charged mutuelle, and cadres missing the mandatory 1.50% TA
  prévoyance coverage. All data is fictional placeholder data — keep it that way.
- **`agent_rh.py`** — the Computer Use agent loop. Drives a Playwright Chromium
  browser using Gemini's **Interactions API** (`client.interactions.create` with the
  `computer_use` browser tool). Screenshots go to the model; the model returns
  `function_call` steps (click/type/scroll/navigate/…) that are executed against the
  page. Runs as a standalone script: `python3 agent_rh.py config_rh.json`.
- **`server.py`** — Flask backend that hosts the portal (registers the `rh`
  Blueprint), serves the audit UI (`rh.html`), and orchestrates the agent as a
  subprocess with live progress via SSE.

## Commands

### Root (React app)
```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build
npm run lint       # oxlint (NOT eslint) — config in .oxlintrc.json
npm run api        # node server/index.mjs, reads .env if present (port 8787)
```
There is no test suite. Lint is `oxlint`.

### agent-python (Gemini crawler)
```bash
cd agent-python
pip install -r requirements.txt
playwright install chromium          # one-time browser download

python3 server.py                    # Flask app on :5000 (portal + audit UI)
# then open http://localhost:5000/rh  (portal) or /audit (agent dashboard)

./run.sh                             # sources .env, runs agent_rh.py against config_rh.json
```

## Key runtime details & conventions

- **Two different env-var names for the same secret.** The root Node server accepts
  `GEMINI_API_KEY` or `GOOGLE_API_KEY`. `agent_rh.py` reads **only `GOOGLE_API_KEY`**
  and hard-exits if it is missing. `.env` lives at repo root (root app) and in
  `agent-python/.env` (the Python side loads `agent-python/.env` explicitly). `.env`
  is gitignored; `.env.example` documents the keys.
- **Model is `gemini-3.5-flash`** for Computer Use (set in `config_rh.json`), while
  the root demo server defaults to `gemini-2.5-flash`. See `agent-python/ComputerUse.md`
  for the Interactions API + Computer Use reference used to build the agent loop.
- **Agent ↔ UI communication is file-based, not in-memory.** `agent_rh.py` writes
  progress to `agent-python/state.json` (atomic write via `state.json.tmp` +
  rename). `server.py`'s `/api/stream` tails that file and pushes it over SSE every
  0.5s until `status` is `done`/`error`. `state.json` is gitignored. Step
  screenshots are written to `agent-python/screenshots/step_NNN.png` (these *are*
  committed and form the demo replay).
- **Coordinate denormalization.** Gemini returns coordinates in a 0–1000 space; the
  agent maps them to the fixed `1440×900` viewport (`denormalize_x/y`). Changing the
  viewport means updating those constants.
- **The agent config is `config_rh.json`**: `mission_text`, `start_url`, `max_steps`,
  `model`, `headless`. `server.py` launches the agent with this file hard-coded.
- The Python codebase and portal content are **in French** (comments, UI, HR
  domain). Product *output* is intended to be English per the product thesis, but
  match the existing language of the file you edit.

## Docs

`docs/business-plan.md` and `docs/gtm.md` hold product/GTM context. `README.md`
covers the root app run instructions and the DeepMind primitive framing.
