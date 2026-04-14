import asyncio
import json
import os
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from genkit import Genkit
from genkit.google_genai import GoogleAI
from pydantic import BaseModel


class ResearchRequest(BaseModel):
    topic: str


ai = Genkit(plugins=[GoogleAI()], model="googleai/gemini-2.0-flash")
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def research_flow(topic: str) -> AsyncGenerator[str, None]:
    total_steps = 4

    # Step 1: Search for leads
    yield f"data: {json.dumps({'type': 'status', 'status': f'🔍 Searching for leads on {topic}...', 'step': 1, 'total': total_steps})}\n\n"
    await asyncio.sleep(0.5)
    for chunk in ["Found ", "15 ", "potential ", "leads ", "in ", "SaaS ", "industry.\n"]:
        yield f"data: {json.dumps({'type': 'message', 'message': chunk})}\n\n"
        await asyncio.sleep(0.05)

    # Step 2: Analyze profiles
    yield f"data: {json.dumps({'type': 'status', 'status': '📊 Analyzing profiles...', 'step': 2, 'total': total_steps})}\n\n"
    await asyncio.sleep(0.5)
    for chunk in ["Analyzing ", "company ", "size, ", "tech ", "stack, ", "and ", "recent ", "activity...\n"]:
        yield f"data: {json.dumps({'type': 'message', 'message': chunk})}\n\n"
        await asyncio.sleep(0.05)

    # Step 3: Draft outreach (use real AI streaming)
    yield f"data: {json.dumps({'type': 'status', 'status': '✍️ Drafting outreach...', 'step': 3, 'total': total_steps})}\n\n"
    await asyncio.sleep(0.5)

    prompt = f"Write a brief, personalized cold email to a potential lead in the {topic} space. Keep it under 3 sentences."
    async for chunk in ai.generate_stream(prompt):
        if chunk.text:
            yield f"data: {json.dumps({'type': 'message', 'message': chunk.text})}\n\n"

    # Step 4: Done
    yield f"data: {json.dumps({'type': 'status', 'status': '✅ Done', 'step': 4, 'total': total_steps})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@app.post("/flow/research")
async def research(request: ResearchRequest):
    return StreamingResponse(
        research_flow(request.topic),
        media_type="text/event-stream",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
