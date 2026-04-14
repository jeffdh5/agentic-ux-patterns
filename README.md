# genkit-ux-patterns

*Reference patterns for building interactive AI-powered applications with Genkit Python, FastAPI, and Next.js + shadcn.*

> "The most important patterns in LLM app development should fit on one screen."

## How to use this

**Don't clone this repo. Point your coding agent at it.**

When you want to add a pattern to your app, tell your agent:

> "Look at https://github.com/jeffdh5/genkit-ux-patterns/tree/main/patterns/01-streaming-chat and add streaming chat to my application."

The agent reads the sample, understands the pattern, and wires it into your codebase. Each pattern is intentionally minimal — small enough to read in 5 minutes, complete enough to actually work.

## Patterns

| # | Pattern | What it shows |
|---|---------|---------------|
| [01](./patterns/01-streaming-chat) | Streaming Chat | Genkit flow → FastAPI SSE → Next.js hook |
| 02 | Coming soon: Tool Approval & HITL | Interruptible tools, approve/decline/edit UI |
| 03 | Coming soon: Multi-tenant API keys | Per-user model config in Genkit flows |
| 04 | Coming soon: Streaming agent progress | Live status from inside a multi-step flow |

## Philosophy

These are [shadcn](https://ui.shadcn.com/)-style patterns for LLM app architecture — not a framework, not a library. Read the code, understand it, adapt it. Backends are under 80 lines. Frontends are one page + one hook. No magic, no abstractions to fight.

The patterns cover **interactive agentic UX** — the emerging class of AI apps where the agent is present, surfaces decisions in real time, asks clarifying questions, and needs human input mid-task. Not background agents you fire and forget, but applications where the interaction loop is the product.

## Stack

- **Backend**: [Genkit Python](https://github.com/firebase/genkit) + FastAPI
- **Frontend**: Next.js 15, shadcn/ui, TypeScript
- **AI**: Google AI (Gemini) — swap for any Genkit-supported model
- **Deploy**: Cloud Run (Dockerfiles included per pattern)
