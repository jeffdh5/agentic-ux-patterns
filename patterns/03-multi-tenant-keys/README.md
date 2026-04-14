# Multi-tenant API Keys — Bring Your Own Key

Imagine you're building **LeadFlow** — an agentic SaaS where sales teams connect their CRM, describe their ideal customer profile, and an AI agent goes out and finds targeted leads. Some of your power users want to use their own Gemini API key. Others want to choose which model their agent runs on — Gemini Flash for speed, Gemini Pro for quality. You want to support both without managing a vault of customer keys or rebuilding your backend per user.

This pattern shows how to do it in ~10 lines of backend code.

---

## The pattern

The key insight: Genkit's `ai.generate()` accepts a `config` dict that overrides the plugin's default API key for that call only. One global `Genkit` instance, no shared key risk, no per-request overhead.

**Backend — the whole pattern:**

```python
# One global Genkit instance — no API key at startup
ai = Genkit(plugins=[GoogleAI()], model="googleai/gemini-2.0-flash")

@app.post("/flow/chat")
@genkit_fastapi_handler(ai)
@ai.flow()
async def chat(input: ChatInput, ctx: ActionRunContext) -> str:
    sr = ai.generate_stream(
        prompt=input.question,
        config={
            "api_key": input.api_key,   # ← user's key, per-request
            # "model": input.model,     # ← optionally let user pick model too
        }
    )
    async for chunk in sr.stream:
        if chunk.text:
            ctx.send_chunk(chunk.text)
```

Genkit creates a temporary client for that call. The key is used once and discarded. Nothing is stored server-side.

**Frontend — one line different from the basic streaming pattern:**

```ts
const res = await fetch(api, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,  // ← from localStorage, never from your DB
    },
    body: JSON.stringify({ data: { question, api_key: apiKey } }),
});
```

---

## When to use this

- **BYOK features** — power users want cost control or want to use their own quota
- **Model selection** — let users choose Gemini Flash vs Pro based on their subscription tier
- **Per-user rate limiting** — each user's key has its own quota; no shared exhaustion
- **Regulated industries** — some enterprise customers won't send data through a shared key
- **White-label SaaS** — your product, their API credentials

---

## Security note

The API key lives in the user's browser (`localStorage`) and travels as an HTTP header. It is never logged, stored in a database, or persisted server-side. Your server is stateless with respect to keys — it receives one per request, uses it, and forgets it.

For production: use HTTPS (always), consider masking the key in logs, and add rate limiting per key on your API layer.

---

## Extend this

**Add model selection:** Add a `model: str` field to `ChatInput`, pass it as `config={"api_key": ..., "model": input.model}`. Your UI renders a model picker. Your backend runs whatever model the user chose.

**Add key validation:** Before running the flow, make a lightweight test call with the user's key and return a clear error if it's invalid. Better UX than a cryptic stream failure.

Tell your coding agent:
> "Look at https://github.com/jeffdh5/agentic-ux-patterns/tree/main/patterns/03-multi-tenant-keys and add bring-your-own-key support to my application."

---

## Run locally

**Backend:**
```bash
cd backend
uv run python src/main.py
# No GOOGLE_API_KEY needed — keys come from users
```

**Frontend:**
```bash
cd frontend
npm install && npm run dev
```

Open http://localhost:3000, enter a Gemini API key, start chatting.

---

## Deploy to Cloud Run

**Backend Dockerfile:**
```dockerfile
FROM python:3.14-slim
WORKDIR /app
COPY . .
RUN pip install uv && uv sync
EXPOSE 8080
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

```bash
gcloud run deploy leadflow-backend \
  --source ./backend \
  --port 8080 \
  --allow-unauthenticated
  # No --set-secrets needed — no server-side API key
```

**Frontend:** same as pattern 01, set `NEXT_PUBLIC_BACKEND_URL` to your Cloud Run URL.
