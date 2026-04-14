# Instructions for Coding Agents

You are working in the **genkit-ux-patterns** repository. This repo contains minimal, copy-pasteable patterns for building interactive AI applications with Genkit Python, FastAPI, and Next.js.

## Repository structure

```
patterns/
  NN-pattern-name/
    backend/       Genkit Python + FastAPI
    frontend/      Next.js + shadcn/ui
    README.md      Pattern documentation
README.md          Repository overview
AGENTS.md          This file
```

## Working with patterns

### Each pattern lives in `patterns/NN-name/`
- `backend/` contains the Genkit Python flow and FastAPI server
- `frontend/` contains the Next.js application
- `README.md` documents the pattern with code examples and deployment instructions

### To add a new pattern

1. Create the folder: `patterns/NN-descriptive-name/` (use zero-padded numbers: 01, 02, etc.)
2. Add `backend/` subfolder with:
   - `src/main.py` — the Genkit flow and FastAPI app
   - `pyproject.toml` and `uv.lock` — Python dependencies
3. Add `frontend/` subfolder with:
   - `src/app/page.tsx` — the main UI
   - `src/hooks/` — custom hooks for interacting with the backend
   - Standard Next.js structure
4. Write `README.md` following the same structure as `01-streaming-chat`:
   - One paragraph describing what the pattern demonstrates
   - **The pattern** section with full code blocks (backend + frontend hook)
   - **Deploy to Cloud Run** section with Dockerfiles and `gcloud run deploy` commands
   - **Run locally** section
   - **Extend this** section (2-3 sentences)

## Code style and constraints

### Keep it minimal
- **Backends**: Target under 80 lines for `main.py`
- **Frontends**: One `page.tsx` + one custom hook
- No unnecessary abstractions
- No utility files unless essential

### Dependencies
- **Backend**: Only add dependencies if they're essential to the pattern
- **Frontend**: Prefer shadcn/ui components; avoid heavy libraries
- Never add dependencies for features not core to the pattern

### Documentation
- Code should be self-explanatory
- Add comments only where the logic is non-obvious
- README should show the full pattern code, not just snippets

## Pattern philosophy

These are **shadcn-style patterns**, not a framework:
- Users copy the pattern into their project
- Users own the code and can modify it freely
- Patterns demonstrate one core concept clearly
- No magic, no hidden abstractions

## When modifying existing patterns

- Preserve the minimal style
- Don't add features "just in case"
- If a change makes `main.py` significantly longer, consider if it belongs in a separate pattern
- Update the README to reflect any changes to the code

## Questions to ask yourself

Before adding code:
- Is this essential to demonstrating the pattern?
- Could a user easily add this themselves if needed?
- Does this make the pattern harder to understand?

If the answer to any of these is "yes" to the last two, don't add it.
