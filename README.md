# genkit-ux-patterns

*Minimal, copy-pasteable patterns for interactive agentic UX — built with Genkit Python, FastAPI, and Next.js + shadcn.*

> "The most important patterns in LLM app development should fit on one screen."

## What this is

A collection of self-contained patterns for building interactive AI-powered applications. Each pattern is a working sample you can copy into your project or point a coding agent at. These are production-ready building blocks that demonstrate how to handle the trickiest parts of agentic UX: streaming responses, tool approvals, interruptions, multi-step workflows, and real-time feedback.

## Patterns

| # | Pattern | What it shows |
|---|---------|---------------|
| 01 | [Streaming Chat](./patterns/01-streaming-chat) | Genkit flow → FastAPI SSE → Next.js hook |
| 02 | Coming soon: Tool Approval & HITL | Interruptible tools, approve/decline/edit UI |
| 03 | Coming soon: Multi-tenant API keys | Per-user model config in Genkit flows |
| 04 | Coming soon: Streaming agent progress | Live status from inside a multi-step flow |

## Philosophy

These are shadcn-style patterns, not a framework. You own the code. Each pattern lives in its own folder with a complete backend and frontend. The code is intentionally minimal — backends target under 80 lines for the core logic, frontends are one page + one hook. Copy the pattern into your project, point your coding agent at it, and adapt it to your needs. No abstractions to fight, no magic to debug.

## Stack

- **Backend**: Genkit Python for AI orchestration, FastAPI for HTTP/SSE endpoints
- **Frontend**: Next.js 15 (App Router), shadcn/ui components, TypeScript
- **AI**: Google AI (Gemini 2.0 Flash) — swap for any Genkit-supported model
- **Deploy**: Cloud Run ready (Dockerfiles included)

## Getting started

1. Clone a pattern: `cp -r patterns/01-streaming-chat my-project`
2. Set up the backend: `cd my-project/backend && uv run python src/main.py`
3. Set up the frontend: `cd my-project/frontend && npm install && npm run dev`
4. Point your coding agent at the pattern folder and describe what to build

Each pattern's README includes full deployment instructions for Google Cloud Run.
