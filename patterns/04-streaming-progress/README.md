# Streaming Agent Progress — Live Updates for App-Controlled Flows

Background agents hide everything until done. This pattern is the opposite.

When YOUR code controls the flow sequence (not the model), you can emit precise typed chunks at each step. The user sees exactly what the agent is doing, not a spinner.

## The Pattern

This pattern demonstrates how to stream typed progress updates from a multi-step agent workflow. Instead of showing a generic loading spinner, it surfaces what's happening at each stage through structured event chunks.

### Chunk Taxonomy

The backend emits seven types of SSE chunks:

```typescript
// 1. Subflow lifecycle — marks major orchestration steps
{"type": "subflow", "name": "search_leads", "status": "started", "label": "Searching for leads..."}
{"type": "subflow", "name": "search_leads", "status": "done", "label": "Found 8 companies"}

// 2. Tool calls — discrete actions within a subflow
{"type": "tool_call", "tool": "web_search", "input": {"query": "B2B SaaS founders Chicago Series A 2024"}}

// 3. Tool results — outcomes of tool executions
{"type": "tool_result", "tool": "web_search", "preview": "Found 8 matching companies"}

// 4. Artifact streaming — the durable output, streamed incrementally
{"type": "artifact", "id": "leads-report", "title": "Lead Report", "content": "## Acme Corp\n", "mode": "append"}
{"type": "artifact", "id": "leads-report", "title": "Lead Report", "content": "**Score: 92/100**\n", "mode": "append"}

// 5. Done signal
{"type": "done"}
```

**Why typed chunks beat plain text:**
- Frontend can render different UI for different event types (timeline vs artifact)
- Events can be filtered, grouped, or replayed
- Type safety across the stack
- Clear separation between process state (subflows, tools) and output (artifact)

**SSE format:** Each chunk is sent as `data: {json}\n\n`

## Two-Panel UX

The UI separates ephemeral process state from durable output:

**Left Panel (Event Timeline):**
- Shows what's happening right now
- Subflows: started → done lifecycle with spinners/checkmarks
- Tool calls: indented under their parent subflow
- Tool results: preview of what each tool returned
- Auto-scrolls as new events arrive

**Right Panel (Artifact):**
- Shows the final deliverable as it's being created
- Streams in character-by-character (or chunk-by-chunk)
- Persists after the flow completes
- This is what the user came for

**Why separate them?** The timeline is diagnostic — it helps users understand what's taking time and builds trust. The artifact is the actual result. Different purposes, different UI treatment.

## Subflows vs Tool Calls

**Subflows** are YOUR orchestration steps. You decide when they start and end. They represent logical phases of work:
- `search_leads` — find potential companies
- `enrich_profiles` — gather detailed info
- `score_leads` — rank by fit
- `draft_outreach` — generate personalized messages

You control the timing, sequence, and labels. This is app-controlled flow.

**Tool calls** are discrete actions within a subflow. They can be:
- Actual LLM tool calls (if you use `ai.generate()` with tools)
- Simulated tool calls (hardcoded in your flow for demonstration)
- Real API calls to external services

The key: subflows are orchestration boundaries. Tool calls are execution steps.

Both surface to the user, but differently:
- Subflows get prominent icons, status badges, and position in the timeline
- Tool calls are nested details, shown in muted text

## Run Locally

### Backend

```bash
cd patterns/04-streaming-progress/backend
uv venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv pip install -e .
export GOOGLE_GENAI_API_KEY="your-key-here"
python src/main.py
```

Backend runs on `http://localhost:8000`

### Frontend

```bash
cd patterns/04-streaming-progress/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

### Usage

1. Open `http://localhost:3000`
2. Enter a target customer description (e.g., "B2B SaaS founders in Chicago who raised Series A in 2024")
3. Click "Find Leads"
4. Watch the timeline populate on the left as each subflow executes
5. See the outreach drafts stream in on the right

## Extend This

### Add Real Tool Integrations

Replace the simulated tool calls with real APIs:
- [Apify](https://apify.com/) for LinkedIn scraping
- [Apollo.io](https://www.apollo.io/) for contact enrichment
- [Clearbit](https://clearbit.com/) for company data

### Add Cancellation

Use `AbortController` to let users stop a running flow:

```typescript
const controller = new AbortController();
fetch("http://localhost:8000/flow/research", {
  signal: controller.signal,
  // ...
});

// Later:
controller.abort();
```

### Case 2: Model-Controlled Flow

This pattern shows app-controlled flow (you write the sequence). For model-controlled flow (the LLM decides what tools to call), replace the deterministic sequence with:

```python
@ai.prompt
def research_agent(target: str):
    """
    You are a lead research agent. Given a target customer description,
    search for leads, enrich profiles, score them, and draft outreach.

    Target: {target}
    """

# Then stream the agent's tool calls
sr = ai.generate_stream(prompt=research_agent, tools=[web_search, enrich, score])
```

You'll need to adapt the chunk emission to fire on LLM tool call events rather than your hardcoded sequence.

## Key Takeaways

1. **Typed chunks > plain text** — structure enables better UX
2. **Timeline ≠ Artifact** — process state and output are different things
3. **Subflows = orchestration, Tools = execution** — both matter to users
4. **App-controlled flows can be precise** — when you know the sequence, surface it
5. **SSE is simple** — `data: {json}\n\n` is all you need

This pattern works best when:
- You control the flow sequence (not the model)
- The flow has 3+ distinct steps
- Users care about intermediate progress (not just the final result)
- You want to build trust by showing your work

For model-controlled flows with unpredictable tool sequences, adapt the chunk emission logic but keep the two-panel UX concept.
