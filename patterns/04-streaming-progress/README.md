# Streaming Agent Progress — Genkit + AI Elements

Any sufficiently complex AI feature eventually becomes a multi‑step process. Fetching, enriching, analyzing, generating. Each step takes time. Each step has sub‑steps. Your users are staring at a spinner.

This pattern solves that. It gives every long‑running app‑controlled flow a live window — a recursive, streaming UI that shows exactly what the agent is doing at every level of nesting, updates in real time, and requires zero frontend changes when your flow evolves.

**What's different in this version:** the UI is built on [Vercel's AI Elements](https://elements.ai-sdk.dev). The chunk taxonomy is untouched — the backend still emits the same SSE stream — but the hand‑rolled subflow renderer, tool pills, and artifact pane have been replaced with `Plan`, `Task`, `Tool`, `Reasoning`, and `Artifact` components. You get accessibility, theming, and polish for free, and the example becomes a showcase for Genkit + AI Elements.

---

## The core idea

Your flow emits typed chunks over SSE. The frontend builds a tree from those chunks and renders it recursively. The UI contract is a single JSON convention — not a framework, not a dependency. Own it, modify it, ship it.

```
{"type": "reasoning", "content": "The user wants leads matching..."}
{"type": "subflow", "name": "search_leads", "status": "started", "label": "Searching..."}
{"type": "tool_call", "id": "tc-1", "tool": "web_search", "input": {"query": "..."}}
{"type": "tool_result", "id": "tc-1", "tool": "web_search", "preview": "Found 8 companies", "output": {...}}
{"type": "subflow", "name": "search_leads", "status": "done", "label": "Found 8 companies"}
{"type": "subflow", "name": "enrich_acme", "parent": "enrich_profiles", "status": "started", "label": "Looking up Acme Corp..."}
{"type": "artifact", "id": "output", "title": "Results", "content": "## Acme Corp\n", "mode": "append"}
{"type": "done"}
```

The `parent` field is the only thing that makes nesting work. A chunk with no parent is a root step. A chunk with `parent: "enrich_profiles"` attaches to that node. The UI recurses as deep as your flow goes — no depth limit, no UI changes required when you add new steps or restructure your flow.

---

## The UX (AI Elements mapping)

Every chunk type maps to a purpose-built component:

| Chunk type       | AI Elements component                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| Top-level summary| `Queue` + `QueueSection` — "In progress" / "Completed" sections                 |
| `reasoning`      | `Reasoning` + `ReasoningTrigger` + `ReasoningContent` (auto-collapses when done)|
| `subflow` (root) | `Plan` + `PlanContent` → recursive `Task` + `TaskTrigger` + `TaskContent`       |
| `subflow` (child)| Nested `Task` inside parent `TaskContent`                                       |
| `tool_call`      | `Tool` + `ToolHeader` + `ToolInput` (state: `input-available`)                  |
| `tool_result`    | Same `Tool` card, transitioned to `output-available` with `ToolOutput`          |
| `artifact`       | `Artifact` + `MessageResponse` (streamed markdown via Streamdown)               |
| `done`           | Closes the stream; artifact keeps final state                                   |
| Initial input    | `PromptInput` + `Suggestions` (suggestion chips for example targets)            |
| Overall shell    | `Conversation` + `ConversationContent` + `Message`                              |

Nothing in the Genkit SDK knows about any of this — `ctx.send_chunk()` (or raw SSE, as here) passes any dict through untouched. The parent/child relationship is your convention, enforced by your flow code, rendered by AI Elements.

---

## Recursive subflows

The frontend builds a tree, not a flat list. The page's `SubflowTask` component renders its children recursively — each child is a visually identical `Task` one level deeper. Your flow hierarchy maps directly to your UI hierarchy, always, regardless of depth.

```
research_flow
├── search_leads          ✓ Found 8 companies            [Tool: web_search ✓]
├── enrich_profiles       ✓ Profiles enriched
│   ├── enrich_acme       ✓ Series A, 45 employees      [Tool: enrich_company ✓]
│   ├── enrich_beacon     ✓ Series A, 60 employees      [Tool: enrich_company ✓]
│   └── enrich_cascade    ✓ Series B, 80 employees      [Tool: enrich_company ✓]
├── score_leads           ✓ Leads ranked by fit         [Tool: score_icp ✓]
└── draft_outreach        ● Drafting...  (active)       [artifact streaming]
```

Add a new subflow tomorrow — emit the chunk with the right `parent`, done. No UI changes ever.

---

## Why AI Elements?

Compared to the hand‑rolled version from earlier iterations of this pattern:

- **Half the frontend code.** The custom `SubflowRow`, tool pills, checkmark animations, and artifact pane are replaced by imports. The tree builder stays.
- **Better polish for free.** `Tool` shows a proper status badge (Pending / Running / Completed / Error), collapsible parameters + result JSON, shadcn/ui styling, and keyboard/ARIA behavior out of the box.
- **Same ethos.** AI Elements is distributed like shadcn — `npx ai-elements@latest add <component>` copies source into your repo. No hidden framework. Own it, modify it, ship it.
- **You don't need `useChat`.** This is an app‑controlled flow (not a pure model stream), so the AI SDK's UI message protocol is the wrong shape. Keep your SSE reader, feed chunks to components as props. AI Elements works fine that way — the components don't assume `useChat`.

---

## Run locally

**Backend** — requires a Google AI API key for the streaming outreach artifact:

```bash
cd backend
export GOOGLE_API_KEY="your-key"
uv run python src/main.py     # starts on :8000
```

**Frontend** — Next.js 16, React 19, Tailwind 4:

```bash
cd frontend
npm install
npm run dev                    # starts on :3000
```

Open <http://localhost:3000>, describe a target customer (or click one of the suggestion chips), and watch the flow stream:

1. **Reasoning** card streams the model's plan of attack.
2. **Queue** overview shows top‑level steps split into In progress / Completed.
3. **Plan** card unfolds each top‑level step into a recursive `Task` tree with expandable `Tool` cards showing parameters and results.
4. **Artifact** card streams the final markdown outreach drafts from `ai.generate_stream`.

---

## Extend this

- **Swap the model or provider.** The only AI call is `ai.generate_stream(prompt=...)` in `backend/src/main.py`. Swap in any Genkit plugin.
- **Add real tools.** Replace the mock `asyncio.sleep` with Apollo.io for enrichment, Apify for scraping, LinkedIn for profiles. The chunk shape doesn't change.
- **Error states.** Emit `{"type": "tool_result", "id": "...", "error": "..."}` and the `Tool` card switches to the red `Error` state automatically.
- **Cancellation.** Pass an `AbortController` signal to the fetch call in `useAgentStream`. On abort, the backend detects a disconnected client and stops the generator.
- **Model‑driven flows.** Replace the deterministic sequence with `ai.generate()` + tools. Capture tool calls from the model response and emit them as `tool_call` chunks — the UI renders exactly the same.

---

## Adding new AI Elements components

Only the components actually used by this example are installed. To add more:

```bash
cd frontend
npx ai-elements@latest add chain-of-thought confirmation checkpoint
```

Everything lands in `src/components/ai-elements/*.tsx` as source you own.

---

## Point your agent

> "Look at <https://github.com/jeffdh5/agentic-ux-patterns/tree/main/patterns/04-streaming-progress> and add streaming progress to my [flow name] flow. My steps are: [step 1], [step 2], [step 3]. Step 2 has sub‑steps for each [item]."

The agent reads the chunk taxonomy from `backend/src/main.py`, the view‑model builder from `frontend/src/hooks/useAgentStream.ts`, and the component mapping from `frontend/app/page.tsx`, then wires it into your specific flow.
