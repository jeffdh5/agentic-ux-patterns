# Streaming Agent Progress — Live Updates for Long-running Agentic Flows

Any sufficiently complex AI feature eventually becomes a multi-step process. Fetching, enriching, analyzing, generating. Each step takes time. Each step has sub-steps. Your users are staring at a spinner.

This pattern solves that. It gives every long-running app-controlled flow a live window — a recursive, streaming UI that shows exactly what the agent is doing at every level of nesting, updates in real time, and requires zero frontend changes when your flow evolves.

---

## The core idea

Your flow emits typed chunks over SSE. The frontend builds a tree from those chunks and renders it recursively. The UI contract is a single JSON convention — not a framework, not a dependency. Own it, modify it, ship it.

```
{"type": "subflow", "name": "search_leads", "status": "started", "label": "Searching..."}
{"type": "tool_call", "tool": "web_search", "input": {...}}
{"type": "tool_result", "tool": "web_search", "preview": "Found 8 companies"}
{"type": "subflow", "name": "search_leads", "status": "done", "label": "Found 8 companies"}
{"type": "subflow", "name": "enrich_acme", "parent": "enrich_profiles", "status": "started", "label": "Looking up Acme Corp..."}
{"type": "artifact", "id": "output", "title": "Results", "content": "## Acme Corp\n", "mode": "append"}
{"type": "done"}
```

The `parent` field is the only thing that makes nesting work. A chunk with no parent is a root step. A chunk with `parent: "enrich_profiles"` attaches to that node. The UI recurses as deep as your flow goes — no depth limit, no UI changes required when you add new steps or restructure your flow.

---

## The UX

**Progress section (top)** — collapsible, Claude.ai style:
- One row per subflow: pending → active (spinner) → done (checkmark)
- Click to expand: reveals tool calls, tool results, and child subflows
- Child subflows render identically to parent subflows — same expand/collapse, just indented
- Active subflow stays expanded; completed subflows collapse automatically

**Artifact section (below)** — the primary output:
- Streams in as `artifact` chunks arrive
- This is what the user reads; progress is context

---

## Where this applies

LeadFlow (the demo) is just one instance. The pattern fits any long-running app-controlled flow:

| Domain | Top-level steps | Example child steps |
|--------|----------------|---------------------|
| Lead generation | Search → Enrich → Score → Draft | Enrich Acme Corp, Enrich Beacon AI |
| Code review | Analyze PR → Review files → Summarize | Review auth.py, Review api.py |
| Document processing | Ingest → Extract → Summarize → Compile | Summarize section 1, Summarize section 2 |
| Travel planning | Flights → Hotels → Availability → Itinerary | Check Marriott, Check Hilton |
| Data pipeline | Fetch → Validate → Transform → Load | Transform users table, Transform orders table |

Same chunk shape. Same parent convention. Same recursive UI. Zero frontend changes across all of them.

---

## The pattern — chunk taxonomy

```python
def chunk(**kwargs) -> str:
    return f"data: {json.dumps(kwargs)}\n\n"

# Start a top-level step
yield chunk(type="subflow", name="search_leads", status="started", label="Searching for leads...")

# Tool call within a step
yield chunk(type="tool_call", tool="web_search", input={"query": "..."})
yield chunk(type="tool_result", tool="web_search", preview="Found 8 companies")

# Finish a step
yield chunk(type="subflow", name="search_leads", status="done", label="Found 8 companies")

# Child subflow — attach to parent with parent field
yield chunk(type="subflow", name="enrich_acme", parent="enrich_profiles", status="started", label="Looking up Acme Corp...")

# Stream artifact content
yield chunk(type="artifact", id="output", title="Results", content="## Acme\n", mode="append")

# Signal completion
yield chunk(type="done")
```

The SDK is unaware of this structure. `ctx.send_chunk()` passes any dict through untouched. The parent/child relationship is your convention, enforced by your flow code, rendered by your UI.

---

## Recursive subflows

The frontend builds a tree, not a flat list. `SubflowRow` renders its children recursively — each child is visually identical to its parent, just indented one level. This means your flow hierarchy maps directly to your UI hierarchy, always, regardless of depth.

```
research_flow
├── search_leads          ✓ Found 8 companies
├── enrich_profiles       ✓ Profiles enriched
│   ├── enrich_acme       ✓ Series A, 45 employees
│   ├── enrich_beacon     ✓ Series A, 30 employees
│   └── enrich_cascade    ✓ Series B, 80 employees
├── score_leads           ✓ Leads ranked
└── draft_outreach        ● Drafting... (active)
```

Add a new subflow tomorrow — emit the chunk with the right `parent`, done. No UI changes ever.

---

## Run locally

**Backend:**
```bash
cd backend
export GOOGLE_API_KEY="your-key"
uv run python src/main.py
```

**Frontend:**
```bash
cd frontend
npm install && npm run dev
```

Open http://localhost:3000, describe a target customer, watch the flow run.

---

## Extend this

**Add real tools:** replace mock `asyncio.sleep` with actual API calls — Apollo.io for enrichment, Apify for scraping, LinkedIn for profiles.

**Add cancellation:** pass an `AbortController` signal to the fetch call. On abort, the backend detects a disconnected client and stops the generator.

**Add case 2 (model controls the flow):** replace the deterministic sequence with `ai.generate()` + tools. Capture tool calls from the model response and emit them as chunks. The UI renders exactly the same — it doesn't care who decided to call the tool.

---

## Point your agent

> "Look at https://github.com/jeffdh5/agentic-ux-patterns/tree/main/patterns/04-streaming-progress and add streaming progress to my [flow name] flow. My steps are: [step 1], [step 2], [step 3]. Step 2 has sub-steps for each [item]."

The agent reads the chunk taxonomy, understands the parent convention, and wires it into your specific flow.
