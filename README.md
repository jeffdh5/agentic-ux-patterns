# agentic-ux-patterns

*A map of interactive agentic UX patterns for 2026 — built with Genkit Python, FastAPI, and Next.js + shadcn.*

---

Modern AI applications are splitting into two kinds:

**Background agents** — you give a vague prompt, they run for an hour, make decisions on your behalf, come back with a result. Fire and forget.

**Interactive agents** — the agent is present. It asks clarifying questions before starting. It surfaces decisions for approval mid-task. It streams live progress while it works. The interaction loop *is* the product.

This repo covers the second kind. Each pattern is a minimal, working sample of a real interactive UX problem — small enough to read in 5 minutes, complete enough to actually work.

---

## Patterns

| # | Pattern | What it shows |
|---|---------|---------------|
| [01](./patterns/01-streaming-chat) | Streaming Chat | Genkit flow → FastAPI SSE → Next.js hook |
| 02 | Tool Approval & HITL *(coming soon)* | Interruptible tools, approve/decline/edit UI |
| 03 | Multi-tenant API keys *(coming soon)* | Per-user model config in Genkit flows |
| 04 | Streaming agent progress *(coming soon)* | Live status from inside a multi-step flow |

---

## How to use this

**Browse** to understand what's possible. Each pattern folder has a README that explains the problem, shows the core code, and describes when you'd use it.

**Point your coding agent at a pattern** when you're ready to add it to your app:

> *"Look at https://github.com/jeffdh5/genkit-ux-patterns/tree/main/patterns/01-streaming-chat and add streaming chat to my application."*

Antigravity, Cursor, Claude Code — they can all read this repo and wire the pattern into your codebase.

---

## Philosophy

Backends under 80 lines. Frontends: one page + one hook. No framework, no magic — code you can read, own, and adapt. Think [shadcn/ui](https://ui.shadcn.com/) but for LLM app architecture patterns.

**Stack:** Genkit Python · FastAPI · Next.js 15 · shadcn/ui · Google AI (Gemini) · Cloud Run
