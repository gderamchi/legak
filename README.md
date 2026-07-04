# Legak

Legak is a Google DeepMind-track MVP for French employment due diligence in M&A.

The product ingests an employment data room, runs dated legal controls, prices
hidden employment liabilities, and links every conclusion back to the source
document. Source documents can be English or French; product output is English.
The model reads and drafts. Deterministic code verifies, calculates, and
concludes. The expert arbitrates and signs.

## Demo scope

- Vertical: French pre-acquisition employment due diligence.
- First checks: provident scheme proof, vehicle benefit time-travel, missing
  URSSAF evidence.
- Core demo gesture: click a red flag, open the cited source passage, produce a
  deal clause.
- Hackathon constraint: public repo, no dashboard-first product, no basic RAG.

## Google DeepMind primitive

The MVP is designed around Gemini as a load-bearing workflow primitive:

- Interactions API / Antigravity: mission memory and resumable audit state.
- Gemini Computer Use: data-room navigation and source-passage opening.
- Gemini Live Translate: optional seller call capture that creates request-list
  items while the audit state is running.

The current backend runs in demo mode without secrets. Add Google credentials to
activate the Gemini summary adapter.

## Run locally

```bash
npm install
npm run dev
```

Optional API server:

```bash
cp .env.example .env
npm run api
curl -s http://localhost:8787/api/health
curl -s -X POST http://localhost:8787/api/run-diligence \
  -H 'content-type: application/json' \
  -d '{"target":"Syntec SME","period":"2023-2026"}'
```

## Environment

```bash
GEMINI_API_KEY=
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
PORT=8787
```

## Audit rule base

The business logic that runs after Computer Use (audit pipeline, deliverable
contracts, risk scoring, per-vertical checklists, red flag rules, dated
parameters, data model) lives in [docs/audit/](docs/audit/README.md).

## Business plan

See [docs/business-plan.md](docs/business-plan.md) and
[docs/gtm.md](docs/gtm.md).
