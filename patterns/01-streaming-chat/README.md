# Streaming Chat — Genkit Python + FastAPI + Next.js

A minimal streaming chat implementation that shows how to stream tokens from a Genkit Python flow through FastAPI's Server-Sent Events (SSE) to a Next.js frontend with shadcn/ui. The entire backend fits in ~40 lines of code, and the frontend uses a single custom hook to handle SSE streaming.

## The pattern

### Backend (Genkit Python + FastAPI)

```python
"""Genkit Python + FastAPI streaming starter."""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from genkit import Genkit, ActionRunContext
from genkit.plugins.fastapi import genkit_fastapi_handler
from genkit.plugins.google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model='googleai/gemini-2.0-flash')
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_methods=['POST'],
    allow_headers=['*'],
)


class ChatInput(BaseModel):
    question: str


@app.post('/flow/chat', response_model=None)
@genkit_fastapi_handler(ai)
@ai.flow()
async def chat(input: ChatInput, ctx: ActionRunContext) -> str:
    """Answer a question, streaming tokens as they arrive."""
    sr = ai.generate_stream(prompt=input.question)
    full = ''
    async for chunk in sr.stream:
        if chunk.text:
            ctx.send_chunk(chunk.text)
            full += chunk.text
    return full


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8080)
```

### Frontend hook (Next.js)

```typescript
import { useState, useCallback } from 'react';

interface UseGenkitStreamOptions {
  api: string;
}

interface UseGenkitStreamResult {
  output: string;
  loading: boolean;
  error: string | null;
  submit: (data: Record<string, unknown>) => Promise<void>;
}

export function useGenkitStream({ api }: UseGenkitStreamOptions): UseGenkitStreamResult {
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (data: Record<string, unknown>) => {
    setOutput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (typeof parsed === 'object' && 'result' in parsed) continue; // final result, skip
            if (typeof parsed === 'object' && 'message' in parsed) {
              setOutput(prev => prev + parsed.message);
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stream error');
    } finally {
      setLoading(false);
    }
  }, [api]);

  return { output, loading, error, submit };
}
```

## Deploy to Cloud Run

### Backend Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen

# Copy source code
COPY src/ ./src/

# Run the app
CMD ["uv", "run", "python", "src/main.py"]
```

Deploy backend:
```bash
gcloud run deploy genkit-streaming-backend \
  --source=./backend \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=8080 \
  --set-secrets=GOOGLE_API_KEY=GOOGLE_API_KEY:latest
```

### Frontend Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Run the app
CMD ["npm", "start"]
```

Deploy frontend:
```bash
gcloud run deploy genkit-streaming-frontend \
  --source=./frontend \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=3000 \
  --set-env-vars=NEXT_PUBLIC_API_URL=<your-backend-url>
```

**Note:** Set `GOOGLE_API_KEY` as a secret in Google Cloud Secret Manager before deploying the backend.

## Run locally

### Backend
```bash
cd backend
uv run python src/main.py
```

### Frontend
```bash
cd frontend
npm run dev
```

The backend will run on `http://localhost:8080` and the frontend on `http://localhost:3000`.

## Extend this

This pattern is the foundation for any streaming LLM application. Point your coding agent at this folder and describe what you want to add — multi-turn conversation history, tool calling with approval UI, or streaming structured outputs. The pattern stays minimal: Genkit handles the AI orchestration, FastAPI exposes SSE endpoints, and the frontend hook manages streaming state.
