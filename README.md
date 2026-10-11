# Zero-Waste Grocery — Freshwise

Freshwise is a zero-waste grocery management prototype for perishable inventory, expiry awareness, transparent demand baselines, and waste reduction.

## Stack
- Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts, Supabase JS
- Backend: Python, FastAPI, Groq SDK, Pandas, scikit-learn
- Data: Supabase PostgreSQL, Auth, RLS
- Deployment later: Vercel + Python API host

## Requirements
Node.js 20.19+ or 22.12+, Python 3.11+, Git, Supabase project, Groq API key.

## Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```
On Windows PowerShell use `Copy-Item .env.example .env.local` instead of `cp`.

The frontend includes overview, inventory, expiry, demand baseline, AI assistant, reports, and settings pages. Demo inventory and preferences are stored in the current browser's local storage and are not sent to Supabase. The inventory CSV export contains the local demo catalog.

The moving-average forecast is illustrative demo data, not a trained model or a real store prediction. Waste events are not connected; waste avoided and realized savings are therefore not reported as actual outcomes. Potential markdown recovery is explicitly labeled an estimate.

The AI assistant calls the existing `/api/v1/copilot/answer` endpoint. That endpoint currently requires trusted, server-queried inventory context which is not implemented yet. If it is unavailable or rejects the request, the UI clearly switches to non-AI demo guidance; it does not send local browser inventory as trusted context.

There is no production inventory API or Supabase mutation policy in the current scaffold. Do not use browser-local demo inventory as operational store data.

Build and type-check the frontend with:
```bash
npm run build
```

## Backend
```bash
cd backend
python -m venv .venv
```
Windows: ` .\.venv\Scripts\Activate.ps1 `; macOS/Linux: `source .venv/bin/activate`.
```bash
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
Health: http://127.0.0.1:8000/health · API docs: http://127.0.0.1:8000/docs

## Supabase
Open Supabase SQL Editor and run `supabase/migrations/0001_initial_schema.sql`. Review and tighten RLS before any real customer data or multi-store deployment.

## Secrets
Frontend `.env.local` may contain only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL`. Backend `.env` contains `GROQ_API_KEY`, `SUPABASE_URL`, and optional server-only Supabase service key. Never use `VITE_` for Groq/service-role secrets. Never commit `.env` files.

## Build order
1. Start frontend/API and configure Supabase.
2. Seed demo stores/products/batches.
3. Implement inventory movements and server-side inventory queries.
4. Implement moving-average forecast and spoilage heuristic.
5. Build specialist agent proposals + orchestrator + planner approval.
6. Add bundles, consent-checked simulated campaigns, copilot and donation/disposal.
7. Compare agent results against baseline forecasting/rules.

## Safety/data rules
Inventory must be tracked by batch and expiry; barcode alone may not identify a batch expiry. Every receipt, sale, transfer, waste, donation and correction needs a stock movement/audit trail. Expired/unsafe food must not be donated for consumption. Customer targeting must check channel/purpose consent and opt-outs. AI proposals require manager approval. Use server-side queried data to ground Groq answers; never trust client-provided stock facts. Label heuristic confidence honestly.
