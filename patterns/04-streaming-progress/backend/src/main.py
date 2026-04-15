import asyncio
import json
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from genkit import Genkit
from genkit.plugins.google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model="googleai/gemini-2.0-flash")
app = FastAPI()

# CORS for localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchInput(BaseModel):
    target: str  # e.g. "B2B SaaS founders in Chicago who raised Series A"


def chunk(**kwargs) -> str:
    """Format a chunk as SSE data."""
    return f"data: {json.dumps(kwargs)}\n\n"


@app.post("/flow/research")
async def research(body: ResearchInput):
    async def run() -> AsyncGenerator[str, None]:
        # Subflow 1: search_leads
        yield chunk(
            type="subflow",
            name="search_leads",
            status="started",
            label="Searching for leads...",
        )
        yield chunk(
            type="tool_call",
            tool="web_search",
            input={"query": f"{body.target} site:linkedin.com"},
        )
        await asyncio.sleep(0.8)
        leads = [
            "Acme Corp",
            "Beacon AI",
            "Cascade Labs",
            "Drift Systems",
            "Echo Health",
        ]
        yield chunk(
            type="tool_result",
            tool="web_search",
            preview=f"Found {len(leads)} matching companies",
        )
        yield chunk(
            type="subflow",
            name="search_leads",
            status="done",
            label=f"Found {len(leads)} companies",
        )

        # Subflow 2: enrich_profiles (parent flow)
        yield chunk(
            type="subflow",
            name="enrich_profiles",
            status="started",
            label="Enriching profiles...",
        )
        for lead in leads[:3]:
            # Child subflow for each lead — note parent field
            lead_key = lead.lower().replace(" ", "_")
            yield chunk(
                type="subflow",
                name=f"enrich_{lead_key}",
                parent="enrich_profiles",
                status="started",
                label=f"Enriching {lead}...",
            )
            yield chunk(type="tool_call", tool="enrich", input={"company": lead})
            await asyncio.sleep(0.3)
            yield chunk(
                type="tool_result",
                tool="enrich",
                preview=f"{lead}: 45 employees, $8M raised, Series A",
            )
            yield chunk(
                type="subflow",
                name=f"enrich_{lead_key}",
                parent="enrich_profiles",
                status="done",
                label=f"{lead} enriched",
            )
        yield chunk(
            type="subflow", name="enrich_profiles", status="done", label="Profiles enriched"
        )

        # Subflow 3: score_leads
        yield chunk(
            type="subflow",
            name="score_leads",
            status="started",
            label="Scoring against ICP...",
        )
        await asyncio.sleep(0.5)
        yield chunk(
            type="subflow",
            name="score_leads",
            status="done",
            label="Leads ranked by fit",
        )

        # Subflow 4: draft_outreach — streams artifact via ai.generate_stream
        yield chunk(
            type="subflow",
            name="draft_outreach",
            status="started",
            label="Drafting personalized outreach...",
        )
        prompt = f"Write a personalized first line for cold outreach to the top 3 B2B SaaS founders matching: {body.target}. Format as markdown with company name headers and a 1-2 sentence opener for each."
        sr = ai.generate_stream(prompt=prompt)
        async for model_chunk in sr.stream:
            if model_chunk.text:
                yield chunk(
                    type="artifact",
                    id="leads-report",
                    title="Outreach Drafts",
                    content=model_chunk.text,
                    mode="append",
                )
        yield chunk(
            type="subflow",
            name="draft_outreach",
            status="done",
            label="Outreach ready",
        )
        yield chunk(type="done")

    return StreamingResponse(run(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
