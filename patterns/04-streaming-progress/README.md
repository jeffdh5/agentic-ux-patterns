# Streaming Agent Progress — Live Status from Multi-step Flows

Users abandon spinners. They watch progress bars.

When you click "Find Leads" in LeadFlow, the agent runs 4 steps: search for leads, analyze profiles, draft outreach, and finalize. Instead of showing a spinner for 10 seconds, you see live progress—each step lights up as the agent works through it, and text streams in real-time below. You know exactly what's happening and how far along it is.

This pattern shows how to stream two types of chunks from a multi-step agentic flow: **status events** (what step the agent is on) and **text tokens** (model output as it generates). The frontend renders them differently—status events update a step indicator, text tokens append to the output.

## The Pattern

### Backend: Two chunk types

Your FastAPI endpoint yields Server-Sent Events (SSE) with two distinct chunk types:

```python
# Status chunk: "I'm now on step 2 of 4"
yield f"data: {json.dumps({'type': 'status', 'status': '📊 Analyzing profiles...', 'step': 2, 'total': 4})}\n\n"

# Message chunk: streaming text from the model
yield f"data: {json.dumps({'type': 'message', 'message': 'token'})}\n\n"

# Done chunk: flow complete
yield f"data: {json.dumps({'type': 'done'})}\n\n"
```

The flow in `backend/src/main.py:27-62` simulates a 4-step agent:

```python
async def research_flow(topic: str) -> AsyncGenerator[str, None]:
    total_steps = 4

    # Step 1: Search
    yield f"data: {json.dumps({'type': 'status', 'status': '🔍 Searching...', 'step': 1, 'total': total_steps})}\n\n"
    await asyncio.sleep(0.5)  # simulate work
    for chunk in ["Found ", "15 ", "leads.\n"]:
        yield f"data: {json.dumps({'type': 'message', 'message': chunk})}\n\n"

    # Step 2: Analyze
    yield f"data: {json.dumps({'type': 'status', 'status': '📊 Analyzing...', 'step': 2, 'total': total_steps})}\n\n"
    # ... more chunks

    # Step 3: Draft (real AI streaming)
    yield f"data: {json.dumps({'type': 'status', 'status': '✍️ Drafting...', 'step': 3, 'total': total_steps})}\n\n"
    async for chunk in ai.generate_stream(prompt):
        yield f"data: {json.dumps({'type': 'message', 'message': chunk.text})}\n\n"

    # Step 4: Done
    yield f"data: {json.dumps({'type': 'status', 'status': '✅ Done', 'step': 4, 'total': total_steps})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"
```

### Frontend: Hook parses both chunk types

The `useAgentStream` hook in `frontend/src/hooks/useAgentStream.ts:15-94` reads the SSE stream and updates state based on chunk type:

```ts
const lines = chunk.split("\n");
for (const line of lines) {
  if (line.startsWith("data: ")) {
    const data = JSON.parse(line.slice(6));

    if (data.type === "status") {
      setState((prev) => ({
        ...prev,
        status: data.status,
        step: data.step,
        totalSteps: data.total,
      }));
    } else if (data.type === "message") {
      setState((prev) => ({
        ...prev,
        output: prev.output + data.message,
      }));
    } else if (data.type === "done") {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }
}
```

### Frontend: UI renders steps and output

The page in `frontend/src/app/page.tsx:45-85` renders a vertical step indicator:

- **✓ Completed** (green): steps before current step
- **→ Current** (blue, animated): the step the agent is currently on, with the live status text
- **○ Pending** (gray): steps not yet started

Below the steps, the output text streams in as `message` chunks arrive.

## Why This Matters

**Trust and perceived performance.** When users see a spinner, they wonder if something broke. When they see "Step 2 of 4: Analyzing profiles...", they know it's working and how long it might take.

**Transparency builds confidence.** Users are more patient when they understand what's happening. A progress indicator turns anxiety into anticipation.

**Better UX for long-running tasks.** Multi-step agent flows can take 10-30 seconds. Without progress indication, users abandon the page. With live status, they stick around.

## The Chunk Shape

All chunks follow the SSE format: `data: <JSON>\n\n`

### Status chunk
```json
{
  "type": "status",
  "status": "📊 Analyzing profiles...",
  "step": 2,
  "total": 4
}
```

Updates the step indicator UI. The frontend highlights the current step and shows the status text.

### Message chunk
```json
{
  "type": "message",
  "message": "token"
}
```

Appends text to the output. The frontend concatenates these tokens to build the full response.

### Done chunk
```json
{
  "type": "done"
}
```

Signals the end of the stream. The frontend sets `loading: false`.

## Run Locally

### Backend

```bash
cd patterns/04-streaming-progress/backend
export GOOGLE_API_KEY="your-key"
uv venv
uv pip install -e .
uv run python src/main.py
```

Backend runs on `http://localhost:8000`.

### Frontend

```bash
cd patterns/04-streaming-progress/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

Enter a topic like "B2B SaaS companies in healthcare" and click "Find Leads". Watch the steps light up and text stream in.

## Extend This

### Add estimated time per step

Include `estimatedSeconds` in the status chunk:

```json
{
  "type": "status",
  "status": "📊 Analyzing profiles...",
  "step": 2,
  "total": 4,
  "estimatedSeconds": 5
}
```

Show a countdown timer in the UI next to the current step.

### Add cancellation

Use an `AbortController` in the hook:

```ts
const abortController = new AbortController();
const response = await fetch(apiEndpoint, {
  signal: abortController.signal,
  // ...
});

// Cancel button calls:
abortController.abort();
```

On the backend, detect client disconnect and stop processing.

### Add retry on step failure

If a step fails, send an error chunk:

```json
{
  "type": "error",
  "step": 2,
  "message": "Failed to analyze profiles",
  "retryable": true
}
```

The frontend can show a "Retry Step 2" button that re-runs just that step.

### Add sub-steps

For complex steps, stream sub-progress:

```json
{
  "type": "status",
  "status": "📊 Analyzing profiles...",
  "step": 2,
  "total": 4,
  "subStep": 3,
  "subTotal": 10
}
```

Render a nested progress bar under the current step.

## Point Your Agent

**Prompt for building this pattern:**

> I have a multi-step agent flow that takes 10-30 seconds. Users see a spinner and wonder if it's stuck. I want to stream live progress updates—show which step the agent is on (e.g., "Step 2 of 4: Analyzing profiles...") and stream the text output as it generates.
>
> On the backend, use FastAPI with StreamingResponse and SSE. Yield two chunk types: `{"type": "status", "status": "...", "step": N, "total": N}` for step updates, and `{"type": "message", "message": "token"}` for text. End with `{"type": "done"}`.
>
> On the frontend, create a React hook that parses the SSE stream and maintains state for `status`, `step`, `totalSteps`, and `output`. Render a vertical step indicator with ✓ for completed, → for current (animated), and ○ for pending. Stream the text output below.
>
> The UX goal: users see exactly what the agent is doing and how far along it is, so they trust the process and stay engaged.
