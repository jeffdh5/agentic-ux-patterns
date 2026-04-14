# Genkit Python + FastAPI + React Starter

Minimal streaming AI app — Genkit Python flow on FastAPI, streamed to a React frontend.

## Structure

```
backend/   FastAPI + Genkit flow
frontend/  Next.js + shadcn UI
```

## Quickstart

**1. Start the backend:**
```bash
cd backend
export GEMINI_API_KEY=your-key-here
uv venv --python 3.12 .venv && uv pip install -e .
genkit start -- uv run src/main.py
```

**2. Start the frontend:**
```bash
cd frontend
npm install && npm run dev
```

**3. Open http://localhost:3000**

## How it works

- The Genkit flow streams tokens via `ctx.send_chunk()`
- `genkit_fastapi_handler` wraps it as an SSE endpoint
- `useGenkitStream` hook in the frontend reads the `{"message":"..."}` chunks and appends them to state
